import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createApp } from "../server/app.js";

const now = () => new Date(2026, 9, 18, 9, 0, 0);
let app;
const additionalApps = [];

beforeEach(() => {
  app = createApp({ now });
});

afterEach(() => {
  for (const instance of [app, ...additionalApps.splice(0)]) {
    if (instance?.locals.db.open) instance.locals.db.close();
  }
});

function samples(text, name) {
  return text.split("\n")
    .filter((line) => line.startsWith(`${name} `) || line.startsWith(`${name}{`))
    .map((line) => {
      const labels = Object.fromEntries(
        Array.from(line.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"\\]*(?:\\.[^"\\]*)*)"/g),
          ([, key, value]) => [key, value]),
      );
      return { labels, value: Number(line.slice(line.lastIndexOf(" ") + 1)) };
    });
}

function sample(text, name, labels = {}) {
  const found = samples(text, name).find((entry) =>
    Object.entries(labels).every(([key, value]) => entry.labels[key] === value),
  );
  expect(found, `Missing ${name} ${JSON.stringify(labels)}`).toBeDefined();
  return found.value;
}

async function scrape(instance = app) {
  const response = await request(instance).get("/metrics").expect(200);
  expect(response.headers["content-type"]).toContain("text/plain; version=0.0.4");
  expect(response.headers["cache-control"]).toBe("no-store");
  return response.text;
}

async function nextShowtime(instance = app) {
  const { body } = await request(instance).get("/api/movies/1/showtimes").expect(200);
  return body.showtimes[0];
}

function customer(showtimeId, seats) {
  return {
    showtimeId,
    seats,
    customerName: "Metrics Test Customer",
    customerEmail: "private-metrics-customer@example.test",
  };
}

