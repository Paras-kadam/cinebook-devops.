import { defineConfig, devices } from "@playwright/test";

const useEdge = process.platform === "win32";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.spec.js",
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    useEdge
      ? { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } }
      : { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      PORT: "3100",
      DB_PATH: "./data/browser-test.sqlite",
    },
  },
});
