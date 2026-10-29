import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { openTursoDatabase } from "../server/turso.js";
import { createApp } from "../server/app.js";

const name = `cinebook-turso-net-${randomBytes(6).toString("hex")}`;
const volume = `${name}-data`;
const report = { startedAt: new Date().toISOString(), checks: [] };
let containerCreated = false, volumeCreated = false, app, server, base;
const metricsToken = randomBytes(32).toString("hex");
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
async function check(name, action) {
  await action(); report.checks.push({ name, status: "passed" }); console.log(`PASS: ${name}`);
}
const listener = createServer();
await new Promise((accept) => listener.listen(0, "127.0.0.1", accept));
const port = listener.address().port;
await new Promise((accept) => listener.close(accept));
const databaseURL = `http://127.0.0.1:${port}`;
async function openApp() {
  let database;
  let last;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { database = await openTursoDatabase({ url: databaseURL, allowLocal: true }); break; }
    catch (error) { last = error; await delay(500); }
  }
  if (!database) throw last;
  // HTTP is allowed only for this explicit loopback test. Production requires TLS.
  app = createApp({ database, serveClient: true, metricsToken, requireMetricsAuth: true });
  await new Promise((accept) => { server = app.listen(0, "127.0.0.1", accept); });
  base = `http://127.0.0.1:${server.address().port}`;
}
async function closeApp() {
  if (server?.listening) {
    server.closeAllConnections(); await new Promise((accept) => server.close(accept));
  }
  if (app?.locals.db.open) app.locals.db.close();
}
async function call(path, { status = 200, ...options } = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, status, `Unexpected HTTP status for ${path.startsWith("/api/bookings/") ? "/api/bookings/:reference" : path}`);
  return response;
}
let booking, payload;
async function verifyReservation() {
  const saved = await (await call(`/api/bookings/${booking.reference}`)).json();
  assert.deepEqual(saved.booking, booking);
  const duplicate = await (await call("/api/bookings", { status: 409, method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json();
  assert.equal(duplicate.code, "SEAT_UNAVAILABLE");
}
try {
  await check("An isolated official libSQL server starts with its own persistent test volume", async () => {
    docker(["volume", "create", volume]); volumeCreated = true;
    docker(["run", "--detach", "--name", name, "--publish", `127.0.0.1:${port}:8080`,
      "--mount", `type=volume,source=${volume},target=/var/lib/sqld`, "--env", "SQLD_NODE=primary",
      "ghcr.io/tursodatabase/libsql-server@sha256:6dd3eb276d9d3604e4a48ac4a999a2e267814732d57d7e94c04ba71482333a67"]);
    containerCreated = true;
    await openApp();
  });
  await check("The async API uses the real HTTP database protocol and serves the production website", async () => {
    assert.equal((await (await call("/api/health")).json()).database, "connected");
    assert.match(await (await call("/")).text(), /CineBook/);
    const { movies } = await (await call("/api/movies")).json();
    assert.equal(movies.length, 10);
    for (const movie of movies) assert.match(await (await call(movie.poster)).text(), /<svg/);
    await call("/metrics", { status: 401 });
    assert.match(await (await call("/metrics", { headers: { Authorization: `Bearer ${metricsToken}` } })).text(), /cinebook_movies 10/);
  });
  await check("A remote write transaction commits two seats with server pricing and rejects duplicates", async () => {
    const { showtimes } = await (await call("/api/showtimes")).json();
    const showtime = showtimes.at(-1);
    payload = { showtimeId: showtime.id, seats: ["C4", "C5"], customerName: "Network Test", customerEmail: "network@example.test", total: 1 };
    ({ booking } = await (await call("/api/bookings", { status: 201, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json());
    assert.equal(booking.total, showtime.price * 2);
    await verifyReservation();
    const partial = { ...payload, seats: ["C3", "C4"] };
    await call("/api/bookings", { status: 409, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partial) });
    const seats = await (await call(`/api/showtimes/${showtime.id}/seats`)).json();
    assert.deepEqual(seats.bookedSeats, ["C4", "C5"]);
  });
  await check("The remote protocol commits the maximum sixty-seat reservation in one seat-write batch", async () => {
    const { showtimes } = await (await call("/api/showtimes")).json();
    const showtime = showtimes.at(-2);
    const seats = ["A", "B", "C", "D", "E", "F"].flatMap((row) => Array.from({ length: 10 }, (_, i) => `${row}${i + 1}`));
    const { booking: large } = await (await call("/api/bookings", { status: 201, method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, showtimeId: showtime.id, seats }) })).json();
    assert.deepEqual(large.seats, seats);
    assert.equal(large.total, showtime.price * 60);
    assert.deepEqual((await (await call(`/api/showtimes/${showtime.id}/seats`)).json()).bookedSeats, seats);
  });
  await check("Remote bookings survive destroying and recreating the application instance", async () => {
    await closeApp(); await openApp(); await verifyReservation();
  });
  await check("Remote bookings survive restarting the separate database container", async () => {
    await closeApp(); docker(["restart", name]); await openApp(); await verifyReservation();
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = error.message;
  console.error(error.message); process.exitCode = 1;
} finally {
  await closeApp();
  assert.match(name, /^cinebook-turso-net-[a-f0-9]{12}$/);
  if (containerCreated) docker(["rm", "--force", name]);
  if (volumeCreated) docker(["volume", "rm", volume]);
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.artifacts/turso-network-results.json", import.meta.url), JSON.stringify(report, null, 2));
}
