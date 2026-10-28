import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Check a running local stack. This intentionally creates one demo reservation.
const urls = {
  app: new URL(process.env.MONITORING_APP_URL || "http://127.0.0.1:3000"),
  prometheus: new URL(process.env.PROMETHEUS_URL || "http://127.0.0.1:9090"),
  grafana: new URL(process.env.GRAFANA_URL || "http://127.0.0.1:3001"),
};
const datasourceUid = "cinebook-prometheus";
const report = { startedAt: new Date().toISOString(), checks: [] };
let grafanaAuthorization;

async function check(name, action) {
  try {
    await action();
    report.checks.push({ name, status: "passed" });
    console.log(`PASS: ${name}`);
  } catch (error) {
    report.checks.push({ name, status: "failed", message: error.message });
    throw error;
  }
}

async function http(service, path, { status = 200, ...options } = {}) {
  const url = new URL(path, urls[service]);
  assert.equal(url.origin, urls[service].origin, "Checks must stay on their configured local origin");
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(service === "grafana" ? { Authorization: grafanaAuthorization } : {}),
      ...options.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, `${service} ${url.pathname} must return HTTP ${status}`);
  return response;
}

async function json(service, path, options) {
  return (await http(service, path, options)).json();
}

async function scrape() {
  const response = await http("app", "/metrics");
  assert.match(response.headers.get("content-type") || "", /text\/plain/);
  return response.text();
}

function sample(text, name, labels = {}) {
  const lines = text.split("\n").filter((line) =>
    (line.startsWith(`${name}{`) || line.startsWith(`${name} `)) &&
    Object.entries(labels).every(([key, value]) => line.includes(`${key}="${value}"`)),
  );
  assert(lines.length, `${name} must expose a sample for the requested labels`);
  return lines.reduce((sum, line) => sum + Number(line.trim().split(/\s+/).at(-1)), 0);
}

async function query(expression) {
  const response = await json("prometheus", `/api/v1/query?${new URLSearchParams({ query: expression })}`);
  assert.equal(response.status, "success", "Prometheus must accept the query");
  assert.equal(response.data.resultType, "vector");
  const values = response.data.result.map((entry) => Number(entry.value[1]));
  assert(values.length && values.every(Number.isFinite), `Prometheus must return real numeric data for ${expression}`);
  return values;
}

async function eventually(action, timeout = 75_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    try { return await action(); }
    catch (error) { lastError = error; }
    await delay(1500);
  } while (Date.now() < deadline);
  throw lastError;
}

