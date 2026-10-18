import { createApp } from "./app.js";
import { port } from "./config.js";

const app = createApp({
  dbPath: process.env.DB_PATH || "data/cinebook.sqlite",
  serveClient:
    process.env.NODE_ENV === "production" ||
    process.argv.includes("--production"),
});
const server = app.listen(port, () => {
  console.log(`CineBook is running at http://localhost:${port}`);
});

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
  server.close(() => {
    if (app.locals.db.open) app.locals.db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
