import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*browser.spec.js",
  timeout: 120000,
  workers: 1,
  use: {
    browserName: process.env.LAB_BROWSER || "chromium",
    baseURL: process.env.LAB_URL || "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    launchOptions:
      process.env.LAB_BROWSER === "webkit"
        ? {}
        : {
            args: [
              "--enable-gpu",
              "--use-angle=metal",
              "--ignore-gpu-blocklist",
              "--disable-background-timer-throttling",
              "--disable-renderer-backgrounding",
              "--disable-backgrounding-occluded-windows",
            ],
          },
  },
});
