import { openTursoDatabase } from "../server/turso.js";
let database;
try {
  const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"].filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(JSON.stringify({ status: "configuration_required", missing,
      hint: "Fill these fields in the existing .env.production.local file and save it. Keep values private." }));
    process.exitCode = 1;
  } else {
    database = await openTursoDatabase();
    await database.prepare("SELECT 1").get();
    const movies = await database.prepare("SELECT COUNT(*) AS count FROM movies").get();
    const bookings = await database.prepare("SELECT COUNT(*) AS count FROM bookings").get();
    console.log(JSON.stringify({ status: "ok", provider: "turso", movies: movies.count, bookings: bookings.count }));
  }
} catch (error) {
  console.error(JSON.stringify({ status: "failed", code: error.code || "CHECK_DATABASE_SETTINGS",
    hint: "Check the private TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. No secrets have been printed." }));
  process.exitCode = 1;
} finally { if (database?.open) database.close(); }
