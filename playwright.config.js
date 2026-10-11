import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "test/e2e",
  timeout: 30_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Pixel 7"],
    // Locally use the installed Chrome (no browser download needed); CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : "chrome",
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: "allow",
  },
  webServer: {
    command: `node scripts/serve.mjs dist ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
