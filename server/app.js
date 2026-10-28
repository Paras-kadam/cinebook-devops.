import express from "express";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, serializeMovie, serializeShowtime } from "./database.js";
import { createMetrics } from "./metrics.js";
import { configureSecurity, validateSecurity } from "./security.js";
import {
  SEAT_ROWS,
  SEATS_PER_ROW,
  localDateString,
  seedShowtimes,
  showtimeDate,
} from "./seed.js";

const serverDirectory = dirname(fileURLToPath(import.meta.url));

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function numericId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = Number(value);
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = showtimeDate(value, "00:00");
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
}

function sortedSeats(seats) {
  return seats.toSorted((left, right) => {
    const rowOrder = left.charCodeAt(0) - right.charCodeAt(0);
    return rowOrder || Number(left.slice(1)) - Number(right.slice(1));
  });
}

function bookingInput(body) {
  const input =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const showtimeId = numericId(input.showtimeId);
  if (!showtimeId)
    throw new ApiError(400, "Choose a valid showtime.", "INVALID_SHOWTIME");

  if (
    !Array.isArray(input.seats) ||
    input.seats.length < 1 ||
    input.seats.length > 60
  ) {
    throw new ApiError(400, "Choose between 1 and 60 seats.", "INVALID_SEATS");
  }
  const seats = input.seats.map((seat) =>
    typeof seat === "string" ? seat.trim().toUpperCase() : "",
  );
  if (seats.some((seat) => !/^[A-F](?:[1-9]|10)$/.test(seat))) {
    throw new ApiError(
      400,
      "Choose valid seats from A1 to F10.",
      "INVALID_SEATS",
    );
  }
  if (new Set(seats).size !== seats.length) {
    throw new ApiError(
      400,
      "Each selected seat must be unique.",
      "DUPLICATE_SEATS",
    );
  }

  const customerName =
    typeof input.customerName === "string" ? input.customerName.trim() : "";
  if (
    customerName.length < 2 ||
    customerName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(customerName)
  ) {
    throw new ApiError(
      400,
      "Enter a name between 2 and 100 characters.",
      "INVALID_NAME",
    );
  }

  const customerEmail =
    typeof input.customerEmail === "string"
      ? input.customerEmail.trim().toLowerCase()
      : "";
  if (
    customerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
  ) {
    throw new ApiError(400, "Enter a valid email address.", "INVALID_EMAIL");
  }

  return { showtimeId, seats: sortedSeats(seats), customerName, customerEmail };
}

