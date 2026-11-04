import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium, webkit, expect, type Page } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const root = path.resolve(import.meta.dirname, "..");
const enabled = process.env.TOUCHLINE_RUN_PUBLIC_PANEL_LANDSCAPE_BROWSER_TESTS === "1";
const requestedEngine = process.env.TOUCHLINE_PUBLIC_PANEL_LANDSCAPE_BROWSER_ENGINE ?? "webkit";
assert.ok(["webkit", "chromium"].includes(requestedEngine), "one installed browser engine per invocation");
const engine = requestedEngine === "webkit" ? webkit : chromium;
type Selectors = { live: { panels: string[]; hero: string; rail: string; decoration: string };
  profile: { panel: string; card: string; crest: string; name: string } };

async function geometry(page: Page, selectors: string[]) {
  return page.evaluate(targets => {
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return [box.x + scrollX, box.y + scrollY, box.width, box.height]; };
    return {
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth, scroll: [scrollX, scrollY],
      media: { coarse: matchMedia("(pointer: coarse)").matches, noHover: matchMedia("(hover: none)").matches,
        landscape: matchMedia("(orientation: landscape)").matches },
      panels: targets.map(selector => { const node = document.querySelector(selector); if (!node) throw Error(`Missing ${selector}`);
        return { selector, rect: rect(node), filter: getComputedStyle(node).filter,
          backdrop: getComputedStyle(node).backdropFilter, beforeFilter: getComputedStyle(node, "::before").filter,
          beforeBackground: getComputedStyle(node, "::before").backgroundImage, background: getComputedStyle(node).backgroundImage }; }),
      images: [...document.images].map(img => ({ src: img.currentSrc, natural: [img.naturalWidth, img.naturalHeight], rect: rect(img) })),
      traces: [...document.querySelectorAll('[data-touchline-card-neon-trace="true"]')].map(node => ({
        rect: rect(node), opacity: getComputedStyle(node).opacity, paths: [...node.querySelectorAll("path")].map(p => p.getAttribute("d")) })),
      crowns: [...document.querySelectorAll('[data-card-golden-ball="true"]')].map(rect),
    };
  }, selectors);
}

function sameGeometry(before: number[], after: number[], label: string) {
  assert.equal(before.length, after.length, label);
  before.forEach((value, index) => assert.ok(Math.abs(value - after[index]) <= .5, `${label}/${index}: ${value} -> ${after[index]}`));
}

