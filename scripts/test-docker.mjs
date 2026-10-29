import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Use a fresh project and volume: never make test bookings in the user's app.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = `cinebook-test-${randomBytes(6).toString("hex")}`;
const artifacts = resolve(root, ".artifacts");
const results = { startedAt: new Date().toISOString(), project, checks: [] };
let composeEnvironment;
let baseURL;
let projectStarted = false;
let failed = false;

function docker(args, { timeout = 120_000 } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: composeEnvironment || process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim();
    throw new Error(`Docker command failed: ${detail || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

function compose(args, options) {
  return docker([
    "compose", "--project-name", project, "--file", resolve(root, "compose.yaml"),
    ...args,
  ], options);
}

async function check(name, action) {
  const started = performance.now();
  try {
    await action();
    results.checks.push({ name, status: "passed", durationMs: Math.round(performance.now() - started) });
    console.log(`PASS: ${name}`);
  } catch (error) {
    results.checks.push({ name, status: "failed", message: error.message });
    throw error;
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, accept);
  });
  const { port } = server.address();
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return port;
}

async function request(path, { status = 200, ...options } = {}) {
  const url = new URL(path, baseURL);
  assert.equal(url.origin, baseURL.origin, "Checks must stay on the application origin");
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, status, `${url.pathname} must return HTTP ${status}`);
  return response;
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  let lastError;
  do {
    try {
      const health = await (await request("/api/health")).json();
      assert.deepEqual(health, { status: "ok", database: "connected" });
      return;
    } catch (error) {
      lastError = error;
      await delay(400);
    }
  } while (Date.now() < deadline);
  throw new Error(`Application did not become healthy: ${lastError.message}`);
}

try {
  await check("Docker Desktop is available in Linux container mode", () => {
    assert.equal(docker(["info", "--format", "{{.OSType}}"]), "linux");
    docker(["compose", "version"]);
  });

  const port = await freePort();
  composeEnvironment = {
    ...process.env,
    COMPOSE_PROJECT_NAME: project,
    APP_PORT: String(port),
    // App-only verification never starts Grafana, but Compose validates all variables.
    GF_SECURITY_ADMIN_USER: "isolated-docker-test",
    GF_SECURITY_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  };
  baseURL = new URL(`http://127.0.0.1:${port}`);
  results.baseURL = baseURL.origin;
  console.log(`Testing isolated Compose project ${project} at ${baseURL.origin}`);
  console.log("The production image must already be built with: docker compose build app");

  await check("Compose app starts and passes its healthcheck", async () => {
    const configuration = JSON.parse(compose(["config", "--format", "json"]));
    assert(configuration.services.app, "Compose must define a service named app");
    assert(configuration.services.app.image, "Compose app must have an explicit reusable image name");
    projectStarted = true;
    compose(["up", "--detach", "--no-build", "--wait", "--wait-timeout", "90", "app"]);
    await waitForHealth();
  });

  let volumeName;
  await check("SQLite is mounted in a named volume", () => {
    const containerId = compose(["ps", "--quiet", "app"]);
    const [container] = JSON.parse(docker(["inspect", containerId]));
    const dataMount = container.Mounts.find((mount) => mount.Destination === "/app/data");
    assert.equal(dataMount?.Type, "volume", "/app/data must use a named volume");
    assert(dataMount.Name.startsWith(`${project}_`), "The test volume must belong to its isolated project");
    assert.equal(dataMount.RW, true, "The database volume must be writable");
    assert.equal(container.HostConfig.ReadonlyRootfs, true, "The application filesystem must be read-only");
    volumeName = dataMount.Name;
    results.volume = volumeName;
    assert.equal(container.State.Health?.Status, "healthy");
  });

  await check("Image uses Node 24, a non-root user and Linux-native SQLite without dev dependencies or local data", () => {
    const imageId = compose(["images", "--quiet", "app"]);
    assert(imageId && !imageId.includes("\n"), "Exactly one application image is expected");
    const inspectRuntime = `
      const fs = require('node:fs');
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      const sqlite = db.prepare('SELECT sqlite_version() AS version').get().version;
      db.close();
      let viteInstalled = false;
      try { require.resolve('vite'); viteInstalled = true; } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
      }
      const unwanted = [];
      function scan(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.name === 'node_modules') continue;
          const filename = path.join(directory, entry.name);
          if (entry.isDirectory()) scan(filename);
          else if (/^\\.env(?:\\.|$)/.test(entry.name) || /\\.(?:sqlite(?:3)?|db)(?:-wal|-shm)?$/i.test(entry.name)) unwanted.push(filename);
        }
      }
      scan('/app');
      console.log(JSON.stringify({ node: process.versions.node, uid: process.getuid(), platform: process.platform,
        nodeEnv: process.env.NODE_ENV, port: process.env.PORT, sqlite, viteInstalled, unwanted }));
    `;
    const runtime = JSON.parse(docker([
      "run", "--rm", "--network", "none", "--read-only", "--entrypoint", "node", imageId,
      "--input-type=commonjs", "-e", inspectRuntime,
    ]));
    assert.match(runtime.node, /^24\./);
    assert.notEqual(runtime.uid, 0, "The image must run as a non-root user");
    assert.equal(runtime.platform, "linux");
    assert.equal(runtime.nodeEnv, "production");
    assert.equal(runtime.port, "3000");
    assert.equal(runtime.viteInstalled, false, "Vite must not be installed in the production image");
    assert.deepEqual(runtime.unwanted, [], "The image must not contain .env files or copied SQLite databases");
    results.runtime = runtime;
  });

  let movies;
  await check("Express serves the built React page, JavaScript, CSS and ten local posters", async () => {
    const homepage = await request("/");
    assert.match(homepage.headers.get("content-type") || "", /text\/html/);
    const html = await homepage.text();
    assert.match(html, /CineBook/);
    assert.doesNotMatch(html, /@vite\/client|\/src\/main/);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map((match) => match[1]);
    assert(assets.some((asset) => asset.endsWith(".js")), "Built JavaScript must be linked");
    assert(assets.some((asset) => asset.endsWith(".css")), "Built CSS must be linked");
    for (const asset of new Set(assets)) {
      const response = await request(asset);
      assert.match(response.headers.get("content-type") || "", asset.endsWith(".css") ? /text\/css/ : /javascript/);
      assert((await response.text()).length > 0, "Built assets must not be empty");
    }
    ({ movies } = await (await request("/api/movies")).json());
    assert.equal(movies.length, 10);
    for (const movie of movies) {
      const poster = await request(movie.poster);
      assert.match(poster.headers.get("content-type") || "", /image\/svg\+xml/);
      assert.match(await poster.text(), /<svg\b/);
    }
  });

  let booking;
  let showtime;
  let seats;
  let bookingPayload;
  await check("A real two-seat booking is confirmed with a server-calculated total", async () => {
    const { showtimes } = await (await request(`/api/movies/${movies[0].id}/showtimes`)).json();
    // Pick a later showtime so the reservation cannot expire during this test.
    showtime = showtimes.at(-1);
    assert(showtime, "The demo catalogue must include future showtimes");
    const seatMap = await (await request(`/api/showtimes/${showtime.id}/seats`)).json();
    seats = seatMap.rows.flatMap((row) => Array.from({ length: seatMap.seatsPerRow }, (_, index) => `${row}${index + 1}`))
      .filter((seat) => !seatMap.bookedSeats.includes(seat)).slice(0, 2);
    assert.equal(seats.length, 2);
    bookingPayload = { showtimeId: showtime.id, seats, customerName: "Docker Verification", customerEmail: "docker-test@example.test", total: 1 };
    ({ booking } = await (await request("/api/bookings", {
      status: 201,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingPayload),
    })).json());
    assert.match(booking.reference, /^CB-[A-F0-9]{24}$/);
    assert.deepEqual(booking.seats, seats);
    assert.equal(booking.unitPrice, seatMap.price);
    assert.equal(booking.total, seatMap.price * seats.length);
    results.booking = { reference: booking.reference, seats, total: booking.total };
  });

  async function assertReservation() {
    await waitForHealth();
    const saved = await (await request(`/api/bookings/${booking.reference}`)).json();
    assert.deepEqual(saved.booking, booking, "The complete confirmed booking must persist");
    const map = await (await request(`/api/showtimes/${showtime.id}/seats`)).json();
    for (const seat of seats) assert(map.bookedSeats.includes(seat), `${seat} must remain booked`);
    const duplicate = await (await request("/api/bookings", {
      status: 409,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingPayload),
    })).json();
    assert.equal(duplicate.code, "SEAT_UNAVAILABLE");
  }

  await check("Duplicate-seat booking is rejected with HTTP 409", assertReservation);
  await check("Confirmed booking and unavailable seats survive a container restart", async () => {
    compose(["restart", "--timeout", "15", "app"]);
    await assertReservation();
  });
  await check("Confirmed booking and unavailable seats survive container replacement", async () => {
    compose(["up", "--detach", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "90", "app"]);
    await assertReservation();
  });
  await check("Named-volume bookings survive Compose down followed by up", async () => {
    compose(["down", "--timeout", "15"]);
    docker(["volume", "inspect", volumeName]);
    compose(["up", "--detach", "--no-build", "--wait", "--wait-timeout", "90", "app"]);
    await assertReservation();
  });
} catch (error) {
  failed = true;
  results.error = error.message;
  console.error(`Docker verification failed: ${error.message}`);
  if (projectStarted) {
    try {
      const logs = compose(["logs", "--no-color", "--tail", "80", "app"]);
      results.logs = logs;
      console.error(logs);
    } catch (logError) {
      console.error(`Could not read test-container logs: ${logError.message}`);
    }
  }
} finally {
  if (projectStarted) {
    try {
      await check("Only the isolated test project and its test volume are removed", () => {
        assert.match(project, /^cinebook-test-[a-f0-9]{12}$/);
        compose(["down", "--volumes", "--remove-orphans", "--timeout", "15"]);
      });
    } catch (error) {
      failed = true;
      console.error(`Test cleanup failed: ${error.message}`);
    }
  }
  results.finishedAt = new Date().toISOString();
  results.status = failed ? "failed" : "passed";
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, "docker-test-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Docker verification ${results.status}. Results: .artifacts/docker-test-results.json`);
  if (failed) process.exitCode = 1;
}
