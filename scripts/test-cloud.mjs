import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";

const name = `cinebook-cloud-test-${randomBytes(6).toString("hex")}`;
const volume = `${name}-data`;
const token = randomBytes(32).toString("hex");
const report = { startedAt: new Date().toISOString(), checks: [] };
let containerCreated = false;
let volumeCreated = false;
function docker(args, expected = 0, withToken = true) {
  const env = { ...process.env };
  if (withToken) env.METRICS_TOKEN = token;
  else delete env.METRICS_TOKEN;
  const result = spawnSync("docker", args, { env, encoding: "utf8", timeout: 90_000, windowsHide: true });
  assert.equal(result.status, expected, result.error?.message || result.stderr);
  return result.stdout;
}
async function check(name, action) {
  await action(); console.log(`PASS: ${name}`); report.checks.push({ name, status: "passed" });
}
const listener = createServer();
await new Promise((accept) => listener.listen(0, "127.0.0.1", accept));
const port = listener.address().port;
await new Promise((accept) => listener.close(accept));
const base = `http://127.0.0.1:${port}`;
async function call(path, { status = 200, ...options } = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, status, `Unexpected HTTP response for ${path.startsWith("/api/bookings/") ? "/api/bookings/:reference" : path}`);
  return response;
}
async function ready() {
  let last;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { return await call("/api/health"); } catch (error) { last = error; await delay(500); }
  }
  throw last;
}
function run() {
  docker(["run", "--detach", "--name", name, "--read-only", "--tmpfs", "/tmp",
    "--publish", `127.0.0.1:${port}:10000`, "--mount", `type=volume,source=${volume},target=/app/data`,
    "--env", "RENDER=true", "--env", "PORT=10000", "--env", "METRICS_TOKEN", "--env", "TRUST_PROXY=1", "cinebook:local"]);
  containerCreated = true;
}
try {
  await check("Render-style startup refuses SQLite on ephemeral storage", () => {
    const result = spawnSync("docker", ["run", "--rm", "--env", "RENDER=true", "--env", "METRICS_TOKEN", "cinebook:local"], {
      env: { ...process.env, METRICS_TOKEN: token }, encoding: "utf8", windowsHide: true, timeout: 60_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /disk is not mounted/);
  });
  await check("Only a new isolated cloud-test disk is created", () => {
    docker(["volume", "create", volume]); volumeCreated = true;
  });
  await check("Mounted-disk cloud startup refuses missing metrics authentication", () => {
    const result = spawnSync("docker", ["run", "--rm", "--mount", `type=volume,source=${volume},target=/app/data`,
      "--env", "RENDER=true", "cinebook:local"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /METRICS_TOKEN/);
  });
  await check("A non-root container starts with a mounted disk and PORT 10000", async () => {
    run(); await ready();
    const user = docker(["exec", name, "node", "-p", "String(process.getuid())"]).trim();
    assert.notEqual(user, "0");
    assert.equal((await (await call("/api/health")).json()).database, "connected");
  });
  await check("Cloud metrics reject anonymous requests and accept the private bearer token", async () => {
    await call("/metrics", { status: 401 });
    const metrics = await call("/metrics", { headers: { Authorization: `Bearer ${token}` } });
    assert.match(await metrics.text(), /cinebook_movies 10/);
  });
  let booking;
  let payload;
  await check("The production cloud configuration confirms and retains a real reservation", async () => {
    const { showtimes } = await (await call("/api/showtimes")).json();
    payload = { showtimeId: showtimes.at(-1).id, seats: ["F10"], customerName: "Cloud Test", customerEmail: "cloud@example.test" };
    ({ booking } = await (await call("/api/bookings", { status: 201, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json());
    docker(["restart", name]); await ready();
    assert.deepEqual((await (await call(`/api/bookings/${booking.reference}`)).json()).booking, booking);
    docker(["rm", "--force", name]); containerCreated = false;
    run(); await ready();
    assert.deepEqual((await (await call(`/api/bookings/${booking.reference}`)).json()).booking, booking);
    await call("/api/bookings", { status: 409, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  });
  await check("Online SQLite backup preserves the reservation and passes an integrity check", () => {
    const saved = JSON.parse(docker(["exec", name, "node", "server/backup.js"]));
    assert.equal(saved.event, "backup_completed"); assert.equal(saved.bookings, 1);
    const query = `const D=require('better-sqlite3');const d=new D(process.argv[1],{readonly:true});console.log(JSON.stringify({integrity:d.pragma('integrity_check',{simple:true}),n:d.prepare('SELECT COUNT(*) AS n FROM bookings').get().n}));d.close();`;
    const verified = JSON.parse(docker(["exec", name, "node", "-e", query, saved.file]));
    assert.deepEqual(verified, { integrity: "ok", n: 1 });
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = error.message; console.error(error.message); process.exitCode = 1;
} finally {
  assert.match(name, /^cinebook-cloud-test-[a-f0-9]{12}$/);
  if (containerCreated) docker(["rm", "--force", name]);
  if (volumeCreated) docker(["volume", "rm", volume]);
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.artifacts/cloud-test-results.json", import.meta.url), JSON.stringify(report, null, 2));
}
