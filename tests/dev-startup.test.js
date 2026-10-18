import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createApp } from "../server/app.js";
import { waitForCineBookApi } from "../scripts/check-api.mjs";

const servers = [];
const databases = [];
async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  for (const db of databases.splice(0)) if (db.open) db.close();
});

describe("development API readiness", () => {
  it("accepts the real CineBook API after SQLite initializes", async () => {
    const app = createApp();
    databases.push(app.locals.db);
    const origin = await listen(app);
    await expect(waitForCineBookApi(origin)).resolves.toBeUndefined();
  });

  it("rejects the Grafana health response that caused the empty movie list", async () => {
    const origin = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ database: "ok", version: "13.2.3" }));
    });
    await expect(waitForCineBookApi(origin)).rejects.toThrow("different service");
  });

  it("waits for the API instead of racing parallel service startup", async () => {
    let requests = 0;
    const origin = await listen((_request, response) => {
      const ready = ++requests >= 3;
      response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      response.end(JSON.stringify(ready ? { status: "ok", database: "connected" } : { error: "Starting" }));
    });
    await expect(waitForCineBookApi(origin, 2000)).resolves.toBeUndefined();
    expect(requests).toBe(3);
  });

  it("reports an unavailable backend instead of serving a broken homepage", async () => {
    const origin = await listen((_request, response) => {
      response.writeHead(503).end();
    });
    await expect(waitForCineBookApi(origin, 250)).rejects.toThrow("npm run dev");
  });
});
