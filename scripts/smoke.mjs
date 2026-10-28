import assert from "node:assert/strict";

const baseURL = new URL(process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.APP_PORT || process.env.PORT || 3001}`);

async function get(path) {
  const url = new URL(path, baseURL);
  assert.equal(url.origin, baseURL.origin, "Smoke checks must stay on the app origin");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    headers: path === "/metrics" && process.env.METRICS_TOKEN
      ? { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } : {},
  });
  assert.equal(response.status, 200, `${url.pathname} must return HTTP 200`);
  return response;
}

try {
  const health = await (await get("/api/health")).json();
  assert.deepEqual(health, { status: "ok", database: "connected" });

  const homepage = await get("/");
  assert.match(homepage.headers.get("content-type") || "", /text\/html/);
  const html = await homepage.text();
  assert.match(html, /CineBook/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)]
    .map((match) => match[1]);
  assert(assets.some((asset) => asset.endsWith(".js")), "Production JS must be linked");
  assert(assets.some((asset) => asset.endsWith(".css")), "Production CSS must be linked");
  for (const asset of new Set(assets)) {
    const response = await get(asset);
    const type = response.headers.get("content-type") || "";
    assert.match(type, asset.endsWith(".css") ? /text\/css/ : /javascript/);
    assert((await response.text()).length > 0, `${asset} must not be empty`);
  }

  const { movies } = await (await get("/api/movies")).json();
  assert.equal(movies.length, 10, "All ten demo films must be available");
  for (const movie of movies) {
    const poster = await get(movie.poster);
    assert.match(poster.headers.get("content-type") || "", /image\/svg\+xml/);
    assert.match(await poster.text(), /<svg\b/);
  }

  const { showtimes } = await (await get(`/api/movies/${movies[0].id}/showtimes`)).json();
  assert(showtimes.length > 0, "Upcoming showtimes must be seeded");
  const seats = await (await get(`/api/showtimes/${showtimes[0].id}/seats`)).json();
  assert.equal(seats.rows.length * seats.seatsPerRow, 60);

  if (process.env.METRICS_TOKEN) {
    const unauthenticated = await fetch(new URL("/metrics", baseURL), { redirect: "error" });
    assert.equal(unauthenticated.status, 401, "Hosted metrics must reject anonymous access");
  }
  const metrics = await get("/metrics");
  assert.match(metrics.headers.get("content-type") || "", /text\/plain/);
  assert.match(await metrics.text(), /^# (?:HELP|TYPE) /m);

  console.log(`Smoke checks passed for ${baseURL.origin}: database, production assets, ten posters, showtimes, seats, and metrics.`);
} catch (error) {
  console.error(`Smoke checks failed for ${baseURL.origin}: ${error.message}`);
  process.exitCode = 1;
}
