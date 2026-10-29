import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/app.js";
import { validateStorage } from "../server/runtime.js";
import { resolve } from "node:path";

const apps = [];
const make = (options = {}) => {
  const app = createApp({ ...options });
  apps.push(app);
  return app;
};
afterEach(() => { for (const app of apps.splice(0)) if (app.locals.db.open) app.locals.db.close(); });

describe("production safeguards", () => {
  it("protects metrics with a bearer token without preventing public health or catalogue access", async () => {
    const token = "a-test-token-with-more-than-32-characters";
    const app = make({ metricsToken: token, requireMetricsAuth: true });
    for (const authorization of [undefined, "Bearer wrong", `Basic ${token}`]) {
      const call = request(app).get("/metrics");
      if (authorization) call.set("Authorization", authorization);
      await call.expect(401);
    }
    await request(app).get(`/metrics?token=${token}`).expect(401);
    const metrics = await request(app).get("/metrics").set("Authorization", `Bearer ${token}`).expect(200);
    expect(metrics.text).toContain("cinebook_movies 10");
    expect(metrics.text).not.toContain(token);
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/movies").expect(200);
  });

  it("fails before opening a database if cloud metrics credentials or proxy settings are unsafe", () => {
    expect(() => make({ requireMetricsAuth: true, metricsToken: "" })).toThrow("METRICS_TOKEN");
    expect(() => make({ trustProxy: NaN })).toThrow("TRUST_PROXY");
  });

  it("limits requests with HTTP 429 and keeps database health probes available", async () => {
    const app = make({ apiLimit: 2 });
    await request(app).get("/api/movies").expect(200);
    await request(app).get("/api/movies").expect(200);
    const limited = await request(app).get("/api/movies").expect(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.body.code).toBe("RATE_LIMITED");
    await request(app).get("/api/health").expect(200);
  });

  it("limits booking access independently and does not write invalid reservations", async () => {
    const app = make({ bookingLimit: 1 });
    await request(app).post("/api/bookings").send({}).expect(400);
    await request(app).post("/api/bookings").send({}).expect(429);
    expect(app.locals.db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n).toBe(0);
    await request(app).get("/api/movies").expect(200);
  });

  it("blocks browser cross-site booking and sets privacy/security headers", async () => {
    const app = make({ serveClient: true, trustProxy: 1 });
    await request(app).post("/api/bookings").set("Sec-Fetch-Site", "cross-site").send({}).expect(403);
    const response = await request(app).get("/api/movies").set("X-Forwarded-Proto", "https").expect(200);
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["strict-transport-security"]).toContain("31536000");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    await request(app).get("/.env").expect(404);
    await request(app).get("/data/cinebook.sqlite").expect(404);
  });

  it("trusts only the last proxy hop so a forged leading IP cannot evade limits", async () => {
    const app = make({ trustProxy: 1, apiLimit: 1 });
    await request(app).get("/api/movies").set("X-Forwarded-For", "198.51.100.1, 203.0.113.5").expect(200);
    await request(app).get("/api/movies").set("X-Forwarded-For", "198.51.100.2, 203.0.113.5").expect(429);
    await request(app).get("/api/movies").set("X-Forwarded-For", "203.0.113.6").expect(200);
  });

  it("refuses cloud SQLite outside a real mounted disk while allowing local storage", () => {
    expect(validateStorage({ DB_PATH: "data/local.sqlite" })).toBe("data/local.sqlite");
    const directory = resolve("persistent-fixture");
    const environment = { RENDER: "true", PERSISTENT_DATA_DIR: directory,
      DB_PATH: resolve(directory, "cinebook.sqlite") };
    const escapedDirectory = directory.replaceAll(" ", "\\040");
    const fixture = { mountInfo: () => `1 0 0:1 / ${escapedDirectory} rw - ext4 /dev/test rw`, realpath: (path) => path };
    expect(validateStorage(environment, fixture)).toBe(environment.DB_PATH);
    expect(() => validateStorage(environment, { ...fixture, mountInfo: () => "" })).toThrow("not mounted");
    for (const dbPath of [":memory:", "relative.sqlite", resolve(directory, "../lost.sqlite")]) {
      expect(() => validateStorage({ ...environment, DB_PATH: dbPath }, fixture)).toThrow("absolute file path");
    }
  });
});
