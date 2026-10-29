import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The native libSQL binding may release Windows files only when its worker exits.
// Own fixtures in a separate parent process and remove them after Vitest exits.
const fixtureRoot = await mkdtemp(join(tmpdir(), "cinebook-turso-run-"));
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let exitCode = 1;
try {
  const child = spawn(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"),
    ...(args.includes("--watch") ? [] : ["run"]), "--config", "vitest.config.js", ...args], {
    cwd: root, stdio: "inherit", windowsHide: true,
    env: { ...process.env, TURSO_TEST_ROOT: fixtureRoot },
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  exitCode = await new Promise((accept, reject) => {
    child.once("error", reject); child.once("exit", (code) => accept(code ?? 1));
  });
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
} finally {
  const target = resolve(fixtureRoot);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("cinebook-turso-run-")) {
    throw new Error("Refusing to remove an unexpected test fixture directory.");
  }
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.exitCode = exitCode;
