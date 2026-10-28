import { createApp } from "./app.js";
import { port } from "./config.js";
import { validateStorage } from "./runtime.js";

const app = createApp({
  dbPath: validateStorage(),
  serveClient:
    process.env.NODE_ENV === "production" ||
    process.argv.includes("--production"),
});
const server = app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "started", host: "0.0.0.0", port,
    database: "connected", publicUrl: process.env.RENDER_EXTERNAL_URL || null }));
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;

server.on("error", (error) => {
  if (app.locals.db.open) app.locals.db.close();
  if (error.code === "EADDRINUSE") {
    console.error(
      `CineBook could not start because port ${port} is already in use. Stop the other server or change PORT.`,
    );
  } else {
    console.error(`CineBook could not start: ${error.message}`);
  }
  process.exitCode = 1;
});

function shutdown() {
  console.log(JSON.stringify({ event: "shutdown" }));
  setTimeout(() => process.exit(1), 12_000).unref();
  server.close(() => {
    if (app.locals.db.open) app.locals.db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
