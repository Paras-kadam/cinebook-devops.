import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";
import { schemaSQL, serializeBooking } from "./database.js";
import { movies, SHOW_TIMES, upcomingDates } from "./seed.js";

export function validateTursoSettings(url, authToken, allowLocal = false) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Set TURSO_DATABASE_URL to the database URL from Turso."); }
  const local = allowLocal && (parsed.protocol === "file:" ||
    (["http:", "ws:"].includes(parsed.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
  if (!local && !["libsql:", "https:"].includes(parsed.protocol)) {
    throw new Error("Turso must use an encrypted remote libsql:// or https:// URL; cloud file databases are forbidden.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Keep database credentials in TURSO_AUTH_TOKEN, outside the database URL.");
  }
  if (!local && !authToken?.trim()) throw new Error("Set TURSO_AUTH_TOKEN privately before startup.");
}

export async function openTursoDatabase({
  url = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN,
  now = new Date(),
  allowLocal = false,
} = {}) {
  validateTursoSettings(url, authToken, allowLocal);
  const client = createClient({ url, authToken, intMode: "number" });
  const adapter = {
    kind: "turso", open: true,
    close() { client.close(); this.open = false; },
    prepare(sql) {
      const execute = (args) => client.execute({ sql,
        args: args.length === 1 && args[0] !== null && typeof args[0] === "object" && !Array.isArray(args[0]) ? args[0] : args });
      return {
        async get(...args) { return (await execute(args)).rows[0]; },
        async all(...args) { return (await execute(args)).rows; },
        async run(...args) { return execute(args); },
      };
    },
    async reserveSeats(input, currentTime, validateShowtime) {
      const transaction = await client.transaction("write");
      try {
        const showtime = (await transaction.execute({
          sql: `SELECT s.*, m.title, m.poster, m.duration_minutes, m.certificate
            FROM showtimes s JOIN movies m ON m.id = s.movie_id WHERE s.id = ?`,
          args: [input.showtimeId],
        })).rows[0];
        validateShowtime(showtime);
        const reference = `CB-${randomBytes(12).toString("hex").toUpperCase()}`;
        const inserted = await transaction.execute({
          sql: `INSERT INTO bookings
            (reference, showtime_id, customer_name, customer_email, unit_price, total, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [reference, showtime.id, input.customerName, input.customerEmail,
            showtime.price, showtime.price * input.seats.length, currentTime.toISOString()],
        });
        // Send all seat writes together to avoid one network round trip per seat.
        await transaction.batch(input.seats.map((seat) => ({
          sql: "INSERT INTO booked_seats (booking_id, showtime_id, seat) VALUES (?, ?, ?)",
          args: [inserted.lastInsertRowid, showtime.id, seat],
        })));
        // Capture the complete ticket while the transaction is open. Returning it
        // requires no new remote reads after seats have been durably committed.
        const booking = serializeBooking({
          ...showtime,
          reference,
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          unit_price: showtime.price,
          total: showtime.price * input.seats.length,
          created_at: currentTime.toISOString(),
        }, input.seats);
        // No booking confirmation or metric increment occurs before remote COMMIT.
        await transaction.commit();
        return booking;
      } catch (error) {
        if (!transaction.closed) await transaction.rollback().catch(() => {});
        if (error.code === "SQLITE_CONSTRAINT" && (error.rawCode === 2067 || /UNIQUE constraint failed: (?:booked_seats|bookings)\./i.test(error.message))) error.code = "SQLITE_CONSTRAINT_UNIQUE";
        throw error;
      } finally { transaction.close(); }
    },
  };
  let seededWindow;
  let seeding;
  adapter.seedShowtimes = async (currentTime) => {
    const dates = upcomingDates(currentTime);
    const key = dates.join(",");
    if (seededWindow === key) return dates;
    if (seeding) await seeding;
    if (seededWindow === key) return dates;
    seeding = client.batch(movies.flatMap((movie) => dates.flatMap((date) => SHOW_TIMES.map((time) => ({
      sql: "INSERT OR IGNORE INTO showtimes (movie_id, show_date, start_time, screen, format, price) VALUES (?, ?, ?, ?, ?, ?)",
      args: [movie.id, date, time, `Screen ${movie.id}`, movie.format, movie.price],
    })))), "write");
    try { await seeding; seededWindow = key; } finally { seeding = undefined; }
    return dates;
  };
  try {
    await client.executeMultiple(schemaSQL);
    await client.batch(movies.map((movie) => ({
      sql: `INSERT OR IGNORE INTO movies
        (id, title, tagline, synopsis, genre, duration_minutes, certificate, rating, language, poster, backdrop, accent, release_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [movie.id, movie.title, movie.tagline, movie.synopsis, JSON.stringify(movie.genre),
        movie.durationMinutes, movie.certificate, movie.rating, movie.language,
        `/posters/${movie.slug}.svg`, `/posters/${movie.slug}.svg`, movie.accent, movie.releaseYear],
    })), "write");
    await adapter.seedShowtimes(now);
    return adapter;
  } catch (error) { adapter.close(); throw error; }
}
