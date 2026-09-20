import { expect, test } from "@playwright/test";

const candidateUrl = process.env.TOUCHLINE_ARENA_VISUAL_QA_URL;
const mobileEvidenceProject = "chromium-phone-390";

/** A no-write phone capture; it does not promote desktop polygon evidence to mobile acceptance. */
test("captures the no-write mobile Arena fixture without promoting desktop geometry", async ({ page }, testInfo) => {
  test.skip(!candidateUrl, "Set TOUCHLINE_ARENA_VISUAL_QA_URL to a clean candidate before mobile visual QA.");
  test.skip(testInfo.project.name !== mobileEvidenceProject, "Runs only in the explicit phone visual-QA project.");
  // Gameplay evidence is landscape; the shared launch test separately proves
  // portrait is blocked and state survives rotation.
  await page.setViewportSize({ width: 844, height: 390 });
  const blockedWrites: string[] = [];
  await page.route("**/*", async (route) => {
    const method = route.request().method();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      blockedWrites.push(`${method} ${route.request().url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const url = new URL(candidateUrl!);
  url.searchParams.set("demoLineup", "1");
  url.searchParams.set("skipIntro", "1");
  url.searchParams.set("lang", "en-GB");
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await expect(page.locator(".arena-stage")).toBeVisible();
  await expect(page.locator(".arena-field-player")).toHaveCount(11);
  await expect.poll(() => page.locator(".arena-field-player").evaluateAll((players) => (
    players.every((player) => /^(four-line-polygon|rail-only|unmeasured)$/.test(
      player.getAttribute("data-containment-coverage") ?? "",
    ))
  ))).toBe(true);
  await testInfo.attach("arena-mobile-fixture", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(blockedWrites).toEqual([]);
});