try {
  await check("Verification uses local URLs and environment-based Grafana credentials", () => {
    for (const url of Object.values(urls)) {
      assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a localhost monitoring URL");
      assert.equal(url.protocol, "http:");
      assert(!url.username && !url.password, "Keep credentials in environment variables, outside URLs");
    }
    const username = process.env.GF_SECURITY_ADMIN_USER;
    const password = process.env.GF_SECURITY_ADMIN_PASSWORD;
    assert(username && password, "Set GF_SECURITY_ADMIN_USER and GF_SECURITY_ADMIN_PASSWORD for the running Grafana instance");
    grafanaAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    report.origins = Object.fromEntries(Object.entries(urls).map(([name, url]) => [name, url.origin]));
  });

  await check("Application, Prometheus and Grafana are healthy", async () => {
    assert.deepEqual(await json("app", "/api/health"), { status: "ok", database: "connected" });
    await http("prometheus", "/-/ready");
    assert.equal((await json("grafana", "/api/health")).database, "ok");
  });

  await check("Prometheus job cinebook scrapes app:3000/metrics and is UP", async () => {
    await eventually(async () => {
      const targets = await json("prometheus", "/api/v1/targets");
      const target = targets.data.activeTargets.find((entry) => entry.labels.job === "cinebook");
      assert(target, "The cinebook scrape target must exist");
      assert.equal(target.scrapeUrl, "http://app:3000/metrics");
      assert.equal(target.health, "up", "The cinebook target must be UP");
      assert.equal(target.lastError, "");
      report.target = { job: target.labels.job, scrapeUrl: target.scrapeUrl, health: target.health };
      assert.deepEqual(await query('up{job="cinebook"}'), [1]);
    });
  });

  let dashboard;
  await check("Grafana automatically provisions the Prometheus data source and CineBook dashboard", async () => {
    const datasource = await json("grafana", `/api/datasources/uid/${datasourceUid}`);
    assert.equal(datasource.type, "prometheus");
    assert.equal(datasource.url, "http://prometheus:9090");
    assert.equal(datasource.isDefault, true);
    assert.equal((await json("grafana", `/api/datasources/uid/${datasourceUid}/health`)).status, "OK");
    const provisioned = await json("grafana", "/api/dashboards/uid/cinebook-overview");
    assert.equal(provisioned.meta.provisioned, true);
    dashboard = provisioned.dashboard;
    assert(dashboard.panels.length >= 8, "The dashboard must include useful operational panels");
    report.dashboard = { uid: dashboard.uid, title: dashboard.title, panels: dashboard.panels.length };
  });

  let movies;
  await check("Real catalogue requests increment HTTP counters and latency histogram observations", async () => {
    ({ movies } = await json("app", "/api/movies"));
    const before = await scrape();
    const labels = { method: "GET", route: "/api/movies", status: "200" };
    const count = sample(before, "cinebook_http_requests_total", labels);
    const observations = sample(before, "cinebook_http_request_duration_seconds_count", labels);
    for (let index = 0; index < 8; index += 1) await json("app", "/api/movies");
    const after = await scrape();
    const requests = sample(after, "cinebook_http_requests_total", labels);
    assert(requests >= count + 8);
    assert(sample(after, "cinebook_http_request_duration_seconds_count", labels) >= observations + 8);
    assert.equal(sample(after, "cinebook_http_request_duration_seconds_bucket", { ...labels, le: "+Inf" }), sample(after, "cinebook_http_request_duration_seconds_count", labels));
    assert.match(after, /# TYPE cinebook_http_request_duration_seconds histogram/);
    report.requests = { before: count, after: requests };
  });

  await check("Node.js process CPU, memory and event-loop metrics expose real samples", async () => {
    const metrics = await scrape();
    assert(sample(metrics, "process_resident_memory_bytes") > 0);
    assert(sample(metrics, "process_cpu_seconds_total") >= 0);
    assert(sample(metrics, "nodejs_heap_size_used_bytes") > 0);
    assert(sample(metrics, "nodejs_eventloop_lag_seconds") >= 0);
    assert(sample(metrics, "cinebook_uptime_seconds") > 0);
  });

  let confirmedAfter;
  await check("A real confirmed booking increments both booking metrics exactly once; duplicate seats are rejected", async () => {
    const before = await scrape();
    const stored = sample(before, "cinebook_bookings");
    const confirmed = sample(before, "cinebook_bookings_confirmed_total");
    const { showtimes } = await json("app", `/api/movies/${movies[0].id}/showtimes`);
    let showtime;
    let available;
    let map;
    for (const candidate of showtimes.toReversed()) {
      map = await json("app", `/api/showtimes/${candidate.id}/seats`);
      available = map.rows.flatMap((row) => Array.from({ length: map.seatsPerRow }, (_, index) => `${row}${index + 1}`))
        .find((seat) => !map.bookedSeats.includes(seat));
      if (available) { showtime = candidate; break; }
    }
    assert(showtime, "A future showtime must have an available demo seat");
    const payload = { showtimeId: showtime.id, seats: [available], customerName: "Monitoring Verification", customerEmail: "monitoring@example.test" };
    const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
    const { booking } = await json("app", "/api/bookings", { ...options, status: 201 });
    assert.equal(booking.total, map.price);
    const duplicate = await json("app", "/api/bookings", { ...options, status: 409 });
    assert.equal(duplicate.code, "SEAT_UNAVAILABLE");
    const after = await scrape();
    confirmedAfter = sample(after, "cinebook_bookings");
    assert.equal(confirmedAfter, stored + 1);
    assert.equal(sample(after, "cinebook_bookings_confirmed_total"), confirmed + 1);
    report.booking = { reference: booking.reference, seats: booking.seats, before: stored, after: confirmedAfter };
  });

  await check("Prometheus ingests the changed request and confirmed booking values", async () => {
    await eventually(async () => {
      assert((await query('sum(cinebook_bookings{job="cinebook"})'))[0] >= confirmedAfter);
      assert((await query('sum(cinebook_http_requests_total{job="cinebook",route="/api/movies",method="GET",status="200"})'))[0] >= report.requests.after);
      assert((await query('sum(cinebook_bookings_confirmed_total{job="cinebook"})'))[0] >= 1);
    });
  });

  await check("Every provisioned dashboard query returns numeric data in Prometheus", async () => {
    const panels = dashboard.panels.filter((panel) => panel.targets?.some((target) => target.expr));
    report.panels = [];
    for (const panel of panels) {
      for (const target of panel.targets.filter((entry) => entry.expr)) {
        const expression = target.expr.replaceAll("$__rate_interval", "1m").replaceAll("$__interval", "10s").replaceAll("$__range", "15m");
        const values = await eventually(() => query(expression));
        report.panels.push({ title: panel.title, expression, values });
      }
    }
  });

  await check("Grafana queries real availability, requests and confirmed bookings through its provisioned data source", async () => {
    const expressions = ['up{job="cinebook"}', 'sum(cinebook_http_requests_total{job="cinebook"})', 'sum(cinebook_bookings{job="cinebook"})'];
    const now = Date.now();
    const response = await json("grafana", "/api/ds/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: String(now - 300_000), to: String(now),
        queries: expressions.map((expr, index) => ({
          refId: String.fromCharCode(65 + index), datasource: { type: "prometheus", uid: datasourceUid },
          expr, instant: true, range: false, format: "table", intervalMs: 1000, maxDataPoints: 300,
        })),
      }),
    });
    report.grafanaValues = [];
    for (const [index, expected] of [1, 1, confirmedAfter].entries()) {
      const result = response.results[String.fromCharCode(65 + index)];
      assert(result && !result.error, "Grafana data source queries must succeed");
      const values = result.frames.flatMap((frame) => frame.schema.fields.flatMap((field, fieldIndex) =>
        field.type === "number" ? frame.data.values[fieldIndex] : [],
      )).filter((value) => typeof value === "number" && Number.isFinite(value));
      assert(values.some((value) => value >= expected), "Grafana must receive the real metric value");
      report.grafanaValues.push({ expression: expressions[index], values });
    }
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  console.error(`Monitoring verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.artifacts/monitoring-test-results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Monitoring verification ${report.status}. Results: .artifacts/monitoring-test-results.json`);
}
