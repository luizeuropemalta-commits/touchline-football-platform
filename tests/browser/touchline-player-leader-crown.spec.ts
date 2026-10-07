import { expect, test } from "@playwright/test";

const opaqueBottomRatio = 1153 / 1254;

const visualQaBaseUrl = process.env.TOUCHLINE_VISUAL_QA_BASE_URL ?? "http://127.0.0.1:3123";
const visualQaPath = "/visual-qa/player-leader-crown?lang=en-GB";
const supportedProjects = new Set([
  "chromium-phone-390",
  "chromium-tablet-768",
  "chromium-desktop-1280",
  "chromium-desktop-1440",
  "chromium-tv-1920",
]);

const priceTableVersion = "2026-07-premier-v1";
const snapshotId = "visual-player-leader-snapshot";

test.beforeEach(async ({ page }) => {
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 767 && viewport.height > viewport.width) {
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
  }
});

function activeRankingPayload(status: "unique-leader" | "tied") {
  const positions = [
    ["goalkeeper", "visual-gk", "gk"],
    ["centre-back", "visual-cb", "cb"],
    ["full-back", "visual-fb", "fb"],
    ["midfielder", "visual-player-leader", "mid"],
    ["winger", "visual-wing", "wing"],
    ["striker", "visual-st", "st"],
  ] as const;
  return {
    phase: "ranked",
    leagueKey: "touchline-england",
    snapshotId,
    roundId: "visual-round-1",
    publishedAt: "2026-09-10T12:00:00.000Z",
    priceTableVersion,
    scoringVersion: "player_scoring_v3",
    coverageStatus: "complete",
    seasonId: "2026-27",
    fixtureIds: ["visual-fixture-1"],
    expectedFixtureIds: ["visual-fixture-1"],
    totalScorePoints: 0,
    players: positions.map(([positionGroup, playerId, providerPlayerId]) => ({
      playerId,
      providerPlayerId,
      positionGroup,
      positionRank: 1,
      groupSize: 1,
      totalRating: playerId === "visual-player-leader" ? 25 : 10,
      minutesPlayed: 90,
      appearances: 1,
      tierKey: "diamond-gold",
      priceTc: 15,
    })),
    leadershipDecision: status === "unique-leader"
      ? {
        status,
        scope: { rankingId: "touchline-player-overall", snapshotId },
        leader: { subjectType: "player", subjectId: "visual-player-leader" },
      }
      : {
        status,
        scope: { rankingId: "touchline-player-overall", snapshotId },
        contenders: [
          { subjectType: "player", subjectId: "visual-player-leader" },
          { subjectType: "player", subjectId: "visual-gk" },
        ],
      },
  };
}

