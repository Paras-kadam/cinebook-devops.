import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

assert(process.env.LIVE_BASE_URL, "Set LIVE_BASE_URL to the actual Render HTTPS URL.");
const base = new URL(process.env.LIVE_BASE_URL);
assert.equal(base.protocol, "https:", "Live verification requires HTTPS.");
assert(!base.username && !base.password && !base.search && !base.hash, "Supply a public origin without credentials.");
const report = { origin: base.origin, checkedAt: new Date().toISOString(), checks: [] };
const stateFile = new URL("../.artifacts/live-booking-private.json", import.meta.url);
async function call(path, { status = 200, ...options } = {}) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin);
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, status, `Expected HTTP ${status} for ${path.startsWith("/api/bookings/") ? "/api/bookings/:reference" : url.pathname}`);
  return response;
}
async function check(name, action) {
  await action(); report.checks.push({ name, status: "passed" }); console.log(`PASS: ${name}`);
}
try {
  await check("HTTPS, production frontend, ten posters, API, seats and protected metrics", async () => {
    assert(process.env.METRICS_TOKEN, "Set METRICS_TOKEN privately to verify protected production metrics.");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./smoke.mjs", import.meta.url))], {
      env: { ...process.env, SMOKE_BASE_URL: base.origin }, stdio: "inherit", windowsHide: true,
    });
    assert.equal(result.status, 0, "Production smoke checks must pass");
  });
  if (process.env.LIVE_BOOKING_TEST === "true") {
    await check("A real demo booking is confirmed and competing bookings are rejected", async () => {
      const { showtimes } = await (await call("/api/showtimes")).json();
      let payload;
      for (const showtime of showtimes.toReversed()) {
        const map = await (await call(`/api/showtimes/${showtime.id}/seats`)).json();
        const seat = map.rows.flatMap((row) => Array.from({ length: map.seatsPerRow }, (_, i) => `${row}${i + 1}`))
          .find((value) => !map.bookedSeats.includes(value));
        if (seat) { payload = { showtimeId: showtime.id, seats: [seat], customerName: "Deployment Verification", customerEmail: "deployment@example.test" }; break; }
      }
      assert(payload, "A future demo seat must be available");
      const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
      const { booking } = await (await call("/api/bookings", { ...options, status: 201 })).json();
      assert.equal(booking.seats.length, 1);
      const duplicate = await (await call("/api/bookings", { ...options, status: 409 })).json();
      assert.equal(duplicate.code, "SEAT_UNAVAILABLE");
      await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
      await writeFile(stateFile, JSON.stringify({ origin: base.origin, booking, payload }, null, 2));
      console.log("Saved private booking evidence locally. Restart/redeploy the Render service, then run with LIVE_PERSISTENCE_TEST=true.");
    });
  }
  if (process.env.LIVE_PERSISTENCE_TEST === "true") {
    await check("Previously confirmed booking and seat reservation are still present", async () => {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      assert.equal(state.origin, base.origin, "Persistence evidence must be for this service");
      const saved = await (await call(`/api/bookings/${state.booking.reference}`)).json();
      assert.deepEqual(saved.booking, state.booking);
      await call("/api/bookings", { status: 409, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.payload) });
      report.persistenceNote = "Booking remains present. Confirm the intervening restart/redeploy in the Render event log.";
    });
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = error.message;
  console.error(error.message); process.exitCode = 1;
} finally {
  await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.artifacts/live-verification.json", import.meta.url), JSON.stringify(report, null, 2));
}
