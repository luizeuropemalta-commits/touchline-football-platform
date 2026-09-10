import { expect, test } from "@playwright/test";

const visualQaBaseUrl = process.env.TOUCHLINE_VISUAL_QA_BASE_URL ?? "http://127.0.0.1:3123";
const visualQaPath = "/visual-qa/card-goalkeeper-stat-strip?lang=en-GB";
const supportedProjects = new Set(["chromium-desktop-1280", "chromium-phone-390"]);

test("waits for every card frame before taking visual QA evidence", async ({ page }, testInfo) => {
  test.skip(!supportedProjects.has(testInfo.project.name), "This fixture is intentionally limited to the 1280px and 390px evidence viewports.");

  const failedImageRequests: Array<{ url: string; error: string | null }> = [];
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "image") {
      failedImageRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null });
    }
  });

  const response = await page.goto(`${visualQaBaseUrl}${visualQaPath}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByText("ADMIN-GATED · STATIC LOCAL VISUAL QA · NO LOGIN · NO PROVIDER · NO WRITE")).toBeVisible();

  const frames = page.locator("img[data-touchline-card-frame=\"true\"]");
  await expect(frames).toHaveCount(14);

  const tierCards = page.locator("[data-gk-qa-tier]");
  await expect(tierCards).toHaveCount(7);

  const loadedFrames = await frames.evaluateAll(async (images: HTMLImageElement[]) => {
    await Promise.all(images.map((image) => image.decode()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    return images.map((image) => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      src: image.currentSrc,
    }));
  });

  expect(loadedFrames).toHaveLength(14);
  expect(loadedFrames).toEqual(expect.arrayContaining([
    expect.objectContaining({ complete: true, naturalWidth: 430, naturalHeight: 691 }),
  ]));
  expect(loadedFrames.every((frame) => frame.complete && frame.naturalWidth === 430 && frame.naturalHeight === 691)).toBe(true);
  expect(failedImageRequests).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("goalkeeper-card-frames-decoded.png"), fullPage: true });
});