test("renders the approved crown only for the published unique player leader on desktop and phone", async ({ page }, testInfo) => {
  test.skip(!supportedProjects.has(testInfo.project.name), "Crown evidence is intentionally limited to desktop and phone viewports.");

  let publishedStatus: "unique-leader" | "tied" = "unique-leader";
  let consumed = 0;
  await page.route("**/api/touchline-arena/card-ranking/active", (route) => {
    consumed += 1;
    return route.fulfill({ json: activeRankingPayload(publishedStatus) });
  });
  const response = await page.goto(`${visualQaBaseUrl}${visualQaPath}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  const fixture = page.locator("[data-crown-fixture-status]");
  await expect(fixture).toHaveAttribute("data-crown-fixture-status", "ready");
  await expect(fixture).toHaveAttribute("data-crown-fixture-snapshot", snapshotId);
  await expect(fixture).toHaveAttribute("data-crown-fixture-decision", "unique-leader");
  expect(consumed).toBeGreaterThan(0);

  const crown = page.locator("img[data-touchline-player-leader-crown='true']");
  await expect(crown).toHaveCount(1);
  await expect(crown).toHaveJSProperty("complete", true);
  await expect(crown).toHaveJSProperty("naturalWidth", 1254);

  const geometry = await crown.evaluate((image, alphaBottomRatio) => {
    const crownRect = image.getBoundingClientRect();
    const card = image.parentElement!;
    const cardRect = card.getBoundingClientRect();
    return {
      crownTop: crownRect.top,
      visibleCrownBottom: crownRect.top + (crownRect.height * alphaBottomRatio),
      cardTop: cardRect.top,
      crownWidth: crownRect.width,
    };
  }, opaqueBottomRatio);
  expect(geometry.crownWidth).toBeGreaterThan(0);
  expect(geometry.crownTop).toBeGreaterThanOrEqual(0);
  expect(geometry.visibleCrownBottom).toBeLessThan(geometry.cardTop);

  const frame = page.locator("img[data-touchline-card-frame='true']");
  await expect(frame).toHaveCount(1);
  await frame.evaluate(async (image: HTMLImageElement) => image.decode());
  const containment = await frame.evaluate((image) => {
    const frameRect = image.getBoundingClientRect();
    const card = image.closest(".touchline-card-surface")!;
    const cardRect = card.getBoundingClientRect();
    const crownRect = card.querySelector("[data-touchline-player-leader-crown='true']")!.getBoundingClientRect();
    return {
      centerDelta: Math.abs((frameRect.left + frameRect.width / 2) - (crownRect.left + crownRect.width / 2)),
      frameLeft: frameRect.left,
      frameRight: frameRect.right,
      frameBottom: frameRect.bottom + window.scrollY,
      cardBottom: cardRect.bottom + window.scrollY,
      documentBottom: document.documentElement.scrollHeight,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(containment.centerDelta).toBeLessThanOrEqual(1);
  expect(containment.frameLeft).toBeGreaterThanOrEqual(0);
  expect(containment.frameRight).toBeLessThanOrEqual(containment.viewportWidth);
  expect(containment.frameBottom).toBeLessThanOrEqual(containment.cardBottom + 1);
  expect(containment.frameBottom).toBeLessThanOrEqual(containment.documentBottom);

  await page.screenshot({ path: testInfo.outputPath("player-leader-crown.png"), fullPage: true });
  const uniqueReads = consumed;
  publishedStatus = "tied";
  await page.getByRole("button", { name: "Refresh published ranking" }).click();
  await expect.poll(() => consumed).toBeGreaterThan(uniqueReads);
  await expect(fixture).toHaveAttribute("data-crown-fixture-status", "ready");
  await expect(fixture).toHaveAttribute("data-crown-fixture-decision", "tied");
  await expect(crown).toHaveCount(0);
  const tiedReads = consumed;
  publishedStatus = "unique-leader";
  await page.getByRole("button", { name: "Refresh published ranking" }).click();
  await expect.poll(() => consumed).toBeGreaterThan(tiedReads);
  await expect(fixture).toHaveAttribute("data-crown-fixture-status", "ready");
  await expect(fixture).toHaveAttribute("data-crown-fixture-decision", "unique-leader");
  await expect(crown).toHaveCount(1);
});

test("does not render a crown for a tied published leadership decision", async ({ page }, testInfo) => {
  test.skip(!supportedProjects.has(testInfo.project.name), "Crown evidence is intentionally limited to desktop and phone viewports.");

  let consumed = 0;
  await page.route("**/api/touchline-arena/card-ranking/active", (route) => {
    consumed += 1;
    return route.fulfill({ json: activeRankingPayload("tied") });
  });
  await page.goto(`${visualQaBaseUrl}${visualQaPath}`, { waitUntil: "networkidle" });
  const fixture = page.locator("[data-crown-fixture-status]");
  await expect(fixture).toHaveAttribute("data-crown-fixture-status", "ready");
  await expect(fixture).toHaveAttribute("data-crown-fixture-snapshot", snapshotId);
  await expect(fixture).toHaveAttribute("data-crown-fixture-decision", "tied");
  expect(consumed).toBeGreaterThan(0);
  await expect(page.locator("[data-touchline-player-leader-crown='true']")).toHaveCount(0);
});
