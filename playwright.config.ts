import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-phone-390",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: "chromium-tablet-768",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: "chromium-desktop-1280",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "chromium-desktop-1440",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit-desktop-1280",
      use: { browserName: "webkit", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "firefox-desktop-1280",
      use: { browserName: "firefox", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "chromium-reduced-motion",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 900 },
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],
});
