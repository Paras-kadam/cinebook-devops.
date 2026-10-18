import { setTimeout } from "node:timers/promises";

/** Wait for the API during parallel dev startup, and reject another app's health endpoint. */
export async function waitForCineBookApi(origin, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let response;
    try {
      response = await fetch(new URL("/api/health", origin), {
        signal: AbortSignal.timeout(Math.min(750, Math.max(1, deadline - Date.now()))),
      });
    } catch {
      await setTimeout(150);
      continue;
    }
    if (response.ok) {
      const health = await response.json().catch(() => null);
      if (health?.status === "ok" && health?.database === "connected") return;
      throw new Error(
        `The API address ${origin} is responding as a different service. Set PORT in the project .env to a free port (CineBook defaults to 3001), then restart npm run dev.`,
      );
    }
    await response.body?.cancel();
    await setTimeout(150);
  }
  throw new Error(
    `CineBook API is not ready at ${origin}. Run npm run dev from the project root to start both services, and check the API startup error above.`,
  );
}
