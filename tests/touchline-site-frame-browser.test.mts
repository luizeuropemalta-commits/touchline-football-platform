import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, statfsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { webkit } from "@playwright/test";
import { frameCss, renderFrame, type FrameState } from "./helpers/touchline-site-frame-fixture.mts";

test("real frame CSS reserves the footer position through empty, loading and ready markup", {
  skip: process.env.TOUCHLINE_RUN_SITE_FRAME_BROWSER_TESTS !== "1", timeout: 60_000,
}, async t => {
  const capacity = () => {
    const disk = statfsSync(new URL("../", import.meta.url));
    assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "stop below 5 GiB free");
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1", "normal memory pressure required");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "at least 25% free memory required");
  };
  capacity();
  assert.ok(existsSync(webkit.executablePath()), "installed WebKit only; no downloads");
  const css = frameCss();
  const browser = await webkit.launch({ headless: true });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  try {
    for (const [width, height] of [[1280, 800], [1024, 768], [844, 390]]) {
      capacity();
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const unexpected: string[] = [], errors: string[] = [];
      await context.route("**/*", async route => { unexpected.push(route.request().url()); await route.abort(); });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      try {
        for (const state of ["empty", "fallback", "short", "tall"] as FrameState[]) {
          await page.setContent(`<!doctype html><html lang="pt-BR"><head><style>${css}</style></head><body>${renderFrame(state)}</body></html>`);
          const geometry = await page.evaluate(() => {
            const content = document.querySelector("[data-touchline-page-content]")!;
            const footer = document.querySelector("footer")!;
            const r = content.getBoundingClientRect(), f = footer.getBoundingClientRect();
            return { contentHeight: r.height, contentBottom: r.bottom, footerTop: f.top,
              footerPosition: getComputedStyle(footer).position, mains: document.querySelectorAll("main").length,
              overflow: document.documentElement.scrollWidth > innerWidth, viewportHeight: innerHeight };
          });
          assert.ok(geometry.contentHeight >= height - 1, `${state}: reserve viewport`);
          assert.ok(geometry.footerTop >= geometry.viewportHeight - 1, `${state}: footer cannot jump to top`);
          assert.ok(Math.abs(geometry.footerTop - geometry.contentBottom) < 1, `${state}: footer follows content`);
          assert.equal(geometry.footerPosition, "static");
          assert.equal(geometry.mains, state === "empty" ? 0 : 1);
          assert.equal(geometry.overflow, false);
          if (state === "tall") assert.ok(geometry.contentHeight >= 1500, "tall routes expand, never clip");
        }
        await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${renderFrame("short", true)}</body></html>`);
        assert.equal(await page.locator("[data-touchline-page-content], footer").count(), 0);
        assert.equal(await page.locator("main").evaluate(el => el.getBoundingClientRect().height), 40, "isolated content gets no wrapper height");
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
