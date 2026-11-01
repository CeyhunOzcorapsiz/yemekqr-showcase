import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:4100",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: ".cache/playwright-results",
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:4100/api/ready",
    reuseExistingServer: false,
    timeout: 45000,
  },
});
