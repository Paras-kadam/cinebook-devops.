const origin = `http://127.0.0.1:${process.env.PORT || 3000}`;

try {
  const response = await fetch(`${origin}/api/health`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const health = await response.json();
  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error("The CineBook API or SQLite database is not healthy");
  }
  console.log("CineBook HTTP and SQLite are healthy");
} catch (error) {
  console.error(`CineBook health check failed at ${origin}: ${error.message}`);
  process.exitCode = 1;
}
