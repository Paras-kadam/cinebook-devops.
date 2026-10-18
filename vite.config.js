import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { apiOrigin, webPort } from "./server/config.js";
import { waitForCineBookApi } from "./scripts/check-api.mjs";

export default defineConfig({
  root: "client",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "cinebook-api-readiness",
      apply: "serve",
      async configureServer() {
        await waitForCineBookApi(apiOrigin);
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiOrigin,
        configure(proxy) {
          proxy.on("error", (_error, _request, response) => {
            if (response && !response.headersSent && "writeHead" in response) {
              response.writeHead(502, { "Content-Type": "application/json" });
              response.end(JSON.stringify({
                error: "The cinema service is temporarily unavailable. Please try again shortly.",
                code: "API_UNAVAILABLE",
              }));
            }
          });
        },
      },
      "/metrics": apiOrigin,
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
