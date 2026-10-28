import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

// SQLite's online backup API includes committed WAL data. Do not copy a live .sqlite file alone.
const source = resolve(process.env.DB_PATH || "data/cinebook.sqlite");
const destination = resolve(process.argv[2] || `${dirname(source)}/backups/cinebook-${Date.now()}-${randomBytes(6).toString("hex")}.sqlite`);
if (existsSync(destination)) throw new Error("Backup destination exists; choose a new filename.");
if (!existsSync(source)) throw new Error("Database does not exist; refusing to create an empty database.");
mkdirSync(dirname(destination), { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
  const backup = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup integrity check failed.");
    console.log(JSON.stringify({ event: "backup_completed", file: destination,
      bookings: backup.prepare("SELECT COUNT(*) AS count FROM bookings").get().count }));
  } finally { backup.close(); }
} finally { db.close(); }
