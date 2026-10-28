import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";

export function validateSecurity({ metricsToken, requireMetricsAuth, trustProxy }) {
  if (requireMetricsAuth && (!metricsToken || metricsToken.length < 32)) {
    throw new Error("Set a private METRICS_TOKEN of at least 32 characters before cloud startup.");
  }
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) {
    throw new Error("TRUST_PROXY must be an integer between 0 and 5.");
  }
}

export function configureSecurity(app, {
  serveClient, metricsToken, requireMetricsAuth, trustProxy,
  apiLimit, bookingLimit, requestLogging,
}) {
  app.set("trust proxy", trustProxy);
  app.use(helmet({
    contentSecurityPolicy: serveClient ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        // Render terminates TLS; preserve ordinary local HTTP development.
        upgradeInsecureRequests: null,
      },
    } : false,
    strictTransportSecurity: false,
    referrerPolicy: { policy: "no-referrer" },
  }));
  app.use((request, response, next) => {
    if (request.secure) response.set("Strict-Transport-Security", "max-age=31536000");
    if (requestLogging) {
      const started = performance.now();
      response.once("finish", () => console.log(JSON.stringify({
        event: "http_request", method: request.method,
        route: request.route?.path || response.locals.metricsRoute || "unmatched",
        status: response.statusCode, durationMs: Math.round(performance.now() - started),
      })));
    }
    next();
  });
  // No cross-origin API permission is needed: React and Express share one origin.
  app.use("/api", (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        request.get("Sec-Fetch-Site") === "cross-site") {
      return response.status(403).json({ error: "Use the CineBook website to book tickets.", code: "CROSS_SITE_REQUEST" });
    }
    next();
  });
  const options = {
    windowMs: 60_000, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
  };
  app.use("/api", rateLimit({ ...options, limit: apiLimit,
    skip: (request) => request.path === "/health",
  }));
  app.use("/api/bookings", rateLimit({ ...options, limit: bookingLimit }));
  const expected = Buffer.from(metricsToken || "");
  app.use("/metrics", (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!expected.length && !requireMetricsAuth) return next();
    // Only an Authorization header is accepted; never put tokens in URLs.
    const supplied = Buffer.from((request.get("Authorization") || "").replace(/^Bearer /, ""));
    if (request.get("Authorization")?.startsWith("Bearer ") &&
        supplied.length === expected.length && timingSafeEqual(supplied, expected)) return next();
    return response.set("WWW-Authenticate", "Bearer").status(401)
      .json({ error: "Metrics authorization is required.", code: "METRICS_UNAUTHORIZED" });
  });
}
