import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { setTimeout as waitForCapacitySample } from "node:timers/promises";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://card-frame-density.invalid";
const galleryOnly = process.env.TOUCHLINE_FRAME_DENSITY_GALLERY === "1";
const tiers = ["diamond-gold", "clear-diamond", "emerald-green", "radiant-gold", "amethyst-purple", "sapphire-blue", "ruby-red"];
const coachFiles: Record<string, string> = { "diamond-gold": "07_golddiamond_coach", "clear-diamond": "05_silver_coach",
  "emerald-green": "03_green_coach", "radiant-gold": "06_gold_coach", "amethyst-purple": "04_purple_coach",
  "sapphire-blue": "01_blue_coach", "ruby-red": "02_red_coach" };

// Compile in a child that exits before any browser starts; reuse the established
// real-component bundler without changing the existing crest-outline fixture.
if (process.argv[2] === "--compile-fixture") {
  const output = realpathSync(process.argv[3]);
  assert.equal(path.dirname(output), "/private/tmp");
  assert.match(path.basename(output), /^touchline-frame-density-[A-Za-z0-9]+$/);
  const { bundleIsolatedBrowserFixture } = await import("./helpers/touchline-isolated-browser-bundle.mts");
  const bundle = bundleIsolatedBrowserFixture({ entryPath: galleryOnly ? "tests/fixtures/CoachGalleryFrameDensityBrowserFixture.tsx" : "tests/fixtures/CardFrameDensityBrowserFixture.tsx", cssPrefix: "frameDensity",
    requiredSources: ["components/touchline/cards/TouchlineEliteExactCard.tsx", "components/touchline/cards/TouchlineCoachCard.tsx",
      "components/touchline/cards/TouchlineCoachCard.module.css", ...(galleryOnly ? ["components/touchline/TouchlineCoachCategoryShowcase.tsx",
        "components/touchline/TouchlineCoachCategoryShowcase.module.css", "app/touchline-clubs/touchline-clubs.module.css"] : [])],
    mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));" });
  const globals = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  const preflight = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8");
  writeFileSync(path.join(output, "script.js"), bundle.script, { flag: "wx" });
  writeFileSync(path.join(output, "style.css"), `${preflight}\n${globals}\n${bundle.css}`, { flag: "wx" });
  writeFileSync(path.join(output, "sources.json"), JSON.stringify(bundle.sources), { flag: "wx" });
} else test("real player and coach frames select native density candidates across seven tiers", {
  skip: process.env.TOUCHLINE_RUN_FRAME_DENSITY_BROWSER !== "1" || galleryOnly, timeout: 240_000,
}, async t => {
  const engineName = process.env.TOUCHLINE_FRAME_DENSITY_ENGINE ?? "chromium";
  assert.ok(["chromium", "webkit"].includes(engineName));
  const engine = engineName === "webkit" ? webkit : chromium;
  const requestedTier = process.env.TOUCHLINE_FRAME_DENSITY_TIER;
  assert.ok(requestedTier === undefined || tiers.includes(requestedTier), "explicit supported tier required");
  const selectedTiers = requestedTier === undefined ? tiers : [requestedTier];
  const requestedDpr = process.env.TOUCHLINE_FRAME_DENSITY_DPR;
  assert.ok(!requestedDpr || ["1", "2", "3"].includes(requestedDpr));
  const dprs = [1, 2, 3].filter(value => !requestedDpr || String(value) === requestedDpr);
  const requestedCoachWidth = process.env.TOUCHLINE_FRAME_DENSITY_COACH_WIDTH;
  assert.ok(requestedCoachWidth === undefined || ["52", "119", "240"].includes(requestedCoachWidth), "explicit known coach width required");
  const coachDisplayWidth = requestedCoachWidth === undefined ? undefined : Number(requestedCoachWidth);
  const fallbackRequested = process.env.TOUCHLINE_FRAME_DENSITY_FALLBACK === "1";
  if (fallbackRequested) assert.ok(requestedTier && requestedDpr === "2" && coachDisplayWidth === 240,
    "fallback proof requires one explicit tier, DPR2 and coach width240 so the dense source is selected");
  const partial = Boolean(requestedDpr || requestedTier || requestedCoachWidth);
  // A prior 14-frame WebKit/DPR2 run stopped at the capacity gate before
  // first-tier assertions. Filter the mounted tree, not just the assertions:
  // two cards isolate one tier without claiming that abort was a product crash.
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true, allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_MODERATE_MEMORY === "1" });
  capacity();
  const output = mkdtempSync("/private/tmp/touchline-frame-density-");
  t.diagnostic(`Evidence: ${output}; real artwork/components, synthetic identity. Zoom-size renderer only, not modal/native/QA proof. Partial matrix: ${partial}; tiers: ${selectedTiers.join(",")}; mounted frames: ${selectedTiers.length * 2}.`);
  execFileSync(process.execPath, ["--experimental-strip-types", import.meta.filename, "--compile-fixture", output], {
    cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024, stdio: "pipe" });
  t.signal.throwIfAborted();
  assert.ok(existsSync(engine.executablePath()), "installed browser only");
  const script = readFileSync(path.join(output, "script.js"), "utf8");
  const css = readFileSync(path.join(output, "style.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const reports: unknown[] = [];
  const scenarioEvidence: unknown[] = [];
  const fallbackEvidence: unknown[] = [];
  const baseline = new Map<string, { width: number; height: number; hostWidth: number; hostHeight: number }>();
  // The compiler is already gone. Give transient post-compile pressure a
  // bounded idle recovery window; never start a browser on a failed sample.
  // This is ONLY a pre-launch wait. All in-browser capacity() calls below still
  // throw immediately, using the unchanged pressure/memory/disk requirements.
  const recoveryStarted = performance.now(), recoveryDeadline = recoveryStarted + 10_000;
  let recoverySamples = 0;
  for (;;) {
    t.signal.throwIfAborted();
    if (performance.now() >= recoveryDeadline) throw new Error("Post-compiler capacity recovery deadline expired; browser not launched");
    let failure: unknown;
    try { capacity(); } catch (error) { failure = error; }
    recoverySamples++;
    const remaining = recoveryDeadline - performance.now();
    if (remaining <= 0) throw new Error("Post-compiler capacity did not confirm normal within 10s; browser not launched", { cause: failure });
    if (failure === undefined) break;
    if (recoverySamples === 1) t.diagnostic("Compiler exited; waiting at most 10s for unchanged capacity gate before browser launch.");
    await waitForCapacitySample(Math.min(500, remaining), undefined, { signal: t.signal });
  }
  if (recoverySamples > 1) t.diagnostic(`Post-compiler normal capacity confirmed after ${recoverySamples} samples / ${Math.round(performance.now() - recoveryStarted)}ms.`);
  t.signal.throwIfAborted();
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
  try {
    for (const dpr of dprs) for (const presentation of ["compact", "zoom"] as const) {
      capacity(); t.signal.throwIfAborted();
      // Fresh contexts prevent prior high-density cache entries influencing 1x.
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: dpr,
        reducedMotion: "reduce", serviceWorkers: "block" });
      const errors: string[] = [], denied: string[] = [], requests: string[] = [];
      try {
        const page = await context.newPage(); page.setDefaultTimeout(5000);
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script>window.fixtureProps=${JSON.stringify({ presentation, tiers: selectedTiers, coachDisplayWidth })};${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url()); requests.push(url.pathname);
          if (request.method() !== "GET" || url.origin !== origin) { denied.push(request.url()); await route.abort(); return; }
          if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) {
            await route.fulfill({ path: file }); return;
          }
          denied.push(url.pathname); await route.abort();
        });
        await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-frame-tier]")).toHaveCount(selectedTiers.length);
        await expect(page.locator('[data-touchline-card-frame="true"]')).toHaveCount(selectedTiers.length * 2);
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
        assert.equal(await page.evaluate(() => devicePixelRatio), dpr);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual((await page.locator("[data-frame-tier]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-frame-tier")))).sort(), [...selectedTiers].sort());
        for (const tier of selectedTiers) {
          capacity();
          const row = page.locator(`[data-frame-tier="${tier}"]`);
          for (const kind of ["player", "coach"] as const) {
            const frame = row.locator(`[data-frame-kind="${kind}"] [data-touchline-card-frame="true"]`);
            await expect(frame).toHaveCount(1); await expect(frame).toBeVisible();
            await expect(frame).toHaveCSS("opacity", "1");
            const measured = await frame.evaluate(async element => {
              const image = element as HTMLImageElement;
              const host = image.closest("[data-frame-kind]")!;
              const box = image.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
              // naturalWidth on a srcset image is density-corrected. Decode its
              // exact currentSrc without srcset to measure actual encoded pixels.
              const raw = new Image(); raw.src = image.currentSrc; await raw.decode();
              return { src: image.getAttribute("src"), srcSet: image.getAttribute("srcset"), sizes: image.getAttribute("sizes"), currentSrc: image.currentSrc,
                densityCorrectedWidth: image.naturalWidth, pixelWidth: raw.naturalWidth, pixelHeight: raw.naturalHeight,
                width: box.width, height: box.height, hostWidth: hostBox.width, hostHeight: hostBox.height,
                relativeLeft: box.left - hostBox.left, relativeTop: box.top - hostBox.top };
            });
            const high = presentation === "zoom" || (kind === "coach" && coachDisplayWidth !== undefined ? coachDisplayWidth * dpr > 240 : dpr > 1);
            const variant = high ? "zoom" : "live-compact";
            const expectedPath = kind === "player"
              ? `/touchlineArena/cards/templates/${variant}/clubs/Arsenal FC/market-tiers/${tier}.webp`
              : `/touchlineArena/cards/templates/${variant}/coaches/${coachFiles[tier]}.webp`;
            reports.push({ dpr, presentation, tier, kind, expectedPath, measured });
            writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ engineName, dprs, selectedTiers, coachDisplayWidth, reports, requests, denied, errors,
              partial, status: "in-progress" }, null, 2));
            assert.equal(decodeURIComponent(new URL(measured.currentSrc).pathname), expectedPath, `${kind}/${tier}/${presentation}/DPR${dpr} currentSrc`);
            assert.equal(new URL(measured.currentSrc).origin, origin);
            assert.equal(measured.pixelWidth, kind === "player" ? high ? 430 : 119 : high ? 810 : 240);
            assert.equal(measured.pixelHeight, kind === "player" ? high ? 691 : 192 : high ? 1080 : 320);
            assert.equal(Boolean(measured.srcSet), presentation === "compact");
            assert.equal(measured.sizes, kind === "coach" && presentation === "compact" && coachDisplayWidth !== undefined ? `${coachDisplayWidth}px` : null);
            const expectedWidth = presentation === "zoom" ? 390 : kind === "player" ? 119 : coachDisplayWidth ?? 160;
            assert.ok(Math.abs(measured.hostWidth - expectedWidth) < .1);
            assert.ok(Math.abs(measured.width - expectedWidth) < .1);
            assert.ok(Math.abs(measured.height - expectedWidth * (kind === "player" ? 691 / 430 : 1.5)) < .1);
            assert.ok(Math.abs(measured.relativeLeft) < .1 && Math.abs(measured.relativeTop) < .1);
            const key = `${presentation}/${tier}/${kind}`, prior = baseline.get(key);
            if (!prior) baseline.set(key, measured);
            else for (const property of ["width", "height", "hostWidth", "hostHeight"] as const) {
              assert.ok(Math.abs(measured[property] - prior[property]) < .1, `DPR must not change ${key} ${property}`);
            }
            if (presentation === "compact") assert.ok(measured.pixelWidth >= expectedWidth * dpr, "compact candidate covers painted device pixels");
          }
          await row.screenshot({ path: path.join(output, `${engineName}-${presentation}-dpr${dpr}-${tier}.png`), animations: "disabled" });
        }
        assert.deepEqual(errors, []); assert.deepEqual(denied, []);
        scenarioEvidence.push({ dpr, presentation, requests, denied, errors });
      } finally { await context.close(); }
    }
    if (fallbackRequested) for (const failCompact of [false, true]) {
      capacity(); t.signal.throwIfAborted();
      const tier = selectedTiers[0];
      const densePath = `/touchlineArena/cards/templates/zoom/coaches/${coachFiles[tier]}.webp`;
      const compactPath = `/touchlineArena/cards/templates/live-compact/coaches/${coachFiles[tier]}.webp`;
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2,
        reducedMotion: "reduce", serviceWorkers: "block" });
      let releaseCompact!: () => void;
      const compactGate = new Promise<void>(resolve => { releaseCompact = resolve; });
      const requested: string[] = [], errors: string[] = [], denied: string[] = [];
      try {
        const page = await context.newPage(); page.setDefaultTimeout(5000);
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
          if (message.type() !== "error") return;
          const url = message.location().url;
          if ((url.includes(densePath) || failCompact && url.includes(compactPath)) && message.text().includes("Failed to load resource")) return;
          errors.push(message.text());
        });
        const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div><script>window.fixtureProps=${JSON.stringify({ presentation: "compact", tiers: [tier], coachDisplayWidth: 240 })};${script.replaceAll("</script", "<\\/script")}</script>`;
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url()); requested.push(url.pathname);
          if (request.method() !== "GET" || url.origin !== origin) { denied.push(request.url()); await route.abort(); return; }
          if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html; charset=utf-8", body: html }); return; }
          if (url.pathname === densePath) { await route.fulfill({ status: 404, body: "Intentional dense-frame failure" }); return; }
          if (url.pathname === compactPath) {
            await compactGate;
            if (failCompact) { await route.fulfill({ status: 404, body: "Intentional compact-frame failure" }); return; }
          }
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) { await route.fulfill({ path: file }); return; }
          denied.push(url.pathname); await route.abort();
        });
        await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
        const frame = page.locator('[data-frame-kind="coach"] [data-touchline-card-frame="true"]');
        await expect.poll(() => requested.filter(value => value === compactPath).length).toBeGreaterThan(0);
        await page.waitForTimeout(700); // Deliberately beyond the existing 600ms reveal safety timer.
        const pending = await frame.evaluate(element => { const image = element as HTMLImageElement; return {
          complete: image.complete, naturalWidth: image.naturalWidth, srcset: image.getAttribute("srcset"),
          ready: image.closest("[data-coach-frame-ready]")?.getAttribute("data-coach-frame-ready"),
          width: image.getBoundingClientRect().width,
        }; });
        assert.equal(pending.naturalWidth, 0, "compact response is still held by the test");
        assert.equal(pending.srcset, "", "failed dense candidate must no longer be selectable");
        assert.ok(Math.abs(pending.width - 240) < .1);
        releaseCompact();
        await expect.poll(() => frame.evaluate(element => (element as HTMLImageElement).complete)).toBe(true);
        const settled = await frame.evaluate(async element => { const image = element as HTMLImageElement;
          if (image.naturalWidth > 0) await image.decode();
          return { src: image.src, currentSrc: image.currentSrc, naturalWidth: image.naturalWidth, srcset: image.getAttribute("srcset") };
        });
        assert.equal(new URL(settled.currentSrc || settled.src).pathname, compactPath, "fallback must retain the same tier");
        assert.equal(settled.naturalWidth, failCompact ? 0 : 240);
        assert.equal(settled.srcset, "");
        const counts = () => ({ dense: requested.filter(value => value === densePath).length, compact: requested.filter(value => value === compactPath).length });
        const settledCounts = counts();
        assert.equal(settledCounts.dense, 1);
        // Removing srcset and assigning src can coalesce or cancel/restart a
        // request. Bound that browser behavior, then require no continuing retry.
        assert.ok(settledCounts.compact >= 1 && settledCounts.compact <= 2);
        await page.waitForTimeout(250); assert.deepEqual(counts(), settledCounts, "no repeated error-request loop");
        assert.deepEqual(errors, []); assert.deepEqual(denied, []);
        await page.screenshot({ path: path.join(output, `${engineName}-${tier}-fallback-${failCompact ? "both-fail" : "slow-success"}.png`), animations: "disabled" });
        fallbackEvidence.push({ tier, failCompact, pending, settled, counts: settledCounts,
          atomicRevealAccepted: false, note: "Pending ready is diagnostic: this test proves bounded fallback, not atomic reveal before slow decode." });
        t.diagnostic(`Fallback ${failCompact ? "both-fail" : "slow-success"}: pendingReady=${pending.ready}; bounded retry only, no atomic-reveal acceptance.`);
      } finally { releaseCompact(); await context.close(); }
    }
    assert.equal(reports.length, dprs.length * 2 * selectedTiers.length * 2);
    writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ engineName, dprs, selectedTiers, coachDisplayWidth, reports, scenarioEvidence, fallbackEvidence, partial,
      status: "passed-isolated-delivery", limits: "Zoom-size component only; player native430px; no modal, native or QA acceptance." }, null, 2));
    t.diagnostic(`FRAME_DENSITY_PROOF ${reports.length} frame cases: ${output}`);
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});

if (process.argv[2] !== "--compile-fixture") test("real coach gallery at responsive widths DPR1 selects frames without identity overlap", {
  skip: process.env.TOUCHLINE_RUN_FRAME_DENSITY_BROWSER !== "1" || !galleryOnly, timeout: 120_000,
}, async t => {
  const engineName = process.env.TOUCHLINE_FRAME_DENSITY_ENGINE ?? "chromium";
  assert.ok(["chromium", "webkit"].includes(engineName));
  for (const name of ["TOUCHLINE_FRAME_DENSITY_TIER", "TOUCHLINE_FRAME_DENSITY_DPR", "TOUCHLINE_FRAME_DENSITY_COACH_WIDTH", "TOUCHLINE_FRAME_DENSITY_FALLBACK"])
    assert.equal(process.env[name], undefined, "gallery case owns its full gallery, viewport760 and DPR1; do not mix renderer filters");
  const galleryWidth = Number(process.env.TOUCHLINE_FRAME_DENSITY_GALLERY_WIDTH ?? "760");
  assert.ok([760, 844, 1280].includes(galleryWidth), "gallery width must cover a real2/4/7 column breakpoint");
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true, allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_MODERATE_MEMORY === "1" });
  capacity(); t.signal.throwIfAborted();
  const output = mkdtempSync("/private/tmp/touchline-frame-density-");
  t.diagnostic(`Real gallery evidence: ${output}; width${galleryWidth}/DPR1, local saved representatives, unavailable live ranking; no Next/native/QA proof.`);
  execFileSync(process.execPath, ["--experimental-strip-types", import.meta.filename, "--compile-fixture", output], {
    cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024, stdio: "pipe" });
  capacity(); t.signal.throwIfAborted();
  const script = readFileSync(path.join(output, "script.js"), "utf8"), css = readFileSync(path.join(output, "style.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const engine = engineName === "webkit" ? webkit : chromium;
  assert.ok(existsSync(engine.executablePath()));
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close().catch(() => {}); }; t.signal.addEventListener("abort", abort, { once: true });
  const denied: string[] = [], errors: string[] = [], requests: string[] = [], reports: unknown[] = [];
  const save = (status: string) => writeFileSync(path.join(output, "gallery-evidence.json"), JSON.stringify({ status, engineName,
    viewport: { width: galleryWidth, height: 900 }, dpr: 1, requests, denied, errors, reports,
    limits: "Real gallery and directory CSS, saved local representatives, unavailable ranking, empty player catalogue; no Next route, live facts, modal, physical-device or QA acceptance." }, null, 2));
  try {
    t.signal.throwIfAborted(); capacity();
    const context = await browser.newContext({ viewport: { width: galleryWidth, height: 900 }, deviceScaleFactor: 1,
      reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(5000);
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url()); requests.push(url.pathname);
        if (request.method() !== "GET" || url.origin !== origin) { denied.push(request.url()); await route.abort(); return; }
        if (url.pathname === "/touchline-clubs") {
          await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>` }); return;
        }
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) { await route.fulfill({ path: file }); return; }
        denied.push(url.pathname); await route.abort();
      });
      await page.goto(`${origin}/touchline-clubs`, { waitUntil: "domcontentloaded" });
      assert.equal(await page.evaluate(() => devicePixelRatio), 1);
      const gallery = page.locator('section[aria-labelledby="touchline-coach-border-title"]');
      await gallery.scrollIntoViewIfNeeded();
      const frames = gallery.locator('[data-touchline-card-frame="true"]');
      // The saved fallback catalogue has six verified representatives and no
      // ruby-red representative. Preserve that honest pending state; do not
      // invent a seventh coach merely to exercise an image.
      await expect(gallery.locator("li[data-tier]")).toHaveCount(7);
      await expect(gallery.locator('[data-tier="ruby-red"] [data-coach-representative="pending"]')).toHaveCount(1);
      await expect(frames).toHaveCount(6);
      assert.deepEqual(await frames.evaluateAll(nodes => nodes.map(node => node.closest("li")?.getAttribute("data-tier"))), tiers.slice(0, 6));
      for (let index = 0; index < 6; index++) {
        capacity();
        const frame = frames.nth(index); await frame.scrollIntoViewIfNeeded(); await expect(frame).toBeVisible();
        await expect(frame).toHaveCSS("opacity", "1");
        const measured = await frame.evaluate(async element => {
          const image = element as HTMLImageElement; await image.decode();
          const raw = new Image(); raw.src = image.currentSrc; await raw.decode();
          const card = image.closest("[data-coach-card-display]")!, tile = image.closest("li")!, grid = tile.parentElement!;
          const box = image.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
          const trigger = card.closest('[role="button"]')!, visual = trigger.parentElement!.parentElement!;
          const identity = tile.querySelector<HTMLAnchorElement>(':scope > div > a[href^="/touchline-coaches/"]');
          if (!identity) throw new Error("Real gallery identity link missing");
          const identityBox = identity.getBoundingClientRect(), visualBox = visual.getBoundingClientRect();
          return { width: box.width, height: box.height, cardWidth: cardBox.width, display: card.getAttribute("data-coach-card-display"),
            tier: tile.getAttribute("data-tier"), currentSrc: image.currentSrc, sizes: image.sizes, srcset: image.srcset,
            pixelWidth: raw.naturalWidth, pixelHeight: raw.naturalHeight, gridColumns: getComputedStyle(grid).gridTemplateColumns,
            hostWidth: document.querySelector("[data-gallery-directory-content]")!.getBoundingClientRect().width,
            documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
            frameBottom: box.bottom, identityTop: identityBox.top, identityBottom: identityBox.bottom,
            visualTop: visualBox.top, visualBottom: visualBox.bottom, visualHeight: visualBox.height,
            frameIdentityGap: identityBox.top - box.bottom, visualIdentityGap: identityBox.top - visualBox.bottom };
        });
        reports.push(measured); save("in-progress");
        // Save the actual card before assertions so a failed geometry check
        // retains the overlapping frame/text instead of only a passing image.
        if (index === 0) await frame.locator("xpath=ancestor::li[1]").screenshot({ path: path.join(output, `${engineName}-gallery${galleryWidth}-dpr1-first-coach.png`), animations: "disabled" });
        assert.equal(measured.display, "compact");
        assert.equal(measured.gridColumns.trim().split(/\s+/).length, galleryWidth <= 760 ? 2 : galleryWidth <= 1180 ? 4 : 7);
        assert.ok(measured.width > 0 && measured.width <= 380);
        if (galleryWidth === 760) assert.ok(measured.width > 240, "wide gallery card must exceed thumbnail capacity");
        assert.ok(Math.abs(measured.width - measured.cardWidth) < .1);
        assert.ok(Math.abs(measured.height / measured.width - 1.5) < .001, "approved coach CSS geometry retained");
        assert.equal(measured.sizes, "(max-width: 410px) max(112px, 50vw), (max-width: 760px) 50vw, (max-width: 1180px) 25vw, 206px");
        assert.match(measured.srcset, /240w, .+810w$/);
        assert.ok([`/touchlineArena/cards/templates/zoom/coaches/${coachFiles[measured.tier!]}.webp`, `/touchlineArena/cards/templates/live-compact/coaches/${coachFiles[measured.tier!]}.webp`].includes(decodeURIComponent(new URL(measured.currentSrc).pathname)));
        assert.equal(new URL(measured.currentSrc).origin, origin);
        assert.ok([240, 810].includes(measured.pixelWidth)); assert.equal(measured.pixelHeight / measured.pixelWidth, 4 / 3);
        assert.ok(measured.pixelWidth >= measured.width); assert.ok(measured.documentWidth <= measured.viewport);
        assert.ok(measured.visualBottom >= measured.frameBottom - .5, "visual row must contain the full frame envelope");
        assert.ok(measured.frameIdentityGap >= 7.5 && measured.visualIdentityGap >= 7.5,
          "real identity link must follow the artwork and its wrapper with the existing8px grid gap");
      }
      assert.deepEqual(denied, []); assert.deepEqual(errors, []); save("passed-real-gallery-isolated-delivery");
      t.diagnostic(`GALLERY_FRAME_DENSITY_PROOF 6 real gallery frames plus verified ruby-red pending state: ${output}`);
    } finally { await context.close(); }
  } catch (error) { save("failed-or-capacity-blocked"); throw error; }
  finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});
