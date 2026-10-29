import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { openTursoDatabase, validateTursoSettings } from "../server/turso.js";
import { createApp } from "../server/app.js";

let directory, url, app, current;
const databases = [];
async function open() {
  const database = await openTursoDatabase({ url, allowLocal: true, now: current });
  databases.push(database);
  return createApp({ database, now: () => current });
}
beforeEach(async () => {
  directory = mkdtempSync(join(process.env.TURSO_TEST_ROOT || tmpdir(), "cinebook-turso-test-"));
  url = pathToFileURL(join(directory, "remote-fixture.sqlite")).href;
  current = new Date(2026, 9, 18, 9);
  app = await open();
});
afterEach(async () => {
  for (const database of databases.splice(0)) if (database.open) database.close();
  const target = resolve(directory);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("cinebook-turso-test-")) throw new Error("Unexpected test fixture path");
  // npm test's parent owns cleanup after all native worker handles are closed.
  if (!process.env.TURSO_TEST_ROOT) await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
async function showtime() {
  return (await request(app).get("/api/movies/1/showtimes").expect(200)).body.showtimes[0];
}
const customer = (id, seats = ["C4", "C5"]) => ({ showtimeId: id, seats, customerName: "Turso Test", customerEmail: "turso@example.test" });

describe("Turso client and async booking API using a real local libSQL database", () => {
  it("serves health, all ten movies, filters, descriptions, showtimes and real metrics", async () => {
    await request(app).get("/api/health").expect(200);
    const listing = await request(app).get("/api/movies").expect(200);
    expect(listing.body.movies).toHaveLength(10);
    expect(listing.body.movies[0].poster).toBe("/posters/beyond-orbit.svg");
    expect(listing.body.movies[0].synopsis.length).toBeGreaterThan(10);
    await request(app).get("/api/movies/1").expect(200);
    const filtered = await request(app).get("/api/showtimes?movieId=1&date=2026-10-18").expect(200);
    expect(filtered.body.showtimes).toHaveLength(3);
    const metrics = await request(app).get("/metrics").expect(200);
    expect(metrics.text).toContain("cinebook_movies 10");
    expect(metrics.text).toContain("cinebook_bookings 0");
  });

  it("calculates prices on the server and retrieves a remotely committed ticket", async () => {
    const show = await showtime();
    const created = await request(app).post("/api/bookings").send({ ...customer(show.id), total: 1 }).expect(201);
    expect(created.body.booking.total).toBe(show.price * 2);
    expect(created.body.booking.reference).toMatch(/^CB-[A-F0-9]{24}$/);
    const saved = await request(app).get(`/api/bookings/${created.body.booking.reference}`).expect(200);
    expect(saved.body.booking).toEqual(created.body.booking);
    const seats = await request(app).get(`/api/showtimes/${show.id}/seats`).expect(200);
    expect(seats.body.bookedSeats).toEqual(["C4", "C5"]);
  });

  it("rejects duplicate seats and rolls back a partially conflicting reservation", async () => {
    const show = await showtime();
    await request(app).post("/api/bookings").send(customer(show.id, ["A2"])).expect(201);
    const duplicate = await request(app).post("/api/bookings").send(customer(show.id, ["A1", "A2"])).expect(409);
    expect(duplicate.body.code).toBe("SEAT_UNAVAILABLE");
    expect((await app.locals.db.prepare("SELECT COUNT(*) AS n FROM bookings").get()).n).toBe(1);
    const seats = await request(app).get(`/api/showtimes/${show.id}/seats`).expect(200);
    expect(seats.body.bookedSeats).toEqual(["A2"]);
    const metrics = await request(app).get("/metrics").expect(200);
    expect(metrics.text).toContain("cinebook_bookings_confirmed_total 1");
  });

  it("commits the maximum sixty-seat reservation with server pricing", async () => {
    const show = await showtime();
    const seats = ["A", "B", "C", "D", "E", "F"].flatMap((row) => Array.from({ length: 10 }, (_, i) => `${row}${i + 1}`));
    const created = await request(app).post("/api/bookings").send(customer(show.id, seats)).expect(201);
    expect(created.body.booking.seats).toEqual(seats);
    expect(created.body.booking.total).toBe(show.price * 60);
    expect((await request(app).get(`/api/showtimes/${show.id}/seats`).expect(200)).body.bookedSeats).toEqual(seats);
  });

  it("keeps tickets, seat locks, changed prices and IDs across closing and recreating the app", async () => {
    const show = await showtime();
    const created = await request(app).post("/api/bookings").send(customer(show.id)).expect(201);
    await app.locals.db.prepare("UPDATE showtimes SET price = ? WHERE id = ?").run(987, show.id);
    app.locals.db.close();
    const reopened = await open();
    const saved = await request(reopened).get(`/api/bookings/${created.body.booking.reference}`).expect(200);
    expect(saved.body.booking).toEqual(created.body.booking);
    await request(reopened).post("/api/bookings").send(customer(show.id)).expect(409);
    const seats = await request(reopened).get(`/api/showtimes/${show.id}/seats`).expect(200);
    expect(seats.body.price).toBe(987);
    expect((await reopened.locals.db.prepare("SELECT COUNT(*) AS n FROM showtimes").get()).n).toBe(210);
    expect((await request(reopened).get("/metrics").expect(200)).text).toContain("cinebook_bookings 1");
  });

  it("never confirms two competing reservations for the same seat", async () => {
    const show = await showtime();
    const responses = await Promise.all([
      request(app).post("/api/bookings").send(customer(show.id, ["F10"])),
      request(app).post("/api/bookings").send(customer(show.id, ["F10"])),
    ]);
    const statuses = responses.map((result) => result.status).sort();
    expect(statuses[0]).toBe(201);
    expect([409, 503]).toContain(statuses[1]);
    expect((await app.locals.db.prepare("SELECT COUNT(*) AS n FROM booked_seats").get()).n).toBe(1);
    await request(app).post("/api/bookings").send(customer(show.id, ["F10"])).expect(409);
  });

  it.each([
    [{ seats: [] }, "INVALID_SEATS"],
    [{ customerEmail: "invalid" }, "INVALID_EMAIL"],
    [{ customerName: "" }, "INVALID_NAME"],
  ])("validates requests before writing to the remote client", async (changes, code) => {
    const show = await showtime();
    const response = await request(app).post("/api/bookings").send({ ...customer(show.id), ...changes }).expect(400);
    expect(response.body.code).toBe(code);
    expect((await app.locals.db.prepare("SELECT COUNT(*) AS n FROM bookings").get()).n).toBe(0);
  });

  it("handles unknown movies/showtimes/references and expired sessions safely", async () => {
    const show = await showtime();
    for (const endpoint of ["/api/movies/999999", "/api/movies/999999/showtimes", "/api/showtimes/999999/seats", "/api/bookings/CB-000000000000000000000000"]) {
      await request(app).get(endpoint).expect(404);
    }
    await request(app).post("/api/bookings").send(customer(999999)).expect(404);
    current = new Date(2026, 9, 18, 12);
    const expired = await request(app).post("/api/bookings").send(customer(show.id)).expect(409);
    expect(expired.body.code).toBe("SHOWTIME_EXPIRED");
  });

  it("requires encrypted remote URLs and a private token in normal cloud mode", () => {
    expect(() => validateTursoSettings(undefined, undefined)).toThrow("TURSO_DATABASE_URL");
    expect(() => validateTursoSettings("file:/tmp/ephemeral.sqlite", "secret")).toThrow("forbidden");
    expect(() => validateTursoSettings("http://example.test", "secret")).toThrow("encrypted");
    expect(() => validateTursoSettings("libsql://example.turso.io", "")).toThrow("TURSO_AUTH_TOKEN");
    expect(() => validateTursoSettings("libsql://example.turso.io", "   ")).toThrow("TURSO_AUTH_TOKEN");
    expect(() => validateTursoSettings("https://example.turso.io?token=secret", "secret")).toThrow("outside");
    expect(() => validateTursoSettings("libsql://example.turso.io", "test-token")).not.toThrow();
  });
});
