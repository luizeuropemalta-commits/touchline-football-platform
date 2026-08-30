import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium, webkit } = createRequire(import.meta.url)("playwright");

const baseUrl = process.env.TOUCHLINE_QA_BROWSER_BASE_URL ?? "http://127.0.0.1:3100";
const statePath = "/api/touchline-arena/live-presentation-state";
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-landscape", width: 1024, height: 768 },
];
const routes = [
  { name: "rankings", path: "/touchline-player-card-rankings?lang=pt-BR", player: true, coach: false },
  { name: "player-profile", path: "/touchline-players/cole-palmer?lang=pt-BR&name=Cole%20Palmer", player: true, coach: false },
  { name: "coach-profile", path: "/touchline-coaches/mikel-arteta?lang=pt-BR", player: false, coach: true },
  { name: "tables", path: "/touchline-tables?lang=pt-BR", player: true, coach: true },
];

async function waitUntil(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the refresh contract");
}

async function verifyScenario(browserType, browserName, viewport, scenario) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  let endpointCalls = 0;
  let rscRequests = 0;
  let documentRequests = 0;
  let playerRevision = null;
  let coachRevision = null;

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests += 1;
    if (request.headers().rsc === "1") rscRequests += 1;
  });
  await page.route(`**${statePath}`, async (route) => {
    endpointCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        version: 1,
        available: true,
        playerRankingSnapshotId: playerRevision,
        coachRankingSnapshotId: coachRevision,
        mode: "live",
        pollAfterMs: 15_000,
        resumeAt: null,
      }),
    });
  });

  const targetUrl = new URL(scenario.path, baseUrl).toString();
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await waitUntil(() => endpointCalls >= 1);
  const sharedNavigation = page.locator("details:visible").first();
  const sharedNavigationSummary = sharedNavigation.locator("summary");
  const hasExpandableNavigation = await sharedNavigation.count() === 1;
  const focusTarget = hasExpandableNavigation
    ? sharedNavigationSummary
    : page.locator("a:visible").first();
  assert.equal(await focusTarget.count(), 1, `${browserName}/${viewport.name}/${scenario.name}: focus target missing`);
  if (hasExpandableNavigation) {
    await sharedNavigationSummary.click();
    assert.equal(await sharedNavigation.getAttribute("open"), "", `${browserName}/${viewport.name}/${scenario.name}: navigation did not open`);
  }
  await focusTarget.focus();
  const callsBeforeChange = endpointCalls;
  const rscBeforeChange = rscRequests;
  const documentsBeforeChange = documentRequests;
  const navigationEntriesBefore = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const scrollBefore = await page.evaluate(async () => {
    const spacer = document.createElement("div");
    spacer.dataset.liveRefreshTestSpacer = "true";
    spacer.style.height = "1200px";
    document.body.append(spacer);
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 240);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.scrollY;
  });

  if (scenario.player) playerRevision = "player-snapshot-next";
  if (scenario.coach) coachRevision = "coach-snapshot-next";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitUntil(() => rscRequests > rscBeforeChange);
  await page.waitForTimeout(350);

  const navigationEntriesAfter = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const selectedDetailPreserved = hasExpandableNavigation
    ? await sharedNavigation.evaluate((node) => node.hasAttribute("open"))
    : true;
  const focusPreserved = await focusTarget.evaluate((node) => document.activeElement === node);
  assert.equal(endpointCalls - callsBeforeChange, 1, `${browserName}/${viewport.name}/${scenario.name}: duplicate metadata read`);
  assert.equal(documentRequests, documentsBeforeChange, `${browserName}/${viewport.name}/${scenario.name}: document reload`);
  assert.equal(navigationEntriesAfter, navigationEntriesBefore, `${browserName}/${viewport.name}/${scenario.name}: navigation entry changed`);
  assert.equal(new URL(page.url()).pathname, new URL(targetUrl).pathname);
  assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1, `${browserName}/${viewport.name}/${scenario.name}: scroll moved ${scrollBefore} -> ${scrollAfter}`);
  assert.equal(selectedDetailPreserved, true, `${browserName}/${viewport.name}/${scenario.name}: selected navigation detail closed`);
  assert.equal(focusPreserved, true, `${browserName}/${viewport.name}/${scenario.name}: focused control was replaced`);
  assert.deepEqual(errors, [], `${browserName}/${viewport.name}/${scenario.name}: browser errors`);

  await browser.close();
  return {
    browser: browserName,
    viewport: viewport.name,
    route: scenario.name,
    endpointReads: endpointCalls,
    rscRefreshes: rscRequests - rscBeforeChange,
    reloads: documentRequests - documentsBeforeChange,
    scrollBefore,
    scrollAfter,
    selectedDetailPreserved,
    focusPreserved,
  };
}

const results = [];
for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const viewport of viewports) {
    for (const scenario of routes) {
      results.push(await verifyScenario(browserType, browserName, viewport, scenario));
    }
  }
}

console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
