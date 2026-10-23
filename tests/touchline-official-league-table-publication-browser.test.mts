import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, expect, type Page } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { resolveTouchlineOfficialLeagueTable, type TouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableFixture, type TouchlineOfficialLeagueTableLiveSource } from "../lib/football-data/official-league-table.ts";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";
import { parseTouchlineSportsPublication, type TouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://official-table-fixture.test";
const fixturePath = "/touchline-clubs/synthetic-club-01";
const auditRoot = "/Users/luizlopez/Documents/Codex/2026-09-05/touchline-prompt-formalizer/outputs/auditoria-mestre-20261021";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const primaryFixtureId = "19722190";
const tableIds = ["table-profile", "table-rail"] as const;
const clubName = (n: number) => `Synthetic Club ${String(n).padStart(2, "0")}`;
const clubSlug = (n: number) => `synthetic-club-${String(n).padStart(2, "0")}`;
const clubHref = (n: number) => `/touchline-clubs/${clubSlug(n)}?lang=en-GB`;

function baselineSource(now: number): TouchlineOfficialLeagueTableLiveSource {
  const stamp = new Date(now).toISOString();
  const season = { id: id(50), providerSeasonId: "28083", name: "Synthetic 2026/27", sourceUpdatedAt: stamp };
  const fixture = (providerFixtureId: string, home: number, away: number, homeScore: number, awayScore: number,
    status: string, ageDays: number): TouchlineOfficialLeagueTableFixture => ({
    provider: "sportmonks", providerFixtureId, seasonId: season.id, status, homeClubId: id(home), awayClubId: id(away),
    homeScore, awayScore, startsAt: new Date(now - ageDays * 86_400_000).toISOString(), sourceUpdatedAt: stamp,
  });
  return {
    competitionProviderId: "8", season,
    teams: Array.from({ length: 20 }, (_, index) => ({ clubId: id(index + 1), providerTeamId: String(index + 1),
      name: clubName(index + 1), shortCode: null, slug: clubSlug(index + 1), logoUrl: null, sourceUpdatedAt: stamp })),
    fixtures: [fixture("19722181", 1, 4, 1, 0, "FT", 4), fixture("19722182", 2, 4, 1, 0, "FT", 3),
      fixture("19722183", 3, 4, 1, 0, "FT", 2), fixture("19722184", 3, 4, 0, 0, "FT", 1),
      fixture(primaryFixtureId, 1, 2, 0, 0, "LIVE", 0)],
  };
}

function publicFixture(stamp: string, homeScore: number, awayScore: number, status = "LIVE"): TouchlinePublicFixture {
  return { id: primaryFixtureId, providerId: primaryFixtureId, competitionId: "8", seasonId: "28083", status,
    startsAt: stamp, homeTeam: { id: "1", providerId: "1", name: clubName(1) },
    awayTeam: { id: "2", providerId: "2", name: clubName(2) }, homeScore, awayScore,
    ...(status === "LIVE" ? { liveMinute: 35 } : {}), verifiedAt: stamp, providerUpdatedAt: stamp };
}

function publication(revision: number, stamp: string, fixtures: readonly TouchlinePublicFixture[]): TouchlineSportsPublication {
  const result = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england",
    publication: { snapshotId: id(100 + revision), contentDigest: revision.toString(16).padStart(32, "0"), publishedAt: stamp,
      playerRankingSnapshotId: null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: (100 + revision).toString(16).padStart(32, "0") },
    playerRanking: null, coachRanking: null, live: { fetchedAt: stamp, fixtures } });
  assert.ok(result, "the synthetic envelope must pass the real all-or-nothing public parser");
  return result;
}

function expectedTable(source: TouchlineOfficialLeagueTableLiveSource, fixture: TouchlinePublicFixture, now: number) {
  return resolveTouchlineOfficialLeagueTable({ ...source, now, fixtures: source.fixtures.map(row => row.providerFixtureId === fixture.providerId
    ? { ...row, homeScore: fixture.homeScore ?? null, awayScore: fixture.awayScore ?? null,
      status: fixture.status ?? null, sourceUpdatedAt: fixture.verifiedAt ?? null }
    : row) });
}

function expectedRows(table: TouchlineOfficialLeagueTable) {
  return table.rows.map(row => ({ href: clubHref(Number(row.team.providerTeamId)),
    cells: [String(row.displayPosition ?? "—"), String(row.played), String(row.won), String(row.drawn), String(row.lost),
      String(row.goalsFor), String(row.goalsAgainst), `${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}`,
      String(row.points), row.form.join(" · ") || "—"], live: Boolean(row.liveFixture), stale: row.liveFixture?.stale ?? false }));
}

