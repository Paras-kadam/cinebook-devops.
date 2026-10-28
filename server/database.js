import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedMovies, seedShowtimes } from "./seed.js";

export function openDatabase(dbPath, now) {
  if (dbPath !== ":memory:")
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });

  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        tagline TEXT NOT NULL,
        synopsis TEXT NOT NULL,
        genre TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        certificate TEXT NOT NULL,
        rating REAL NOT NULL,
        language TEXT NOT NULL,
        poster TEXT NOT NULL,
        backdrop TEXT NOT NULL,
        accent TEXT NOT NULL,
        release_year INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS showtimes (
        id INTEGER PRIMARY KEY,
        movie_id INTEGER NOT NULL REFERENCES movies(id),
        show_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        screen TEXT NOT NULL,
        format TEXT NOT NULL,
        price INTEGER NOT NULL CHECK (price > 0),
        UNIQUE (movie_id, show_date, start_time)
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        showtime_id INTEGER NOT NULL REFERENCES showtimes(id),
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        unit_price INTEGER NOT NULL CHECK (unit_price > 0),
        total INTEGER NOT NULL CHECK (total > 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS booked_seats (
        id INTEGER PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        showtime_id INTEGER NOT NULL REFERENCES showtimes(id),
        seat TEXT NOT NULL,
        UNIQUE (showtime_id, seat)
      );

      CREATE INDEX IF NOT EXISTS showtimes_movie_date
        ON showtimes(movie_id, show_date, start_time);
      CREATE INDEX IF NOT EXISTS booked_seats_booking
        ON booked_seats(booking_id);
    `);
    seedMovies(db);
    seedShowtimes(db, now);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function serializeMovie(row, showtimes = []) {
  return {
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    synopsis: row.synopsis,
    genre: JSON.parse(row.genre),
    durationMinutes: row.duration_minutes,
    certificate: row.certificate,
    rating: row.rating,
    language: row.language,
    poster: row.poster,
    backdrop: row.backdrop,
    accent: row.accent,
    releaseYear: row.release_year,
    startingPrice: showtimes.length
      ? Math.min(...showtimes.map((showtime) => showtime.price))
      : null,
    nextShowtimes: showtimes.slice(0, 3).map(serializeShowtime),
  };
}

export function serializeShowtime(row) {
  return {
    id: row.id,
    movieId: row.movie_id,
    date: row.show_date,
    time: row.start_time,
    screen: row.screen,
    format: row.format,
    price: row.price,
  };
}
