import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, statfsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { webkit } from "@playwright/test";
import type { FrameState } from "./helpers/touchline-site-frame-fixture.mts";

test("real frame CSS reserves the footer position through empty, loading and ready markup", {
  skip: process.env.TOUCHLINE_RUN_SITE_FRAME_BROWSER_TESTS !== "1", timeout: 60_000,
}, async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const capacity = async () => {
    // Explicit local operator override; shared helper still enforces disk reserve.
    if (process.platform === "darwin" && !process.env.CI
      && process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1"
      && process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE === "1") {
      requireBrowserCapacity(root, { allowLowDarwinDisk: true });
      return;
    }

    const deadline = performance.now() + 10_000;
    let announced = false;
    while (true) {
      t.signal.throwIfAborted();
      const disk = statfsSync(root);
      assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "stop below 5 GiB free");
      const query = (command: string, args: string[]) => {
        const remaining = Math.floor(deadline - performance.now());
        assert.ok(remaining > 0, "normal capacity did not return within 10 seconds");
        return execFileSync(command, args, { encoding: "utf8", timeout: Math.min(1000, remaining), maxBuffer: 64 * 1024 });
      };
      const pressure = query("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]).trim();
      assert.ok(pressure === "1" || pressure === "2", "critical or unknown memory pressure aborts immediately");
      const free = Number(query("memory_pressure", []).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
      assert.ok(Number.isFinite(free) && free >= 25, "at least 25% free memory required");
      const remaining = deadline - performance.now();
      assert.ok(remaining > 0, "normal capacity did not return within 10 seconds");
      if (pressure === "1") return;
      if (!announced) { t.diagnostic("Transient WARN: waiting up to 10 seconds for normal capacity before continuing"); announced = true; }
      await pause(Math.min(250, remaining), undefined, { signal: t.signal });
    }
  };
  await capacity();
  assert.ok(existsSync(webkit.executablePath()), "installed WebKit only; no downloads");
  const artifacts = mkdtempSync("/private/tmp/touchline-site-frame-");
  // Wait for process exit so compiler/module memory cannot overlap WebKit.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      fileURLToPath(new URL("./helpers/touchline-site-frame-compile-worker.mts", import.meta.url)), artifacts], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Frame fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Frame fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Frame fixture compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Frame fixture compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  const css = readFileSync(path.join(artifacts, "fixture.css"), "utf8");
  const rawMarkup: unknown = JSON.parse(readFileSync(path.join(artifacts, "fixture-markup.json"), "utf8"));
  assert.ok(css.length > 0 && rawMarkup && typeof rawMarkup === "object" && !Array.isArray(rawMarkup), "fresh compiled fixture required");
  const markup = rawMarkup as Record<FrameState | "isolated", string>;
  for (const state of ["empty", "fallback", "short", "tall", "isolated"] as const) {
    assert.ok(typeof markup[state] === "string" && markup[state].length > 0, `fresh ${state} markup required`);
  }
  t.diagnostic(`Compiler exited before browser launch; real CSS and markup: ${artifacts}`);
  await capacity();
  const browser = await webkit.launch({ headless: true });
  const abortBrowser = () => { void browser.close(); };
  t.signal.addEventListener("abort", abortBrowser, { once: true });
  try {
    t.signal.throwIfAborted();
    for (const [width, height] of [[1280, 800], [1024, 768], [844, 390]]) {
      await capacity();
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const unexpected: string[] = [], errors: string[] = [];
      await context.route("**/*", async route => { unexpected.push(route.request().url()); await route.abort(); });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      try {
        for (const state of ["empty", "fallback", "short", "tall"] as FrameState[]) {
          await capacity();
          await page.setContent(`<!doctype html><html lang="pt-BR"><head><style>${css}</style></head><body>${markup[state]}</body></html>`);
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
        await capacity();
        await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${markup.isolated}</body></html>`);
        assert.equal(await page.locator("[data-touchline-page-content], footer").count(), 0);
        assert.equal(await page.locator("main").evaluate(el => el.getBoundingClientRect().height), 40, "isolated content gets no wrapper height");
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { t.signal.removeEventListener("abort", abortBrowser); await browser.close(); }
});
