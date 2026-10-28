import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

const httpMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]);

/** Each app owns its registry so tests and multiple app instances stay isolated. */
export function createMetrics(db) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const registers = [registry];
  const startedAt = performance.now();
  const movieCount = db.prepare("SELECT COUNT(*) AS count FROM movies");
  const bookingCount = db.prepare("SELECT COUNT(*) AS count FROM bookings");

  new Gauge({
    name: "cinebook_uptime_seconds",
    help: "Seconds since this application instance started.",
    registers,
    collect() {
      this.set((performance.now() - startedAt) / 1000);
    },
  });
  new Gauge({
    name: "cinebook_movies",
    help: "Number of movies stored in SQLite.",
    registers,
    collect() {
      this.set(movieCount.get().count);
    },
  });
  new Gauge({
    name: "cinebook_bookings",
    help: "Number of confirmed bookings stored in SQLite, retained across restarts.",
    registers,
    collect() {
      this.set(bookingCount.get().count);
    },
  });

  const confirmedBookings = new Counter({
    name: "cinebook_bookings_confirmed_total",
    help: "Successfully committed bookings since this application instance started.",
    registers,
  });
  const requests = new Counter({
    name: "cinebook_http_requests_total",
    help: "Completed HTTP requests by method, route template and response status.",
    labelNames: ["method", "route", "status"],
    registers,
  });
  const durations = new Histogram({
    name: "cinebook_http_request_duration_seconds",
    help: "Completed HTTP request duration in seconds.",
    labelNames: ["method", "route", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers,
  });

  function trackRequest(request, response, next) {
    const requestedAt = performance.now();
    response.once("finish", () => {
      // Only route templates and fixed categories become labels. Never use a
      // URL, query string, booking reference, asset filename or customer data.
      const route = typeof request.route?.path === "string"
        ? request.route.path
        : response.locals.metricsRoute || "unmatched";
      const labels = {
        method: httpMethods.has(request.method) ? request.method : "OTHER",
        route,
        status: String(response.statusCode),
      };
      requests.inc(labels);
      durations.observe(labels, (performance.now() - requestedAt) / 1000);
    });
    next();
  }

  return { registry, trackRequest, confirmedBookings };
}
