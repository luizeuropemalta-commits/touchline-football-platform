import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { TOUCHLINE_ARENA_ENTRY_VIDEO, TOUCHLINE_ARENA_VIDEO_POSTER } from "../lib/touchlineArena/arena-intro.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://auth-cinematic-playback.test";

test("real cinematic background loads local media and advances without forcing play", {
  skip: process.env.TOUCHLINE_RUN_AUTH_CINEMATIC_PLAYBACK_TESTS !== "1", timeout: 75_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_AUTH_CINEMATIC_ENGINE;
  assert.ok(engineFilter === undefined || ["chromium", "webkit"].includes(engineFilter), "invalid engine filter");
  const allowModeratePressure = process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI;
  if (allowModeratePressure && process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB === undefined) t.diagnostic("capacityException=local-moderate-pressure; memory>=25%; disk>5GiB; critical pressure refused");
  const capacity = async () => {
    if (process.platform === "darwin" && !process.env.CI && process.env.TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB !== undefined) {
      requireBrowserCapacity(root, { darwinFreePercent: true });
      return;
    }
    const deadline = performance.now() + 10_000;
    let announced = false;
    while (true) {
      t.signal.throwIfAborted();
      const disk = statfsSync(root);
      assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "more than 5 GiB free disk required");
      const query = (command: string, args: string[]) => {
        const remaining = Math.floor(deadline - performance.now());
        assert.ok(remaining > 0, "normal capacity did not return within 10 seconds");
        return execFileSync(command, args, { encoding: "utf8", timeout: Math.min(5000, remaining), maxBuffer: 64 * 1024 });
      };
      const pressure = query("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]).trim();
      assert.ok(pressure === "1" || pressure === "2", "critical or unknown memory pressure aborts immediately");
      const free = Number(query("memory_pressure", []).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
      assert.ok(Number.isFinite(free) && free >= 25, "at least 25% free memory required");
      const remaining = deadline - performance.now();
      assert.ok(remaining > 0, "normal capacity did not return within 10 seconds");
      if (pressure === "1" || (allowModeratePressure && pressure === "2")) return;
      if (!announced) { t.diagnostic("Transient WARN: waiting up to 10 seconds for normal capacity before continuing"); announced = true; }
      await pause(Math.min(250, remaining), undefined, { signal: t.signal });
    }
  };
  await capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-auth-playback-");
  // Wait for close, including timeout/abort, before starting any browser.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      path.join(root, "tests/helpers/touchline-auth-cinematic-compile-worker.mts"), screenshots], {
      cwd: root, stdio: "ignore",
    });
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Cinematic fixture compilation aborted"); child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      failure = new Error("Cinematic fixture compilation exceeded 30 seconds"); child.kill("SIGKILL");
    }, 30_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => { failure = new Error("Cinematic fixture compiler could not start"); });
    child.once("close", code => {
      clearTimeout(timeout); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Cinematic fixture compiler exited with code ${code}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  const script = readFileSync(path.join(screenshots, "fixture.js"), "utf8");
  const html = readFileSync(path.join(screenshots, "fixture.html"), "utf8");
  assert.ok(script.length > 0 && html.length > 0, "fresh compiled cinematic fixture required");
  t.diagnostic(`Compiler exited before browser launch; real component/global CSS: ${screenshots}`);
  const publicRoot = realpathSync(path.join(root, "public"));
  const assets = new Map([TOUCHLINE_ARENA_ENTRY_VIDEO, TOUCHLINE_ARENA_VIDEO_POSTER].map(url => {
    const file = realpathSync(path.join(publicRoot, url.slice(1)));
    assert.ok(file.startsWith(publicRoot + path.sep) && statSync(file).isFile());
    assert.ok(statSync(file).size > 0 && statSync(file).size <= 32 * 1024 ** 2, "local media exceeds the bounded asset budget");
    return [url, { file, size: statSync(file).size, contentType: url.endsWith(".mp4") ? "video/mp4" : "image/jpeg" }] as const;
  }));
  t.diagnostic(JSON.stringify({ screenshots, engineFilter,
    scope: "real component/global CSS/MP4/poster; isolated client mount, no form/auth/Next/server; native engine policy and codec may differ from installed Safari; PNG requires inspection for browser-owned Play overlay" }));
  for (const engine of [chromium, webkit].filter(value => engineFilter === undefined || value.name() === engineFilter)) {
    await capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser required");
    t.signal.throwIfAborted();
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      t.signal.throwIfAborted();
      await capacity();
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "no-preference", serviceWorkers: "block", permissions: [] });
      try {
        const page = await context.newPage(); page.setDefaultTimeout(5000);
        const errors: string[] = [], forbidden: string[] = [];
        const requests: Array<{ method: string; path: string; range: string | null; status: number; bytes: number }> = [];
        page.on("pageerror", error => errors.push(error.message));
        await context.addInitScript(() => {
          const state = window as unknown as { cinematicEvents: Array<{ name: string; at: number; time: number; paused: boolean; ready: number; error: number | null }> };
          state.cinematicEvents = [];
          for (const name of ["loadstart", "loadedmetadata", "loadeddata", "canplay", "play", "playing", "pause", "waiting", "stalled", "suspend", "error", "timeupdate"]) {
            document.addEventListener(name, event => {
              if (!(event.target instanceof HTMLVideoElement) || state.cinematicEvents.length >= 256) return;
              const video = event.target;
              state.cinematicEvents.push({ name, at: performance.now(), time: video.currentTime, paused: video.paused, ready: video.readyState, error: video.error?.code ?? null });
            }, true);
          }
        });
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
            forbidden.push(`${request.method()} ${url.href}`); return route.abort();
          }
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
          if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204 });
          const asset = assets.get(url.pathname);
          if (!asset) { forbidden.push(url.pathname); return route.abort(); }
          const range = request.headers().range ?? null;
          const headers = { "accept-ranges": "bytes", "cache-control": "no-store", "content-type": asset.contentType };
          if (request.method() === "HEAD") {
            requests.push({ method: "HEAD", path: url.pathname, range, status: 200, bytes: 0 });
            return route.fulfill({ status: 200, headers: { ...headers, "content-length": String(asset.size) } });
          }
          if (!range) {
            requests.push({ method: "GET", path: url.pathname, range, status: 200, bytes: asset.size });
            return route.fulfill({ status: 200, headers, path: asset.file });
          }
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          let start = NaN, end = NaN;
          if (match && (match[1] || match[2])) {
            start = match[1] ? Number(match[1]) : Math.max(0, asset.size - Number(match[2]));
            end = match[1] && match[2] ? Math.min(Number(match[2]), asset.size - 1) : asset.size - 1;
          }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= asset.size || end < start) {
            requests.push({ method: "GET", path: url.pathname, range, status: 416, bytes: 0 });
            return route.fulfill({ status: 416, headers: { ...headers, "content-range": `bytes */${asset.size}` } });
          }
          // Preserve the requested range exactly (bounded by the validated
          // asset size), rather than introducing synthetic decoder behavior.
          const body = Buffer.alloc(end - start + 1), file = await open(asset.file, "r");
          try {
            let offset = 0;
            while (offset < body.length) {
              const read = await file.read(body, offset, body.length - offset, start + offset);
              assert.ok(read.bytesRead > 0, "local media read unexpectedly ended"); offset += read.bytesRead;
            }
          } finally { await file.close(); }
          requests.push({ method: "GET", path: url.pathname, range, status: 206, bytes: body.length });
          return route.fulfill({ status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${asset.size}`, "content-length": String(body.length) }, body });
        });
        await page.goto(origin);
        await page.addScriptTag({ content: `(()=>{${script}})()` });
        const video = page.locator("video.auth-cinematic-video");
        await expect(video).toHaveCount(1);
        const sample = () => video.evaluate(node => {
          const video = node as HTMLVideoElement;
          const policyReader = navigator as Navigator & { getAutoplayPolicy?: (element: HTMLMediaElement) => string };
          let policy: string | null = null;
          try { policy = policyReader.getAutoplayPolicy?.(video) ?? null; } catch { /* optional diagnostic only */ }
          return { currentTime: video.currentTime, paused: video.paused, ended: video.ended,
            muted: video.muted, defaultMuted: video.defaultMuted, autoplay: video.autoplay, playsInline: video.playsInline,
            controls: video.controls, loop: video.loop, readyState: video.readyState, networkState: video.networkState,
            currentSrc: video.currentSrc, width: video.videoWidth, height: video.videoHeight, policy,
            error: video.error ? { code: video.error.code, message: video.error.message } : null };
        });
        const initial = await sample();
        await capacity();
        const initialPng = path.join(screenshots, `${engine.name()}-844-initial.png`);
        await page.screenshot({ path: initialPng }); t.diagnostic(`Screenshot: ${initialPng}`);
        // Observation only: never call play(), seek, override media methods,
        // set currentTime or grant a synthetic user gesture to the video.
        let advanced = false;
        try {
          await expect.poll(async () => {
            const next = await sample();
            advanced = next.currentTime - initial.currentTime >= .1 && !next.paused && next.width > 0 && next.height > 0;
            return advanced || next.error !== null;
          }, { timeout: 10_000, intervals: [100, 200, 500] }).toBe(true);
        } catch { /* classify and capture the first broken boundary below */ }
        const final = await sample();
        const events = await page.evaluate(() => (window as unknown as { cinematicEvents: unknown[] }).cinematicEvents);
        const playing = advanced && !final.paused && !final.ended && final.currentTime - initial.currentTime >= .1
          && final.width > 0 && final.height > 0 && final.readyState >= 2;
        const outcome = final.error ? "media-error" : playing ? "playing" : final.policy === "disallowed" ? "policy-blocked" : "not-playing-undetermined";
        const finalPng = path.join(screenshots, `${engine.name()}-844-${outcome}.png`);
        t.diagnostic(JSON.stringify({ engine: engine.name(), outcome, initial, final, events, requests, errors, forbidden, plannedScreenshot: finalPng }));
        await capacity();
        await page.screenshot({ path: finalPng });
        t.diagnostic(`Screenshot: ${finalPng}`);
        assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
        assert.ok(requests.some(request => request.path === TOUCHLINE_ARENA_ENTRY_VIDEO && request.bytes > 0 && [200, 206].includes(request.status)), "real local video bytes must be delivered");
        assert.equal(final.muted, true); assert.equal(final.autoplay, true); assert.equal(final.playsInline, true);
        assert.equal(final.controls, false); assert.equal(final.loop, true);
        assert.equal(outcome, "playing", "inspect diagnostics/PNG: a blocked, failed or stalled video is not a playback pass");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(video).toHaveCount(0);
        assert.ok(await page.locator(".auth-cinematic-media").evaluate(node => getComputedStyle(node).backgroundImage.includes("touchline-arena-poster")));
      } finally { await context.close(); }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});
