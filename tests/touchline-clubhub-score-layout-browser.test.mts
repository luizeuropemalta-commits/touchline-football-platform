import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";
import { parseTouchlineLivePresentationState } from "../lib/touchlineArena/live-presentation-state.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";
import { touchlineFixtureStatusLabel } from "../lib/touchlineArena/match-centre.ts";
import type { TouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://clubhub-score-layout.test";
const locales: TouchLineLocale[] = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];

// The compiler runs in a separate process which exits before browser launch.
if (process.argv[2] === "--compile-fixture") {
  const output = realpathSync(process.argv[3]);
  assert.equal(path.dirname(output), "/private/tmp");
  assert.match(path.basename(output), /^touchline-score-layout-[A-Za-z0-9]+$/);
  const { bundleIsolatedBrowserFixture } = await import("./helpers/touchline-isolated-browser-bundle.mts");
  const { extractIsolatedPageCss } = await import("./helpers/touchline-lineup-anchor-page-css.mts");
  const ts = (await import("typescript")).default;
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/ClubHubScoreLayoutBrowserFixture.tsx", allowSyntheticRouteRefresh: true,
    requiredSources: ["components/touchline/ClubHubOfficialLineup.tsx", "components/touchline/ClubHubOfficialLineup.module.css",
      "components/touchline/ClubHubLiveFixtureScore.tsx", "lib/touchlineArena/sports-publication-reader.ts"],
    mountScript: `window.onFixtureRouteRefresh=()=>{};window.transportDigest=loadEntry().transportDigest;
      window.unmountFixture=()=>flushSync(()=>root.unmount());
      flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
  });
  const globals = readFileSync(path.join(root, "app/globals.css"), "utf8");
  const start = globals.indexOf(":root {"), end = globals.indexOf("body::before {");
  assert.ok(start >= 0 && end > start);
  const pageSource = readFileSync(path.join(root, "app/touchline-clubs/[club]/page.tsx"), "utf8");
  const pageCss = extractIsolatedPageCss(ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8") + globals.slice(start, end) + pageCss + bundle.css;
  writeFileSync(path.join(output, "script.js"), bundle.script, { flag: "wx" });
  writeFileSync(path.join(output, "style.css"), css, { flag: "wx" });
  writeFileSync(path.join(output, "sources.json"), JSON.stringify(bundle.sources), { flag: "wx" });
} else test("real ClubHub score status remains contained beside real crests in eight locales", {
  skip: process.env.TOUCHLINE_RUN_SCORE_LAYOUT_BROWSER !== "1", timeout: 240_000,
}, async t => {
  const engineName = process.env.TOUCHLINE_SCORE_LAYOUT_ENGINE ?? "chromium";
  assert.ok(["chromium", "webkit"].includes(engineName));
  const engine = engineName === "webkit" ? webkit : chromium;
  const requestedLocale = process.env.TOUCHLINE_SCORE_LAYOUT_LOCALE;
  const requestedWidth = process.env.TOUCHLINE_SCORE_LAYOUT_WIDTH;
  assert.ok(!requestedLocale || locales.includes(requestedLocale as TouchLineLocale));
  assert.ok(!requestedWidth || ["390", "844", "1280"].includes(requestedWidth));
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true });
  capacity();
  const output = mkdtempSync("/private/tmp/touchline-score-layout-");
  t.diagnostic(`Evidence: ${output}; synthetic public fixture, real components/CSS/shared transport. Empty lineup; no RSC/auth/provider, native Safari or portrait-gate proof. Engine ${engineName}; partial ${Boolean(requestedLocale || requestedWidth)}.`);
  t.signal.throwIfAborted();
  execFileSync(process.execPath, ["--experimental-strip-types", import.meta.filename, "--compile-fixture", output], {
    cwd: root, stdio: "pipe", timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  t.signal.throwIfAborted();
  capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
  const script = readFileSync(path.join(output, "script.js"), "utf8");
  const css = readFileSync(path.join(output, "style.css"), "utf8");
  const publicRoot = realpathSync(path.join(root, "public"));
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
  const reports: unknown[] = [];
  try {
    for (const width of [390, 844, 1280].filter(value => !requestedWidth || String(value) === requestedWidth)) {
      for (const locale of locales.filter(value => !requestedLocale || value === requestedLocale)) {
        capacity(); t.signal.throwIfAborted();
        const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], denied: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
          const stamp = new Date(Date.now() - 1000).toISOString();
          const initialFixture = { id: "990099", providerId: "990099", competitionId: "8", seasonId: "28083",
            homeTeam: { id: "19", providerId: "19", name: "Arsenal" }, awayTeam: { id: "18", providerId: "18", name: "Chelsea" },
            startsAt: stamp, status: "LIVE", homeScore: 2, awayScore: 1, liveMinute: 61, verifiedAt: stamp };
          let phase: "fresh" | "stale" | "FT" = "fresh", revision = 1;
          const publication = () => {
            const result = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england",
              publication: { snapshotId: `10000000-0000-4000-8000-${String(revision).padStart(12, "0")}`,
                contentDigest: revision.toString(16).padStart(32, "0"), publishedAt: stamp,
                playerRankingSnapshotId: null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: (revision + 100).toString(16).padStart(32, "0") },
              playerRanking: null, coachRanking: null, live: { fetchedAt: stamp,
                fixtures: [{ ...initialFixture, status: phase === "FT" ? "FT" : "LIVE" }] } });
            assert.ok(result); return result;
          };
          const props = JSON.stringify({ locale, fixture: initialFixture }).replaceAll("</script", "<\\/script");
          const html = `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.fixtureProps=${props};${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { denied.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
            if (url.pathname === "/fixture") { await route.fulfill({ contentType: "text/html", body: html }); return; }
            const current = publication();
            if (url.pathname === "/api/touchline-arena/live-presentation-state") {
              const state = { version: 1, available: true, mode: "idle", pollAfterMs: null, resumeAt: null,
                playerRankingSnapshotId: null, coachRankingSnapshotId: null, livePresentationSnapshotId: current.publication.contentDigest,
                liveFreshness: { fetchedAt: stamp, ageMs: Date.now() - Date.parse(stamp), degraded: phase === "stale" } };
              assert.ok(parseTouchlineLivePresentationState(state)); await route.fulfill({ json: state }); return;
            }
            if (url.pathname === "/api/touchline-arena/sports-publication") { await route.fulfill({ json: { ok: true, data: current } }); return; }
            const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
            if (file.startsWith(publicRoot + path.sep) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(publicRoot + path.sep)) {
              await route.fulfill({ path: file }); return;
            }
            denied.push(url.pathname); await route.abort();
          });
          await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
          await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(publication().publication.contentDigest);
          for (const nextPhase of ["fresh", "stale", "FT"] as const) {
            capacity(); phase = nextPhase; revision++;
            await page.evaluate(() => window.dispatchEvent(new Event("online")));
            await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(publication().publication.contentDigest);
            const score = page.locator("[data-clubhub-fixture-score]");
            const status = page.locator("[data-clubhub-fixture-status]");
            const expected = phase === "fresh" ? "61′" : phase === "stale" ? getTouchlineMatchCentreCopy(locale, true).liveDataUpdating : touchlineFixtureStatusLabel("FT", locale, true);
            await expect(score).toHaveText("2 — 1"); await expect(status).toHaveText(expected);
            await expect(status).toBeVisible();
            if (phase !== "fresh") await expect(status).not.toContainText("61′");
            const crests = page.locator("#touchline-club-lineup [data-club-hub-crest-host]");
            await expect(crests).toHaveCount(2);
            await expect.poll(() => crests.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
            const geometry = await score.evaluate(element => {
              const b = element.parentElement!, grid = b.parentElement!, aside = grid.parentElement!;
              const status = b.querySelector<HTMLElement>("[data-clubhub-fixture-status]")!;
              const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
              const textRange = document.createRange(); textRange.selectNodeContents(element);
              const statusRange = document.createRange(); statusRange.selectNodeContents(status);
              const words = [...(status.textContent ?? "").matchAll(/\S+/gu)].map(match => {
                const range = document.createRange(); range.setStart(status.firstChild!, match.index!); range.setEnd(status.firstChild!, match.index! + match[0].length);
                return { text: match[0], tops: [...range.getClientRects()].map(r => r.top) };
              });
              const crestHosts = [...grid.querySelectorAll("[data-club-hub-crest-host]")];
              const crestHitTargets = crestHosts.map(crest => { const r = crest.getBoundingClientRect(); return crest.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
              return { subgrid: CSS.supports("grid-template-columns", "subgrid"), words, crestHitTargets, score: rect(element), status: rect(status), b: rect(b), grid: rect(grid), aside: rect(aside),
                crests: [...grid.querySelectorAll("[data-club-hub-crest-host]")].map(rect),
                scoreLines: [...textRange.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
                statusLines: [...statusRange.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
                statusFontSize: getComputedStyle(status).fontSize, statusOverflow: getComputedStyle(status).textOverflow,
                documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
            });
            assert.ok(geometry.documentWidth <= geometry.viewport + 1, "no horizontal page overflow");
            for (const box of [geometry.b, geometry.status, geometry.score, ...geometry.crests]) {
              assert.ok(box.left >= geometry.aside.left - 1 && box.right <= geometry.aside.right + 1, "status/score/crests horizontally contained in matchup");
              assert.ok(box.top >= geometry.aside.top - 1 && box.bottom <= geometry.aside.bottom + 1, "status/score/crests vertically contained in matchup");
            }
            assert.equal(geometry.subgrid, true, "tested browser supports the actual shared grid tracks");
            for (const crest of geometry.crests) {
              assert.ok(crest.right <= geometry.score.left + 1 || crest.left >= geometry.score.right - 1, "crests separated from score");
              assert.ok(crest.bottom <= geometry.status.top + 1, "full-width status lies below both crests");
            }
            assert.ok(Math.abs(geometry.crests[0].top - geometry.crests[1].top) <= 1, "crests remain aligned");
            assert.ok(geometry.crestHitTargets.every(Boolean), "structural live region does not intercept crest hit targets");
            assert.ok(geometry.status.width >= geometry.grid.width - 1, "status uses the full matchup row");
            const statusTops = geometry.statusLines.map(line => line.top).filter((top, index, all) => all.findIndex(other => Math.abs(other - top) <= 1) === index);
            assert.ok(statusTops.length <= 3, "status remains readable in at most three lines");
            assert.ok(geometry.words.every(word => word.tops.length && word.tops.every(top => Math.abs(top - word.tops[0]) <= 1)), "status wraps at word boundaries, never fragments words");
            assert.ok(geometry.scoreLines.length > 0 && geometry.scoreLines.every(line => Math.abs(line.top - geometry.scoreLines[0].top) <= 1), "score stays on one line");
            assert.ok(geometry.statusLines.length > 0 && geometry.statusLines.every(line => line.left >= geometry.status.left - 1 && line.right <= geometry.status.right + 1), "entire status text fits, no clipping/ellipsis");
            for (const box of [geometry.score, geometry.status]) {
              assert.ok(box.left >= geometry.b.left - 1 && box.right <= geometry.b.right + 1
                && box.top >= geometry.b.top - 1 && box.bottom <= geometry.b.bottom + 1, "score/status boxes contained in their column on both axes");
            }
            for (const [label, lines, box] of [["score", geometry.scoreLines, geometry.score], ["status", geometry.statusLines, geometry.status]] as const) {
              assert.ok(lines.every(line => line.left >= box.left - 1 && line.right <= box.right + 1), `${label}: complete text fits its own width`);
              // Range rectangles include font ascent/descent, which may exceed a
              // unit line-height. Bound the actual range by the shared column,
              // not by a guessed glyph ink box; still require separation below.
              assert.ok(lines.every(line => line.top >= geometry.b.top - 1 && line.bottom <= geometry.b.bottom + 1), `${label}: complete text fits the column height`);
            }
            assert.ok(geometry.score.bottom <= geometry.status.top + 1, "score/status boxes do not overlap vertically");
            assert.ok(Math.max(...geometry.scoreLines.map(line => line.bottom)) <= Math.min(...geometry.statusLines.map(line => line.top)) + 1,
              "complete score/status text ranges do not overlap vertically");
            assert.equal(geometry.statusFontSize, "17px"); assert.notEqual(geometry.statusOverflow, "ellipsis");
            await page.screenshot({ path: path.join(output, `${engineName}-${width}-${locale}-${phase}.png`), fullPage: true });
            reports.push({ width, locale, phase, expected, geometry });
            writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ engineName, reports, partial: Boolean(requestedLocale || requestedWidth) }, null, 2));
          }
          assert.deepEqual(errors, []); assert.deepEqual(denied, []);
          await page.evaluate("window.unmountFixture()");
        } finally { await context.close(); }
      }
    }
    t.diagnostic(`SCORE_LAYOUT_PROOF ${reports.length} cases: ${output}`);
  } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
});
