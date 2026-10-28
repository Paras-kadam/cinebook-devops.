import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function validateStorage(environment = process.env, {
  mountInfo = () => readFileSync("/proc/self/mountinfo", "utf8"),
  realpath = realpathSync,
} = {}) {
  const dbPath = environment.DB_PATH || "data/cinebook.sqlite";
  if (environment.RENDER !== "true" && environment.REQUIRE_PERSISTENT_DISK !== "true") return dbPath;
  const directory = resolve(environment.PERSISTENT_DATA_DIR || "/app/data");
  const inside = relative(directory, resolve(dbPath));
  if (dbPath === ":memory:" || !isAbsolute(dbPath) || !inside ||
      inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error("Cloud DB_PATH must be an absolute file path inside PERSISTENT_DATA_DIR.");
  }
  const unescapeMount = (value) => value.replace(/\\([0-7]{3})/g, (_, octal) =>
    String.fromCharCode(parseInt(octal, 8)));
  const mounted = mountInfo().split("\n").some((line) =>
    unescapeMount(line.split(" ")[4] || "") === realpath(directory));
  if (!mounted) throw new Error("Persistent database disk is not mounted. Refusing to store cloud bookings on ephemeral storage.");
  return dbPath;
}