async function captureViewport(page: Page, file: string, detailSelector: string) {
  // Full-page Chromium capture may resize the emulated viewport and change
  // orientation/pointer media. Preserve the actual tested viewport throughout.
  await page.screenshot({ path: `${file}.png`, fullPage: false });
  await page.locator(detailSelector).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${file}-detail.png`, fullPage: false });
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

// Client composition with synthetic inputs and byte-identical repository assets.
// This is not the full server profile/QA route or a Safari device/pinch crash proof.
test(`public panels ${requestedEngine}: touch-landscape filters preserve original artwork and geometry`, {
  skip: !enabled, timeout: 180_000,
}, async t => {
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI,
    allowLowDarwinDisk: process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI });
  capacity();
  const output = mkdtempSync(path.join(tmpdir(), "touchline-public-panels-"));
  t.diagnostic(`Isolated public panel evidence: ${output}`);
  // Compilation finishes before the single engine starts. No server/build/install.
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { writeFileSync, readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { bundleIsolatedBrowserFixture } from './tests/helpers/touchline-isolated-browser-bundle.mts';
    const bundle = bundleIsolatedBrowserFixture({ entryPath: 'tests/fixtures/PublicPanelLandscapeBrowserFixture.tsx', cssPrefix: 'publicpanels',
      requiredSources: ['components/touchline/match-centre/TouchlineMatchCentre.tsx',
        'components/touchline/match-centre/touchline-match-centre.module.css',
        'app/touchline-players/[player]/player-profile.module.css', 'components/touchline/cards/TouchlineEliteExactCard.tsx',
        'components/touchline/cards/TouchlineCardPerimeterTrace.tsx', 'components/touchline/TouchlineDecorationMotion.tsx'],
      mountScript: 'window.fixtureSelectors=loadEntry().selectors;flushSync(()=>root.render(React.createElement(loadEntry().default,{surface:new URL(location.href).searchParams.get("surface")})));' });
    writeFileSync(process.argv[1] + '/bundle.json', JSON.stringify(bundle));
    writeFileSync(process.argv[1] + '/sources.json', JSON.stringify(Object.fromEntries([...bundle.sources,
      'app/globals.css', 'node_modules/tailwindcss/preflight.css'].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])), null, 2));
  `, output], { cwd: root, timeout: 40_000, stdio: "pipe" });
  const bundle = JSON.parse(readFileSync(path.join(output, "bundle.json"), "utf8")) as { script: string; css: string };
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root" data-touchline-orientation-root></div><script>${bundle.script.replaceAll("</script", "<\\/script")}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public")), origin = "https://public-panels.test";
  const reports: unknown[] = [], assets = new Map<string, { bytes: number; sha256: string }>();
  assert.ok(existsSync(engine.executablePath()), "installed engine only");
  capacity(); // compilation has ended; recheck pressure immediately before launch
  const browser = await engine.launch({ headless: true });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  try {
    for (const scenario of [
      { width: 667, height: 375, touch: true, dpr: 3 },
      { width: 844, height: 390, touch: true, dpr: 3 },
      { width: 390, height: 844, touch: true, dpr: 3 }, // narrow override must not affect portrait
      { width: 1280, height: 900, touch: false, dpr: 1 },
    ]) for (const surface of ["live", "profile"] as const) {
      t.signal.throwIfAborted(); capacity();
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, hasTouch: scenario.touch,
        deviceScaleFactor: scenario.dpr, serviceWorkers: "block" });
      const page = await context.newPage(), errors: string[] = [], refused: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.install({ time: new Date("2026-11-03T12:00:00.000Z") });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== origin) { refused.push(`${request.method()} ${url.href}`); await route.abort(); return; }
        if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
        if (/^\/api\/touchline\/players\/[a-f0-9-]+\/social$/.test(url.pathname)) {
          await route.fulfill({ status: 401, json: { ok: false } }); return;
        }
        if (/\.(png|webp|svg|jpe?g|woff2?|json)$/i.test(url.pathname)) {
          const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
          if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile()
            && realpathSync(file).startsWith(publicRoot + path.sep)) {
            const bytes = readFileSync(file);
            assets.set(url.pathname, { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
            await route.fulfill({ path: file }); return;
          }
        }
        refused.push(url.pathname); await route.abort();
      });
      try {
        await page.goto(`${origin}/fixture?surface=${surface}`, { waitUntil: "domcontentloaded" });
        const selectors = await page.evaluate(() => (window as typeof window & { fixtureSelectors: Selectors }).fixtureSelectors);
        const panels = surface === "live" ? selectors.live.panels : [selectors.profile.panel, selectors.profile.card, selectors.profile.crest];
        await expect(page.locator(panels[0])).toBeVisible();
        await page.waitForLoadState("networkidle"); // isolated guest social response must settle before comparison
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.evaluate(async () => {
          // Exercise the real lazy image/visibility path without changing image
          // loading attributes or replacing the production observer.
          for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(120, innerHeight / 2)) {
            window.scrollTo({ top: y, left: 0, behavior: "instant" });
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          }
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
        await expect.poll(() => page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
        const targetMedia = await page.evaluate(() => matchMedia('(orientation: landscape) and (hover: none), (orientation: landscape) and (pointer: coarse)').matches);
        assert.equal(targetMedia, scenario.touch && scenario.width > scenario.height, "assert device media rather than infer it from viewport");
        // The before image restores only the exact former panel declarations;
        // all original artwork, card effects, gradients and geometry remain loaded.
        const original = surface === "live"
          ? `${panels[0]}{backdrop-filter:blur(18px) saturate(1.22)}${panels[1]}{backdrop-filter:blur(18px) saturate(1.18)}`
          : `${panels[0]}{backdrop-filter:blur(18px)}${panels[0]}::before{filter:blur(26px)}`;
        const restored = await page.addStyleTag({ content: original });
        const before = await geometry(page, panels);
        assert.match(before.panels[0].backdrop, /blur\(18px\)/, "the baseline must actually restore the original backdrop");
        if (surface === "live") {
          assert.match(before.panels[0].backdrop, /saturate\(1\.22\)/);
          assert.match(before.panels[1].backdrop, /blur\(18px\).*saturate\(1\.18\)/);
        } else assert.equal(before.panels[0].beforeFilter, "blur(26px)", "the baseline must actually restore the original pseudo blur");
        const prefix = `${surface}-${scenario.width}x${scenario.height}`;
        const detailSelector = surface === "profile" ? selectors.profile.card : selectors.live.hero;
        await captureViewport(page, path.join(output, `${prefix}-before`), detailSelector);
        await restored.evaluate(node => node.remove());
        await page.evaluate(async () => {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const after = await geometry(page, panels);
        assert.deepEqual(after.media, before.media, "capture must not alter actual pointer/orientation media");
        await captureViewport(page, path.join(output, `${prefix}-after`), detailSelector);
        assert.ok(after.scrollWidth <= after.width + 1, `${prefix}: horizontal overflow`);
        for (let index = 0; index < panels.length; index++) {
          sameGeometry(before.panels[index].rect, after.panels[index].rect, `${prefix}/panel${index}`);
          assert.equal(after.panels[index].background, before.panels[index].background, "keep original panel gradients");
          assert.equal(after.panels[index].beforeBackground, before.panels[index].beforeBackground, "keep original pseudo gradients");
          if (surface === "live" || index === 0) assert.equal(after.panels[index].backdrop, targetMedia ? "none" : before.panels[index].backdrop);
          else assert.equal(after.panels[index].filter, before.panels[index].filter, "card/crest shadow preserved");
        }
        if (surface === "profile") {
          assert.equal(after.panels[0].beforeFilter, targetMedia ? "none" : "blur(26px)");
          assert.equal(after.panels[1].beforeFilter, before.panels[1].beforeFilter, "card halo remains filtered and unchanged");
          assert.equal(after.crowns.length, 1, "real authority renders the leader crown");
          assert.equal(after.traces.length, 1);
          assert.equal(after.traces[0].opacity, "1", "neon visible without hover");
          assert.deepEqual(after.traces[0].paths, before.traces[0].paths);
          sameGeometry(before.traces[0].rect, after.traces[0].rect, "neon geometry");
        }
        assert.equal(after.images.length, before.images.length);
        after.images.forEach((img, index) => {
          assert.equal(img.src, before.images[index].src, "asset URL unchanged");
          assert.deepEqual(img.natural, before.images[index].natural, "asset resolution unchanged");
          assert.ok(img.natural[0] > 0 && img.natural[1] > 0);
          sameGeometry(before.images[index].rect, img.rect, `${prefix}/image${index}`);
        });
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        if (surface === "live") {
          const links = page.locator('[data-lineup-team]');
          assert.equal(await links.count(), 2, "both real lineup links remain reachable");
          for (const link of await links.all()) assert.match((await link.getAttribute("href")) ?? "", /^\/touchline-clubs\//);
          if (scenario.width === 844) {
            const rail = page.locator(selectors.live.rail);
            await rail.evaluate(node => { node.scrollTop = node.scrollHeight; });
            assert.ok(await rail.evaluate(node => node.scrollTop > 0), "844 landscape rail remains scrollable");
          }
        }
        assert.deepEqual(errors, []); assert.deepEqual(refused, []);
        reports.push({ surface, scenario, targetMedia, before, after, errors, refused });
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    writeFileSync(path.join(output, "report.json"), JSON.stringify({ engine: engine.name(), reports, assets: Object.fromEntries(assets) }, null, 2));
  }
});