async function tableRows(page: Page, tableId: string) {
  return page.locator(`#${tableId} tbody tr`).evaluateAll(rows => rows.map(row => ({
    href: row.querySelector("a")?.getAttribute("href"),
    cells: Array.from(row.querySelectorAll("td"), cell => cell.textContent?.trim() ?? ""),
    live: row.getAttribute("data-live") === "true", stale: row.getAttribute("data-live-stale") === "true",
  })));
}

async function settleFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

function safeCapturePrefix() {
  const prefix = process.env.TOUCHLINE_TABLE_CAPTURE_PREFIX;
  if (!prefix) return null;
  assert.ok(path.isAbsolute(prefix), "screenshot prefix must be absolute");
  const allowed = realpathSync(auditRoot);
  const directory = realpathSync(path.dirname(prefix));
  assert.ok(directory === allowed || directory.startsWith(`${allowed}${path.sep}`), "screenshots belong only in the existing audit directory");
  return path.join(directory, path.basename(prefix));
}

test("two real official tables and ClubHub score share goal/correction publications and preserve local state", {
  skip: process.env.TOUCHLINE_RUN_TABLE_BROWSER_TESTS !== "1", timeout: 180_000,
}, async t => {
  const now = Date.now() - 1_000, stamp = new Date(now).toISOString();
  const source = baselineSource(now);
  const baseline: TouchlineOfficialLeagueTable = { ...resolveTouchlineOfficialLeagueTable({ ...source, now }), liveProjectionSource: source };
  assert.equal(baseline.state, "ready"); assert.equal(baseline.rows.length, 20);
  const initialFixture = publicFixture(stamp, 0, 0);
  const seed = publication(1, stamp, [initialFixture]);
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/OfficialLeagueTablePublicationBrowserFixture.tsx", cssPrefix: "officialtableproof",
    allowSyntheticRouteRefresh: true,
    requiredSources: ["components/touchline/TouchlineOfficialLeagueTable.tsx", "components/touchline/TouchlineOfficialLeagueTable.module.css",
      "components/touchline/ClubHubLiveFixtureScore.tsx", "components/touchline/TouchlineLivePresentationRefresh.tsx",
      "lib/touchlineArena/sports-publication-official-table-client.ts", "lib/touchlineArena/sports-publication-official-table.ts",
      "lib/touchlineArena/live-presentation-client-store.ts", "lib/touchlineArena/sports-publication-reader.ts"],
    mountScript: `window.fixtureRefreshCount=0;window.onFixtureRouteRefresh=()=>{window.fixtureRefreshCount++;};
      window.unmountFixture=()=>flushSync(()=>root.unmount());window.transportDigest=()=>loadEntry().transportDigest();window.transportEpoch=()=>loadEntry().transportEpoch();
      window.rerenderFixture=patch=>{window.fixtureProps={...window.fixtureProps,...patch};flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));};
      flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
  });
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
  const safe = (text: string) => text.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
    <body><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps=${safe(JSON.stringify({ table: baseline, initialFixture, enabled: false }))};</script><script>${safe(bundle.script)}</script></body></html>`;
  const capturePrefix = safeCapturePrefix();
  const publicRoot = realpathSync(path.join(root, "public"));
  assert.ok(existsSync(chromium.executablePath()), "use the installed browser only, without downloads");
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [];
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      let current = seed;
      const requests: string[] = [], refused: string[] = [], errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== origin) {
          refused.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort(); return;
        }
        if (url.pathname === fixturePath) { await route.fulfill({ contentType: "text/html", body: html }); return; }
        if (url.pathname === "/api/touchline-arena/live-presentation-state") {
          requests.push(`state:${current.publication.contentDigest}`);
          // Idle scheduling keeps this event-driven proof deterministic; it is
          // not a test of production polling cadence or provider latency.
          await route.fulfill({ json: { version: 1, available: true, mode: "idle", pollAfterMs: null, resumeAt: null,
            playerRankingSnapshotId: null, coachRankingSnapshotId: null, livePresentationSnapshotId: current.publication.contentDigest,
            liveFreshness: { fetchedAt: current.live.fetchedAt, ageMs: 0, degraded: false } } }); return;
        }
        if (url.pathname === "/api/touchline-arena/sports-publication") {
          requests.push(`payload:${current.publication.contentDigest}`);
          await route.fulfill({ json: { ok: true, data: current } }); return;
        }
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile()
          && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) { await route.fulfill({ path: file }); return; }
        refused.push(url.pathname); await route.abort();
      });
      try {
        await page.goto(`${origin}${fixturePath}`, { waitUntil: "domcontentloaded" });
        for (const tableId of tableIds) await expect(page.locator(`#${tableId} tbody tr`)).toHaveCount(20);
        await settleFrames(page);
        assert.deepEqual(requests, [], "static opt-out must not subscribe or borrow another surface's publication");
        await page.getByRole("textbox", { name: "Local note" }).fill("keep table selection");
        const rerender = (patch: unknown) => page.evaluate(value =>
          (window as unknown as { rerenderFixture: (value: unknown) => void }).rerenderFixture(value), patch);
        await rerender({ enabled: true });
        await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(seed.publication.contentDigest);
        const payloads = () => requests.filter(value => value.startsWith("payload:"));
        await expect.poll(() => payloads().length).toBe(1);
        const profile = page.locator("#table-profile");
        const profileHandle = await profile.elementHandle();
        const score = page.locator("[data-table-fixture-score] b");
        const movingLink = profile.locator(`a[href="${clubHref(1)}"]`);
        const movingLinkHandle = await movingLink.elementHandle();
        const movingRowHandle = await movingLink.evaluateHandle(link => link.closest("tr")!);
        const scroll = profile.locator('[tabindex="0"][aria-label]');
        const scrollHandle = await scroll.elementHandle();
        assert.ok(profileHandle && movingLinkHandle && scrollHandle);
        await movingLink.evaluate(link => (link as HTMLElement).focus({ preventScroll: true }));
        await scroll.evaluate(element => { element.scrollTop = Math.min(300, element.scrollHeight - element.clientHeight); });
        await settleFrames(page);
        const scrollBefore = await scroll.evaluate(element => element.scrollTop);
        assert.ok(scrollBefore > 0, "all viewports must exercise genuine nonzero table scroll");
        const documentScrollBefore = await page.evaluate(() => window.scrollY);

        const check = async (fixture: TouchlinePublicFixture, points: readonly [number, number], preserveInteraction = true) => {
          const expected = expectedTable(source, fixture, now);
          const rows = expectedRows(expected);
          for (const tableId of tableIds) {
            await expect.poll(() => tableRows(page, tableId)).toEqual(rows);
            for (const [index, playerPoints] of points.entries()) {
              const tr = page.locator(`#${tableId} tbody tr`).filter({ has: page.locator(`a[href="${clubHref(index + 1)}"]`) });
              await expect(tr.locator("td").nth(1), "one live fixture must not increment games on each event").toHaveText("2");
              await expect(tr.locator("td").nth(8)).toHaveText(String(playerPoints));
            }
          }
          await expect(score).toContainText(`${fixture.homeScore} — ${fixture.awayScore}`);
          await expect(score).toContainText(fixture.status === "FT" ? "Full Time" : "35′");
          await expect(profile.locator("header small").last()).toContainText(String(fixture.status === "FT" ? 5 : 4));
          assert.equal(await profileHandle.evaluate(node => node === document.getElementById("table-profile")), true);
          assert.equal(await movingLinkHandle.evaluate((node, selector) => node === document.querySelector(selector), `#table-profile a[href="${clubHref(1)}"]`), true);
          assert.equal(await movingRowHandle.evaluate((node, selector) => node === document.querySelector(selector)?.closest("tr"), `#table-profile a[href="${clubHref(1)}"]`), true);
          await expect(page.getByRole("textbox", { name: "Local note" })).toHaveValue("keep table selection");
          if (preserveInteraction) {
            await expect(movingLink).toBeFocused();
            assert.equal(await scrollHandle.evaluate(element => element.scrollTop), scrollBefore, "publication preserves table scroll");
            assert.equal(await page.evaluate(() => window.scrollY), documentScrollBefore, "publication does not move document scroll");
          }
        };
        await check(initialFixture, [4, 4]);
        const sequence = [
          { revision: 2, home: 1, away: 0, status: "LIVE", points: [6, 3] },
          { revision: 3, home: 1, away: 1, status: "LIVE", points: [4, 4] },
          { revision: 4, home: 0, away: 1, status: "LIVE", points: [3, 6] },
          { revision: 5, home: 0, away: 1, status: "FT", points: [3, 6] },
        ] as const;
        for (const step of sequence) {
          const next = publicFixture(stamp, step.home, step.away, step.status);
          current = publication(step.revision, stamp, [next]);
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
          await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(current.publication.contentDigest);
          await check(next, step.points);
          assert.equal(payloads().filter(value => value === `payload:${current.publication.contentDigest}`).length, 1,
            "both tables and score consume one payload per accepted publication, not per component");
        }
        const finalFixture = publicFixture(stamp, 0, 1, "FT");
        // Keep the same mounted season and reconcile stale SSR history. The
        // callback above observes refresh intent only; this is not real RSC.
        await rerender({ table: JSON.parse(JSON.stringify(baseline)) });
        await check(finalFixture, [3, 6]);
        const payloadCountBeforeRepeat = payloads().length;
        const stateCountBeforeRepeat = requests.filter(value => value.startsWith("state:")).length;
        const epochBeforeRepeat = await page.evaluate("window.transportEpoch()") as number;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await expect.poll(() => requests.filter(value => value.startsWith("state:")).length).toBeGreaterThan(stateCountBeforeRepeat);
        await expect.poll(() => page.evaluate("window.transportEpoch()")).toBeGreaterThan(epochBeforeRepeat);
        await settleFrames(page);
        assert.equal(payloads().length, payloadCountBeforeRepeat, "same-digest signal does not reload the publication");
        await check(finalFixture, [3, 6]);
        current = publication(6, stamp, []);
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(current.publication.contentDigest);
        await check(finalFixture, [3, 6]);
        assert.equal(payloads().filter(value => value === `payload:${current.publication.contentDigest}`).length, 1);
        // The earlier A publication can be accepted again after B. The store
        // orders accepted reads, never opaque digest strings or score values.
        current = seed;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(seed.publication.contentDigest);
        await check(initialFixture, [4, 4]);
        assert.equal(payloads().filter(value => value === `payload:${seed.publication.contentDigest}`).length, 2,
          "A is downloaded once on initial acceptance and once after the intervening publication");

        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth, document: document.documentElement.scrollWidth,
          surfaces: ["table-profile", "table-rail"].map(key => {
            const section = document.getElementById(key)!;
            const rect = section.getBoundingClientRect();
            const wrap = section.querySelector<HTMLElement>('[tabindex="0"][aria-label]')!;
            const scrollRect = wrap.getBoundingClientRect();
            return { key, left: rect.left, right: rect.right, scrollLeft: scrollRect.left, scrollRight: scrollRect.right,
              scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight };
          }),
        }));
        assert.ok(dimensions.document <= dimensions.viewport + 1, "tables cannot make the page horizontally overflow");
        for (const surface of dimensions.surfaces) {
          assert.ok(surface.left >= -1 && surface.right <= viewport.width + 1, `${surface.key}: surface contained`);
          assert.ok(surface.scrollLeft >= surface.left - 1 && surface.scrollRight <= surface.right + 1, `${surface.key}: scroll region contained`);
          assert.ok(surface.scrollHeight > surface.clientHeight, `${surface.key}: scroll is exercised on real content`);
        }
        if (capturePrefix) await page.screenshot({ path: `${capturePrefix}-${viewport.width}x${viewport.height}.png` });
        await rerender({ hidden: true });
        await expect(page.locator("[data-table-fixture-visibility]")).toBeHidden();
        await settleFrames(page);
        const hiddenRequests = requests.length;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await settleFrames(page);
        assert.equal(requests.length, hiddenRequests, "hidden table observers and disabled score leave no active read subscriber");
        await rerender({ hidden: false, enabled: false });
        await settleFrames(page);
        const disabledRequests = requests.length;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await settleFrames(page);
        assert.equal(requests.length, disabledRequests, "explicit static opt-out makes no shared transport requests");
        for (const tableId of tableIds) assert.deepEqual(await tableRows(page, tableId), expectedRows(baseline), "opt-out renders its own SSR baseline");
        const resumed = publicFixture(stamp, 2, 1);
        current = publication(7, stamp, [resumed]);
        await rerender({ enabled: true });
        await expect.poll(() => page.evaluate("window.transportDigest()")).toBe(current.publication.contentDigest);
        await check(resumed, [6, 3], false);
        assert.equal(payloads().filter(value => value === `payload:${current.publication.contentDigest}`).length, 1);
        const routeRefreshRequests = await page.evaluate("window.fixtureRefreshCount") as number;
        assert.ok(routeRefreshRequests > 0, "real refresh boundary still requests server reconciliation");
        await page.evaluate("window.unmountFixture()");
        await settleFrames(page);
        const unmountedRequests = requests.length;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await settleFrames(page);
        assert.equal(requests.length, unmountedRequests, "unmount removes subscriptions and online listeners");
        assert.deepEqual(refused, []); assert.deepEqual(errors, []);
        reports.push({ viewport, dimensions, scrollBefore, payloads: payloads().length, stateReads: requests.length - payloads().length,
          routeRefreshRequests, scenarios: ["goal", "equaliser", "downward-correction", "FT-no-double-count", "late-SSR", "omission-LKG",
            "A-B-A", "same-digest", "hidden", "disabled", "resume", "unmount"], focusScrollAndInputPreserved: true });
      } finally { await page.evaluate("window.unmountFixture?.()").catch(() => undefined); await context.close(); }
    }
    console.log(`OFFICIAL_TABLE_BROWSER_PROOF ${JSON.stringify({ reports,
      qualification: "isolated real React/CSS/shared store with synthetic public data; refresh intent observed, not real Next/RSC/QA/provider or native Safari proof" })}`);
  } finally { await browser.close(); }
});
