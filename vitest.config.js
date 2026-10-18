import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    reporters: ["default", "json"],
    outputFile: { json: ".artifacts/vitest-results.json" },
  },
});
