import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createApp } from "../server/app.js";

let app;
let currentTime;

beforeEach(() => {
  currentTime = new Date(2026, 9, 18, 9, 0, 0);
  app = createApp({ now: () => new Date(currentTime) });
});

afterEach(() => {
  if (app?.locals.db.open) app.locals.db.close();
});

async function firstShowtime(client = app) {
  const { body } = await request(client)
    .get("/api/movies/1/showtimes")
    .expect(200);
  return body.showtimes[0];
}

function customer(showtimeId, seats = ["C4", "C5"]) {
  return {
    showtimeId,
    seats,
    customerName: "Aarav Sharma",
    customerEmail: "aarav@example.com",
  };
}

function removeTestDirectory(directory) {
  const resolvedDirectory = resolve(directory);
  if (
    !resolvedDirectory.startsWith(`${resolve(tmpdir())}${sep}`) ||
    !basename(resolvedDirectory).startsWith("cinebook-test-")
  ) {
    throw new Error(
      "Refusing to remove a directory outside the generated test fixture.",
    );
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

describe("CineBook API", () => {
  it("reports a working database through the health endpoint", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toEqual({ status: "ok", database: "connected" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("lists ten original movies with local posters, prices and upcoming showtimes", async () => {
    const { body } = await request(app).get("/api/movies").expect(200);
    expect(body.movies).toHaveLength(10);
    expect(body.movies.map((movie) => movie.title)).toContain("Beyond Orbit");
    expect(new Set(body.movies.map((movie) => movie.id)).size).toBe(10);
    expect(new Set(body.movies.map((movie) => movie.poster)).size).toBe(10);
    expect(body.movies.slice(6).map(({ title }) => title)).toEqual([
      "Velvet Skies", "The Glass Kingdom", "Deep Blue", "Echoes of Tomorrow",
    ]);
    expect(body.movies.slice(6).map(({ startingPrice }) => startingPrice)).toEqual([280, 360, 320, 300]);
    for (const movie of body.movies) {
      expect(movie).toMatchObject({
        id: expect.any(Number),
        title: expect.any(String),
        synopsis: expect.any(String),
        genre: expect.any(Array),
        rating: expect.any(Number),
        durationMinutes: expect.any(Number),
        language: expect.any(String),
        certificate: expect.any(String),
        releaseYear: 2026,
        startingPrice: expect.any(Number),
      });
      expect(movie.poster).toMatch(/^\/posters\/[a-z-]+\.svg$/);
      expect(movie.genre.length).toBeGreaterThan(0);
      expect(movie.durationMinutes).toBeGreaterThan(0);
      expect(movie.startingPrice).toBeGreaterThan(0);
      expect(movie.nextShowtimes).toHaveLength(3);
      expect(movie.nextShowtimes[0]).toMatchObject({
        id: expect.any(Number), movieId: movie.id, date: "2026-10-18",
        time: "11:00", screen: expect.any(String), format: expect.any(String),
        price: movie.startingPrice,
      });
    }
  });

  it("keeps seeds idempotent across repeated movie and showtime requests", async () => {
    const first = await request(app).get("/api/movies").expect(200);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const repeated = await request(app).get("/api/movies").expect(200);
      expect(repeated.body).toEqual(first.body);
      await request(app).get("/api/showtimes").expect(200);
    }
    expect(app.locals.db.prepare("SELECT COUNT(*) AS count FROM movies").get().count).toBe(10);
    expect(app.locals.db.prepare("SELECT COUNT(*) AS count FROM showtimes").get().count).toBe(210);
  });

  it("lists showtimes across movies and filters them by movie and date", async () => {
    const all = await request(app).get("/api/showtimes").expect(200);
    expect(all.body.dates).toHaveLength(7);
    expect(all.body.showtimes).toHaveLength(210);
    expect(new Set(all.body.showtimes.map(({ movieId }) => movieId)).size).toBe(10);
    const movie = await request(app).get("/api/showtimes?movieId=7").expect(200);
    expect(movie.body.showtimes).toHaveLength(21);
    const day = await request(app).get("/api/showtimes?date=2026-10-19").expect(200);
    expect(day.body.showtimes).toHaveLength(30);
    const filtered = await request(app).get("/api/showtimes?movieId=7&date=2026-10-19").expect(200);
    expect(filtered.body.showtimes).toHaveLength(3);
    for (const showtime of filtered.body.showtimes) {
      expect(showtime).toMatchObject({ movieId: 7, date: "2026-10-19", price: 280 });
    }
    const outsideWindow = await request(app).get("/api/showtimes?date=2020-01-01").expect(200);
    expect(outsideWindow.body.showtimes).toEqual([]);
  });

  it.each([
    ["movieId=invalid", "INVALID_MOVIE"],
    ["movieId=1.5", "INVALID_MOVIE"],
    ["movieId=0", "INVALID_MOVIE"],
    ["movieId=1&movieId=2", "INVALID_MOVIE"],
    ["movieId[]=1", "INVALID_MOVIE"],
    ["movieId[id]=1", "INVALID_MOVIE"],
    ["date=tomorrow", "INVALID_DATE"],
    ["date=2026-02-30", "INVALID_DATE"],
    ["date=2026-13-01", "INVALID_DATE"],
    ["date=2026-10-19&date=2026-10-20", "INVALID_DATE"],
    ["date[]=2026-10-19", "INVALID_DATE"],
  ])("rejects invalid showtime filters %s", async (query, code) => {
    const { body } = await request(app).get(`/api/showtimes?${query}`).expect(400);
    expect(body.code).toBe(code);
  });

  it("exports Prometheus metrics with aggregate counts and safe route labels", async () => {
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/movies/1").expect(200);
    await request(app).get("/api/movies/2").expect(200);
    const showtime = await firstShowtime();
    const created = await request(app).post("/api/bookings").send(customer(showtime.id)).expect(201);
    const reference = created.body.booking.reference;
    await request(app).get(`/api/bookings/${reference}`).expect(200);

    const response = await request(app).get("/metrics").expect(200);
    expect(response.headers["content-type"]).toContain("text/plain; version=0.0.4");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toContain("# TYPE cinebook_http_requests_total counter\n");
    expect(response.text).toContain('cinebook_http_requests_total{method="GET",route="/api/health",status="200"} 2\n');
    expect(response.text).toContain('cinebook_http_requests_total{method="GET",route="/api/movies/:id",status="200"} 2\n');
    expect(response.text).toContain('route="/api/bookings/:reference"');
    expect(response.text).toContain("cinebook_movies 10\n");
    expect(response.text).toContain("cinebook_bookings 1\n");
    expect(response.text).toMatch(/cinebook_uptime_seconds \d+(?:\.\d+)?\n/);
    expect(response.text).toContain("# TYPE cinebook_http_request_duration_seconds histogram\n");
    expect(response.text).not.toContain(reference);
    expect(response.text).not.toContain("aarav@example.com");
    for (const line of response.text.trim().split("\n").filter((line) => line.trim() && !line.startsWith("#"))) {
      expect(line).toMatch(/^[a-zA-Z_:][a-zA-Z0-9_:]*(?:\{[^}]*\})? (?:[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[+-]?Inf|NaN)$/);
    }
  });

  it("returns movie details and seven upcoming local dates with three sessions each", async () => {
    const details = await request(app).get("/api/movies/1").expect(200);
    expect(details.body.movie.title).toBe("Beyond Orbit");
    expect(details.body.movie.startingPrice).toBe(340);
    expect(details.body.movie.nextShowtimes).toHaveLength(3);

    const { body } = await request(app)
      .get("/api/movies/1/showtimes")
      .expect(200);
    expect(body.dates).toHaveLength(7);
    expect(body.dates[0]).toBe("2026-10-18");
    expect(body.dates.at(-1)).toBe("2026-10-24");
    expect(body.showtimes).toHaveLength(21);
    for (const date of body.dates) {
      expect(
        body.showtimes.filter((showtime) => showtime.date === date),
      ).toHaveLength(3);
    }
    expect(body.showtimes[0]).toMatchObject({
      id: expect.any(Number),
      movieId: 1,
      date: "2026-10-18",
      time: "11:00",
      screen: expect.any(String),
      format: expect.any(String),
      price: expect.any(Number),
    });
  });

  it("moves the seven-day window across a year boundary using the local date", async () => {
    currentTime = new Date(2026, 11, 31, 23, 30, 0);
    const { body } = await request(app)
      .get("/api/movies/2/showtimes")
      .expect(200);
    expect(body.dates[0]).toBe("2027-01-01");
    expect(body.dates.at(-1)).toBe("2027-01-07");
    expect(body.showtimes).toHaveLength(21);
  });

  it("shows sixty seats and the server price before booking", async () => {
    const showtime = await firstShowtime();
    const { body } = await request(app)
      .get(`/api/showtimes/${showtime.id}/seats`)
      .expect(200);
    expect(body.showtime).toEqual(showtime);
    expect(body.rows).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(body.seatsPerRow).toBe(10);
    expect(body.bookedSeats).toEqual([]);
    expect(body.price).toBe(showtime.price);
  });

  it("books selected seats, calculates totals on the server, and retrieves the complete ticket", async () => {
    const showtime = await firstShowtime();
    const payload = {
      ...customer(showtime.id, ["c10", " C2 "]),
      customerName: "  Aarav Sharma  ",
      customerEmail: " AARAV@example.com ",
      total: 1,
      unitPrice: 1,
    };
    const { body } = await request(app)
      .post("/api/bookings")
      .send(payload)
      .expect(201);
    expect(body.booking).toMatchObject({
      reference: expect.stringMatching(/^CB-[A-F0-9]{24}$/),
      customerName: "Aarav Sharma",
      customerEmail: "aarav@example.com",
      seats: ["C2", "C10"],
      total: showtime.price * 2,
      unitPrice: showtime.price,
      movie: { id: 1, title: "Beyond Orbit" },
      showtime: {
        date: showtime.date,
        time: showtime.time,
        screen: showtime.screen,
      },
      createdAt: currentTime.toISOString(),
    });

    const ticket = await request(app)
      .get(`/api/bookings/${body.booking.reference.toLowerCase()}`)
      .expect(200);
    expect(ticket.body.booking).toEqual(body.booking);

    const seats = await request(app)
      .get(`/api/showtimes/${showtime.id}/seats`)
      .expect(200);
    expect(seats.body.bookedSeats).toEqual(["C2", "C10"]);
  });

  it("prevents duplicate reservations for one showtime while allowing the seat at another showtime", async () => {
    const { body } = await request(app)
      .get("/api/movies/1/showtimes")
      .expect(200);
    const [first, second] = body.showtimes;
    await request(app)
      .post("/api/bookings")
      .send(customer(first.id, ["A1"]))
      .expect(201);
    const conflict = await request(app)
      .post("/api/bookings")
      .send(customer(first.id, ["A1"]))
      .expect(409);
    expect(conflict.body.code).toBe("SEAT_UNAVAILABLE");
    const otherShow = await request(app)
      .post("/api/bookings")
      .send(customer(second.id, ["A1"]))
      .expect(201);
    expect(otherShow.body.booking.seats).toEqual(["A1"]);
  });

  it("rolls back the entire booking when one of several seats is already reserved", async () => {
    const showtime = await firstShowtime();
    await request(app)
      .post("/api/bookings")
      .send(customer(showtime.id, ["A2"]))
      .expect(201);
    await request(app)
      .post("/api/bookings")
      .send(customer(showtime.id, ["A1", "A2"]))
      .expect(409);

    const seats = await request(app)
      .get(`/api/showtimes/${showtime.id}/seats`)
      .expect(200);
    expect(seats.body.bookedSeats).toEqual(["A2"]);
    expect(
      app.locals.db.prepare("SELECT COUNT(*) AS count FROM bookings").get()
        .count,
    ).toBe(1);
    await request(app)
      .post("/api/bookings")
      .send(customer(showtime.id, ["A1"]))
      .expect(201);
  });

  it("allows exactly one of two competing requests to reserve the same seat", async () => {
    const showtime = await firstShowtime();
    const results = await Promise.all([
      request(app)
        .post("/api/bookings")
        .send(customer(showtime.id, ["F10"])),
      request(app)
        .post("/api/bookings")
        .send(customer(showtime.id, ["F10"])),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      app.locals.db.prepare("SELECT COUNT(*) AS count FROM booked_seats").get()
        .count,
    ).toBe(1);
  });

  it.each([
    ["no seats", { seats: [] }, "INVALID_SEATS"],
    ["a non-array seat list", { seats: "A1" }, "INVALID_SEATS"],
    ["an invalid row", { seats: ["G1"] }, "INVALID_SEATS"],
    ["an invalid seat number", { seats: ["A11"] }, "INVALID_SEATS"],
    ["a zero seat number", { seats: ["A0"] }, "INVALID_SEATS"],
    ["a non-string seat", { seats: [null] }, "INVALID_SEATS"],
    [
      "duplicate seats after normalization",
      { seats: ["a1", " A1 "] },
      "DUPLICATE_SEATS",
    ],
    ["an empty name", { customerName: " " }, "INVALID_NAME"],
    ["a non-string name", { customerName: {} }, "INVALID_NAME"],
    [
      "a name with a control character",
      { customerName: "Aarav\nSharma" },
      "INVALID_NAME",
    ],
    ["a malformed email", { customerEmail: "invalid@email" }, "INVALID_EMAIL"],
    ["a non-string email", { customerEmail: [] }, "INVALID_EMAIL"],
    ["a fractional showtime ID", { showtimeId: 1.5 }, "INVALID_SHOWTIME"],
    ["an array showtime ID", { showtimeId: [1] }, "INVALID_SHOWTIME"],
    ["a boolean showtime ID", { showtimeId: true }, "INVALID_SHOWTIME"],
    ["an object showtime ID", { showtimeId: { id: 1 } }, "INVALID_SHOWTIME"],
    [
      "a nonnumeric showtime ID",
      { showtimeId: "1 OR 1=1" },
      "INVALID_SHOWTIME",
    ],
  ])(
    "rejects %s without writing a booking",
    async (_description, changes, code) => {
      const showtime = await firstShowtime();
      const response = await request(app)
        .post("/api/bookings")
        .send({ ...customer(showtime.id), ...changes })
        .expect(400);
      expect(response.body.code).toBe(code);
      expect(response.body.error).toEqual(expect.any(String));
      expect(
        app.locals.db.prepare("SELECT COUNT(*) AS count FROM bookings").get()
          .count,
      ).toBe(0);
    },
  );

  it("rejects expired showtimes and hides them from the available sessions", async () => {
    const showtime = await firstShowtime();
    currentTime = new Date(2026, 9, 18, 11, 0, 0);
    const expired = await request(app)
      .post("/api/bookings")
      .send(customer(showtime.id))
      .expect(409);
    expect(expired.body.code).toBe("SHOWTIME_EXPIRED");
    await request(app).get(`/api/showtimes/${showtime.id}/seats`).expect(409);

    const available = await request(app)
      .get("/api/movies/1/showtimes")
      .expect(200);
    expect(available.body.showtimes.some(({ id }) => id === showtime.id)).toBe(
      false,
    );
    expect(available.body.dates).toHaveLength(7);
    const listing = await request(app).get("/api/movies").expect(200);
    expect(listing.body.movies[0].nextShowtimes[0].time).toBe("15:15");
    const all = await request(app).get("/api/showtimes").expect(200);
    expect(all.body.showtimes.some(({ id }) => id === showtime.id)).toBe(false);
  });

  it.each([
    "/api/movies/9999",
    "/api/movies/invalid",
    "/api/movies/1.5",
    "/api/movies/9999/showtimes",
    "/api/showtimes?movieId=9999",
    "/api/showtimes/9999/seats",
    "/api/bookings/CB-000000000000000000000000",
    "/api/bookings/missing",
    "/api/unknown",
  ])("returns a useful JSON 404 for %s", async (endpoint) => {
    const { body } = await request(app).get(endpoint).expect(404);
    expect(body.error).toEqual(expect.any(String));
    expect(body.code).toEqual(expect.any(String));
  });

  it("returns 404 for an unknown showtime in a booking request", async () => {
    const { body } = await request(app)
      .post("/api/bookings")
      .send(customer(999999))
      .expect(404);
    expect(body.code).toBe("SHOWTIME_NOT_FOUND");
  });

  it("handles malformed JSON and missing request data with clear client errors", async () => {
    const malformed = await request(app)
      .post("/api/bookings")
      .set("Content-Type", "application/json")
      .send('{"seats":')
      .expect(400);
    expect(malformed.body.code).toBe("INVALID_JSON");

    const missing = await request(app)
      .post("/api/bookings")
      .send({})
      .expect(400);
    expect(missing.body.code).toBe("INVALID_SHOWTIME");
  });

  it("serves the production app and its assets while keeping API and missing asset errors as JSON", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cinebook-test-"));
    let productionApp;
    try {
      mkdirSync(join(directory, "assets"));
      writeFileSync(
        join(directory, "index.html"),
        "<!doctype html><html><body>CineBook fixture</body></html>",
      );
      writeFileSync(
        join(directory, "assets", "app.js"),
        "window.cinebook = true;",
      );
      productionApp = createApp({
        serveClient: true,
        clientDistPath: directory,
        now: () => new Date(currentTime),
      });

      const homepage = await request(productionApp).get("/").expect(200);
      expect(homepage.headers["content-type"]).toContain("text/html");
      expect(homepage.text).toContain("CineBook fixture");
      const fallback = await request(productionApp).get("/movie/1").expect(200);
      expect(fallback.text).toBe(homepage.text);
      const asset = await request(productionApp)
        .get("/assets/app.js")
        .expect(200);
      expect(asset.text).toBe("window.cinebook = true;");

      for (const endpoint of [
        "/api/unknown",
        "/missing.svg",
        "/assets/missing.js",
      ]) {
        const missing = await request(productionApp).get(endpoint).expect(404);
        expect(missing.headers["content-type"]).toContain("application/json");
        expect(missing.body.code).toBe("NOT_FOUND");
      }
    } finally {
      if (productionApp?.locals.db.open) productionApp.locals.db.close();
      removeTestDirectory(directory);
    }
  });

  it("adds four new seed movies to an existing database without changing bookings or original rows", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cinebook-test-"));
    const databasePath = join(directory, "bookings.sqlite");
    let persistedApp;
    let reopenedApp;
    try {
      persistedApp = createApp({
        dbPath: databasePath,
        now: () => new Date(currentTime),
      });
      const showtime = await firstShowtime(persistedApp);
      const created = await request(persistedApp)
        .post("/api/bookings")
        .send(customer(showtime.id, ["B3", "B4"]))
        .expect(201);
      // Model the previous six-movie database before expanding the catalogue.
      persistedApp.locals.db.exec(`
        DELETE FROM showtimes WHERE movie_id > 6;
        DELETE FROM movies WHERE id > 6;
        UPDATE movies SET tagline = 'Retain this original movie edit' WHERE id = 1;
      `);
      persistedApp.locals.db.prepare("UPDATE showtimes SET price = ? WHERE id = ?").run(365, showtime.id);
      persistedApp.locals.db.close();

      reopenedApp = createApp({
        dbPath: databasePath,
        now: () => new Date(currentTime),
      });
      const retrieved = await request(reopenedApp)
        .get(`/api/bookings/${created.body.booking.reference}`)
        .expect(200);
      expect(retrieved.body.booking).toEqual(created.body.booking);

      const seats = await request(reopenedApp)
        .get(`/api/showtimes/${showtime.id}/seats`)
        .expect(200);
      expect(seats.body.bookedSeats).toEqual(["B3", "B4"]);
      expect(seats.body.price).toBe(365);
      const movies = await request(reopenedApp).get("/api/movies").expect(200);
      expect(movies.body.movies).toHaveLength(10);
      expect(movies.body.movies[0].tagline).toBe("Retain this original movie edit");
      expect(movies.body.movies[6]).toMatchObject({ title: "Velvet Skies", startingPrice: 280 });
      expect(reopenedApp.locals.db.prepare("SELECT COUNT(*) AS count FROM showtimes").get().count).toBe(210);
      const listing = await request(reopenedApp)
        .get("/api/movies/1/showtimes")
        .expect(200);
      expect(listing.body.showtimes).toHaveLength(21);
    } finally {
      if (persistedApp?.locals.db.open) persistedApp.locals.db.close();
      if (reopenedApp?.locals.db.open) reopenedApp.locals.db.close();
      removeTestDirectory(directory);
    }
  });
});