describe("Prometheus instrumentation", () => {
  it("exposes real process, runtime, database and uptime metrics before any bookings", async () => {
    const text = await scrape();
    expect(text).toContain("# TYPE process_cpu_user_seconds_total counter\n");
    expect(sample(text, "process_cpu_user_seconds_total")).toBeGreaterThanOrEqual(0);
    expect(sample(text, "process_resident_memory_bytes")).toBeGreaterThan(0);
    expect(sample(text, "nodejs_heap_size_used_bytes")).toBeGreaterThan(0);
    expect(sample(text, "nodejs_version_info")).toBe(1);
    expect(sample(text, "cinebook_movies")).toBe(10);
    expect(sample(text, "cinebook_bookings")).toBe(0);
    expect(sample(text, "cinebook_bookings_confirmed_total")).toBe(0);
    expect(sample(text, "cinebook_uptime_seconds")).toBeGreaterThan(0);
  });

  it("counts actual successes and failures and records cumulative duration buckets", async () => {
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/movies/999999").expect(404);
    await request(app).post("/api/bookings").send({}).expect(400);
    await request(app).post("/api/bookings").set("Content-Type", "application/json")
      .send('{"seats":').expect(400);
    const text = await scrape();
    const healthLabels = { method: "GET", route: "/api/health", status: "200" };
    expect(sample(text, "cinebook_http_requests_total", healthLabels)).toBe(2);
    expect(sample(text, "cinebook_http_requests_total", {
      method: "GET", route: "/api/movies/:id", status: "404",
    })).toBe(1);
    expect(sample(text, "cinebook_http_requests_total", {
      method: "POST", route: "/api/bookings", status: "400",
    })).toBe(1);
    // Invalid JSON is rejected before route matching but still gets measured.
    expect(sample(text, "cinebook_http_requests_total", {
      method: "POST", route: "unmatched", status: "400",
    })).toBe(1);
    expect(text).toContain("# TYPE cinebook_http_request_duration_seconds histogram\n");
    expect(sample(text, "cinebook_http_request_duration_seconds_count", healthLabels)).toBe(2);
    expect(sample(text, "cinebook_http_request_duration_seconds_sum", healthLabels)).toBeGreaterThan(0);
    const buckets = samples(text, "cinebook_http_request_duration_seconds_bucket")
      .filter(({ labels }) => Object.entries(healthLabels).every(([key, value]) => labels[key] === value));
    expect(buckets.some(({ labels }) => labels.le === "0.005")).toBe(true);
    expect(buckets.at(-1)).toMatchObject({ labels: { le: "+Inf" }, value: 2 });
    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index].value).toBeGreaterThanOrEqual(buckets[index - 1].value);
    }
  });

  it("aggregates route templates and unmatched URLs without leaking customer data or identifiers", async () => {
    const showtime = await nextShowtime();
    const created = await request(app).post("/api/bookings")
      .send(customer(showtime.id, ["D1"])).expect(201);
    const reference = created.body.booking.reference;
    await request(app).get(`/api/bookings/${reference}?email=private-query@example.test`).expect(200);
    for (const id of [1, 2, 3]) await request(app).get(`/api/movies/${id}`).expect(200);
    for (let index = 0; index < 8; index += 1) {
      await request(app).get(`/api/private-customer-${index}?token=private-token-${index}`).expect(404);
    }
    const text = await scrape();
    expect(sample(text, "cinebook_http_requests_total", {
      method: "GET", route: "/api/movies/:id", status: "200",
    })).toBe(3);
    expect(sample(text, "cinebook_http_requests_total", {
      method: "GET", route: "unmatched", status: "404",
    })).toBe(8);
    expect(sample(text, "cinebook_http_requests_total", {
      method: "GET", route: "/api/bookings/:reference", status: "200",
    })).toBe(1);
    for (const privateValue of [reference, "Metrics Test Customer", "private-metrics-customer", "private-query", "private-token", "private-customer-"]) {
      expect(text).not.toContain(privateValue);
    }
    for (const { labels } of samples(text, "cinebook_http_requests_total")) {
      expect(Object.keys(labels).sort()).toEqual(["method", "route", "status"]);
    }
  });

  it("counts committed bookings once and excludes duplicate seats, rollback and validation failures", async () => {
    const showtime = await nextShowtime();
    await request(app).post("/api/bookings").send(customer(showtime.id, ["A2"])).expect(201);
    await request(app).post("/api/bookings").send(customer(showtime.id, ["A2"])).expect(409);
    // A1 inserts before the conflicting A2; the entire transaction must roll back.
    await request(app).post("/api/bookings").send(customer(showtime.id, ["A1", "A2"])).expect(409);
    await request(app).post("/api/bookings").send(customer(showtime.id, [])).expect(400);
    const first = await scrape();
    expect(sample(first, "cinebook_bookings_confirmed_total")).toBe(1);
    expect(sample(first, "cinebook_bookings")).toBe(1);
    const seats = await request(app).get(`/api/showtimes/${showtime.id}/seats`).expect(200);
    expect(seats.body.bookedSeats).toEqual(["A2"]);
    await request(app).post("/api/bookings").send(customer(showtime.id, ["A1"])).expect(201);
    const second = await scrape();
    expect(sample(second, "cinebook_bookings_confirmed_total")).toBe(2);
    expect(sample(second, "cinebook_bookings")).toBe(2);
    expect(sample(second, "cinebook_http_requests_total", {
      method: "POST", route: "/api/bookings", status: "201",
    })).toBe(2);
    expect(sample(second, "cinebook_http_requests_total", {
      method: "POST", route: "/api/bookings", status: "409",
    })).toBe(2);
  });

  it("isolates registries so a second app starts without another app's counters", async () => {
    await request(app).get("/api/health").expect(200);
    const other = createApp({ now });
    additionalApps.push(other);
    const first = await scrape();
    const second = await scrape(other);
    expect(sample(first, "cinebook_http_requests_total", { route: "/api/health" })).toBe(1);
    expect(samples(second, "cinebook_http_requests_total").some(({ labels }) => labels.route === "/api/health")).toBe(false);
    expect(sample(second, "cinebook_bookings_confirmed_total")).toBe(0);
  });

  it("reads the durable booking gauge after reopening SQLite while the process counter resets", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cinebook-metrics-test-"));
    const dbPath = join(directory, "bookings.sqlite");
    try {
      const firstApp = createApp({ dbPath, now });
      additionalApps.push(firstApp);
      const showtime = await nextShowtime(firstApp);
      const created = await request(firstApp).post("/api/bookings")
        .send(customer(showtime.id, ["F10"])).expect(201);
      expect(sample(await scrape(firstApp), "cinebook_bookings_confirmed_total")).toBe(1);
      firstApp.locals.db.close();
      const reopened = createApp({ dbPath, now });
      additionalApps.push(reopened);
      await request(reopened).get(`/api/bookings/${created.body.booking.reference}`).expect(200);
      const text = await scrape(reopened);
      expect(sample(text, "cinebook_bookings")).toBe(1);
      expect(sample(text, "cinebook_bookings_confirmed_total")).toBe(0);
    } finally {
      for (const instance of additionalApps.splice(0)) {
        if (instance.locals.db.open) instance.locals.db.close();
      }
      const target = resolve(directory);
      if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(target).startsWith("cinebook-metrics-test-")) {
        throw new Error("Refusing to remove a directory outside the generated metrics test fixture.");
      }
      rmSync(target, { recursive: true, force: true });
    }
  });
});