/** Create an isolated app. Pass a file path to persist data, or omit it for an in-memory DB. */
export function createApp({
  dbPath = ":memory:",
  serveClient = false,
  clientDistPath = resolve(serverDirectory, "../client/dist"),
  now = () => new Date(),
  metricsToken = process.env.METRICS_TOKEN || "",
  requireMetricsAuth = process.env.RENDER === "true" || process.env.METRICS_REQUIRE_AUTH === "true",
  trustProxy = Number(process.env.TRUST_PROXY || 0),
  apiLimit = 300,
  bookingLimit = 60,
  requestLogging = process.env.REQUEST_LOGGING === "true",
} = {}) {
  const app = express();
  validateSecurity({ metricsToken, requireMetricsAuth, trustProxy });
  const db = openDatabase(dbPath, now());
  app.locals.db = db;
  app.disable("x-powered-by");
  const metrics = createMetrics(db);
  app.use(metrics.trackRequest);
  configureSecurity(app, { serveClient, metricsToken, requireMetricsAuth, trustProxy,
    apiLimit, bookingLimit, requestLogging });
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  const findMovie = db.prepare("SELECT * FROM movies WHERE id = ?");
  const findShowtime = db.prepare("SELECT * FROM showtimes WHERE id = ?");
  const listShowtimes = db.prepare(`
    SELECT * FROM showtimes
    WHERE show_date >= ? AND show_date <= ?
      AND (? IS NULL OR movie_id = ?)
      AND (? IS NULL OR show_date = ?)
    ORDER BY show_date, start_time, movie_id
  `);
  const findBooking = db.prepare(`
    SELECT b.*, m.id AS movie_id, m.title, m.poster, m.duration_minutes, m.certificate,
           s.show_date, s.start_time, s.screen, s.format
    FROM bookings b
    JOIN showtimes s ON s.id = b.showtime_id
    JOIN movies m ON m.id = s.movie_id
    WHERE b.reference = ?
  `);
  const bookedSeats = db.prepare(
    "SELECT seat FROM booked_seats WHERE showtime_id = ?",
  );
  const bookingSeats = db.prepare(
    "SELECT seat FROM booked_seats WHERE booking_id = ?",
  );
  const insertBooking = db.prepare(`
    INSERT INTO bookings
      (reference, showtime_id, customer_name, customer_email, unit_price, total, created_at)
    VALUES (@reference, @showtimeId, @customerName, @customerEmail, @unitPrice, @total, @createdAt)
  `);
  const insertSeat = db.prepare(`
    INSERT INTO booked_seats (booking_id, showtime_id, seat) VALUES (?, ?, ?)
  `);

  function availableShowtimes(currentTime, movieId = null, date = null) {
    const dates = seedShowtimes(db, currentTime);
    const rows = listShowtimes
      .all(dates[0], dates.at(-1), movieId, movieId, date, date)
      .filter((row) => showtimeDate(row.show_date, row.start_time) > currentTime);
    return { dates, rows };
  }

  function getShowtime(id) {
    const showtime = id ? findShowtime.get(id) : undefined;
    if (!showtime)
      throw new ApiError(
        404,
        "This showtime could not be found.",
        "SHOWTIME_NOT_FOUND",
      );
    return showtime;
  }

  function requireUpcoming(showtime, currentTime) {
    if (showtimeDate(showtime.show_date, showtime.start_time) <= currentTime) {
      throw new ApiError(
        409,
        "This showtime has already started. Please choose another.",
        "SHOWTIME_EXPIRED",
      );
    }
  }

  function getBooking(reference) {
    const booking = findBooking.get(reference);
    if (!booking)
      throw new ApiError(
        404,
        "No booking was found with that reference.",
        "BOOKING_NOT_FOUND",
      );
    return {
      reference: booking.reference,
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      seats: sortedSeats(bookingSeats.all(booking.id).map(({ seat }) => seat)),
      total: booking.total,
      unitPrice: booking.unit_price,
      createdAt: booking.created_at,
      movie: {
        id: booking.movie_id,
        title: booking.title,
        poster: booking.poster,
        durationMinutes: booking.duration_minutes,
        certificate: booking.certificate,
      },
      showtime: {
        date: booking.show_date,
        time: booking.start_time,
        screen: booking.screen,
        format: booking.format,
      },
    };
  }

  const reserveSeats = db.transaction((input) => {
    const currentTime = now();
    const showtime = getShowtime(input.showtimeId);
    requireUpcoming(showtime, currentTime);
    const reference = `CB-${randomBytes(12).toString("hex").toUpperCase()}`;
    const result = insertBooking.run({
      ...input,
      reference,
      unitPrice: showtime.price,
      total: showtime.price * input.seats.length,
      createdAt: currentTime.toISOString(),
    });
    for (const seat of input.seats)
      insertSeat.run(result.lastInsertRowid, showtime.id, seat);
    return reference;
  });

  app.get("/api/health", (_request, response) => {
    db.prepare("SELECT 1").get();
    response.json({ status: "ok", database: "connected" });
  });

  app.get("/metrics", async (_request, response) => {
    response
      .set("Content-Type", metrics.registry.contentType)
      .set("Cache-Control", "no-store")
      .send(await metrics.registry.metrics());
  });

  app.get("/api/movies", (_request, response) => {
    const { rows } = availableShowtimes(now());
    response.json({
      movies: db
        .prepare("SELECT * FROM movies ORDER BY id")
        .all()
        .map((movie) =>
          serializeMovie(movie, rows.filter((row) => row.movie_id === movie.id)),
        ),
    });
  });

  app.get("/api/movies/:id", (request, response) => {
    const id = numericId(request.params.id);
    const movie = id ? findMovie.get(id) : undefined;
    if (!movie)
      throw new ApiError(
        404,
        "This movie could not be found.",
        "MOVIE_NOT_FOUND",
      );
    const { rows } = availableShowtimes(now(), id);
    response.json({ movie: serializeMovie(movie, rows) });
  });

  app.get("/api/showtimes", (request, response) => {
    // Express's simple query parser leaves bracket notation in the key itself.
    const queryKeys = Object.keys(request.query);
    if (queryKeys.some((key) => key.startsWith("movieId["))) {
      throw new ApiError(400, "Choose a valid movie ID.", "INVALID_MOVIE");
    }
    const movieId =
      request.query.movieId === undefined
        ? null
        : numericId(request.query.movieId);
    if (request.query.movieId !== undefined && !movieId) {
      throw new ApiError(400, "Choose a valid movie ID.", "INVALID_MOVIE");
    }
    if (movieId && !findMovie.get(movieId)) {
      throw new ApiError(404, "This movie could not be found.", "MOVIE_NOT_FOUND");
    }
    if (
      queryKeys.some((key) => key.startsWith("date[")) ||
      (request.query.date !== undefined && !validDate(request.query.date))
    ) {
      throw new ApiError(
        400,
        "Choose a valid date in YYYY-MM-DD format.",
        "INVALID_DATE",
      );
    }
    const { dates, rows } = availableShowtimes(
      now(), movieId, request.query.date ?? null,
    );
    response.json({ dates, showtimes: rows.map(serializeShowtime) });
  });

  app.get("/api/movies/:id/showtimes", (request, response) => {
    const id = numericId(request.params.id);
    if (!id || !findMovie.get(id)) {
      throw new ApiError(
        404,
        "This movie could not be found.",
        "MOVIE_NOT_FOUND",
      );
    }
    const { dates, rows } = availableShowtimes(now(), id);
    response.json({ dates, showtimes: rows.map(serializeShowtime) });
  });

  app.get("/api/showtimes/:id/seats", (request, response) => {
    const showtime = getShowtime(numericId(request.params.id));
    requireUpcoming(showtime, now());
    response.json({
      showtime: serializeShowtime(showtime),
      rows: SEAT_ROWS,
      seatsPerRow: SEATS_PER_ROW,
      bookedSeats: sortedSeats(
        bookedSeats.all(showtime.id).map(({ seat }) => seat),
      ),
      price: showtime.price,
    });
  });

  app.post("/api/bookings", (request, response, next) => {
    try {
      const input = bookingInput(request.body);
      // IMMEDIATE takes the SQLite write lock before checking and inserting seats.
      const reference = reserveSeats.immediate(input);
      // The transaction wrapper returns only after COMMIT. Failed or rolled-back
      // reservations must never increase the confirmed-booking counter.
      metrics.confirmedBookings.inc();
      response.status(201).json({ booking: getBooking(reference) });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        next(
          new ApiError(
            409,
            "One or more seats were just booked. Please choose other seats.",
            "SEAT_UNAVAILABLE",
          ),
        );
      } else if (error.code === "SQLITE_BUSY") {
        next(
          new ApiError(
            503,
            "Bookings are busy right now. Please try again.",
            "DATABASE_BUSY",
          ),
        );
      } else {
        next(error);
      }
    }
  });

  app.get("/api/bookings/:reference", (request, response) => {
    const reference = request.params.reference.trim().toUpperCase();
    if (!/^CB-[A-F0-9]{24}$/.test(reference)) {
      throw new ApiError(
        404,
        "No booking was found with that reference.",
        "BOOKING_NOT_FOUND",
      );
    }
    response.json({ booking: getBooking(reference) });
  });

  app.use("/api", (_request, _response, next) => {
    next(
      new ApiError(404, "This API endpoint could not be found.", "NOT_FOUND"),
    );
  });

  if (serveClient) {
    const indexPath = resolve(clientDistPath, "index.html");
    app.use((_request, response, next) => {
      response.locals.metricsRoute = "static";
      next();
    });
    app.use(express.static(clientDistPath));
    app.use((request, response, next) => {
      response.locals.metricsRoute = "unmatched";
      if (
        request.method !== "GET" ||
        !request.accepts("html") ||
        !existsSync(indexPath)
      ) {
        return next();
      }
      // Missing asset requests must remain 404s instead of returning the app HTML.
      if (/\.[a-z\d]+$/i.test(request.path)) return next();
      response.locals.metricsRoute = "frontend";
      response.sendFile(indexPath);
    });
  }

  app.use((_request, _response, next) => {
    next(new ApiError(404, "This page could not be found.", "NOT_FOUND"));
  });

  app.use((error, _request, response, _next) => {
    if (error.type === "entity.parse.failed") {
      return response
        .status(400)
        .json({
          error: "Request body must contain valid JSON.",
          code: "INVALID_JSON",
        });
    }
    if (error.type === "entity.too.large") {
      return response
        .status(413)
        .json({
          error: "This request is too large.",
          code: "REQUEST_TOO_LARGE",
        });
    }
    if (error instanceof ApiError) {
      return response
        .status(error.status)
        .json({ error: error.message, code: error.code });
    }
    console.error(JSON.stringify({ event: "application_error", code: error.code || "UNKNOWN" }));
    return response
      .status(500)
      .json({
        error: "Something went wrong. Please try again.",
        code: "INTERNAL_ERROR",
      });
  });

  return app;
}
