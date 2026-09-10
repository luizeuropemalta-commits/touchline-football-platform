import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  ARENA_PERSPECTIVE_CALIBRATIONS,
  cardEnvelopeClearsSideSweepRail,
  hasFourLineGrassPolygon,
  type ArenaCalibrationPoint,
  type ArenaPerspectiveId,
  type ArenaRenderedCardEnvelope,
} from "../../lib/touchlineArena/arena-perspective-calibration";

/**
 * Runtime visual-QA harness for the only formations supported by the official
 * state contract. It is intentionally not part of the application bundle.
 *
 * Set TOUCHLINE_ARENA_VISUAL_QA_URL to a clean, read-only candidate URL before
 * running it. The harness aborts every non-GET request and therefore cannot
 * persist a lineup, session renewal, or editor change.
 *
 * Evidence boundary:
 * - wide-touchline and lower-stand use their measured four-line polygons;
 * - side-sweep only proves clearance above the live carousel rail. It never
 *   describes side-sweep as a four-line grass-containment check.
 */

const candidateUrl = process.env.TOUCHLINE_ARENA_VISUAL_QA_URL;
const evidenceProject = "chromium-desktop-1440";
const sourceFrame = { width: 1280, height: 720 } as const;

const supportedFormationMatrix = [
  { formation: "4-3-3", camera: "wide-touchline", sampleSeconds: 4.5 },
  { formation: "4-3-3", camera: "lower-stand", sampleSeconds: 12.5 },
  { formation: "4-3-3", camera: "side-sweep", sampleSeconds: 17.3 },
  { formation: "4-4-2", camera: "wide-touchline", sampleSeconds: 4.5 },
  { formation: "4-4-2", camera: "lower-stand", sampleSeconds: 12.5 },
  { formation: "4-4-2", camera: "side-sweep", sampleSeconds: 17.3 },
] as const;

type Rect = ArenaRenderedCardEnvelope;

function pointIsInsidePolygon(point: ArenaCalibrationPoint, polygon: readonly ArenaCalibrationPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crossesRay = (current.y > point.y) !== (prior.y > point.y);
    if (crossesRay && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}

function fullRectIsInsidePolygon(rect: Rect, polygon: readonly ArenaCalibrationPoint[]): boolean {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ].every((corner) => pointIsInsidePolygon(corner, polygon));
}

/** Maps source-frame evidence into the rendered `object-fit: cover` video box. */
function projectSourcePointToVideoBox(
  point: ArenaCalibrationPoint,
  video: { width: number; height: number },
): ArenaCalibrationPoint {
  const scale = Math.max(video.width / sourceFrame.width, video.height / sourceFrame.height);
  const drawnWidth = sourceFrame.width * scale;
  const drawnHeight = sourceFrame.height * scale;
  return {
    x: point.x * scale - (drawnWidth - video.width) / 2,
    y: point.y * scale - (drawnHeight - video.height) / 2,
  };
}

async function selectFormationAndSeek(
  page: Page,
  formation: "4-3-3" | "4-4-2",
  sampleSeconds: number,
): Promise<void> {
  const formationButton = page.getByRole("button", { name: new RegExp(`^${formation.replaceAll("-", "\\-")}$`) });
  await formationButton.click();
  const loopVideo = page.locator(".arena-video-b");
  await expect(loopVideo).toHaveJSProperty("readyState", 4);
  await loopVideo.evaluate(async (element, seconds) => {
    const video = element as HTMLVideoElement;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Arena loop seek timed out")), 5_000);
      video.addEventListener("seeked", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.currentTime = seconds;
    });
  }, sampleSeconds);
}

async function readStageEvidence(
  page: Page,
): Promise<{
  stage: { left: number; top: number; width: number; height: number };
  video: { width: number; height: number; nativeWidth: number; nativeHeight: number };
  rail: { top: number };
  cards: Array<{
    camera: ArenaPerspectiveId;
    coverage: "four-line-polygon" | "rail-only" | "unmeasured" | null;
    rect: Rect;
  }>;
}> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".arena-stage");
    const video = document.querySelector<HTMLVideoElement>(".arena-video-b");
    const rail = document.querySelector<HTMLElement>("[data-testid='arena-club-symbol-carousel'], [data-testid='arena-score-rail-empty']");
    if (!stage || !video || !rail) throw new Error("Arena stage, loop video, or carousel rail is unavailable");

    const stageRect = stage.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    return {
      stage: { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height },
      video: { width: videoRect.width, height: videoRect.height, nativeWidth: video.videoWidth, nativeHeight: video.videoHeight },
      rail: { top: rail.getBoundingClientRect().top },
      cards: [...document.querySelectorAll<HTMLElement>(".arena-field-player")].map((card) => {
        const frameRect = card.getBoundingClientRect();
        const matchPoints = card.querySelector<HTMLElement>("[data-arena-match-points='true']");
        const badgeRect = matchPoints?.getBoundingClientRect() ?? null;
        // The match-points badge is visually part of an Arena card even when
        // its compact paint extends above the card frame. Runtime proof uses
        // the union rather than silently checking only the anchor wrapper.
        const rect = {
          left: Math.min(frameRect.left, badgeRect?.left ?? frameRect.left),
          top: Math.min(frameRect.top, badgeRect?.top ?? frameRect.top),
          right: Math.max(frameRect.right, badgeRect?.right ?? frameRect.right),
          bottom: Math.max(frameRect.bottom, badgeRect?.bottom ?? frameRect.bottom),
        };
        const camera = card.dataset.camera;
        if (camera !== "wide-touchline" && camera !== "lower-stand" && camera !== "side-sweep") {
          throw new Error(`Unexpected or missing Arena camera: ${camera ?? "none"}`);
        }
        return {
          camera,
          coverage: card.dataset.containmentCoverage === "four-line-polygon"
            || card.dataset.containmentCoverage === "rail-only"
            || card.dataset.containmentCoverage === "unmeasured"
            ? card.dataset.containmentCoverage
            : null,
          rect: {
            left: rect.left - stageRect.left,
            top: rect.top - stageRect.top,
            right: rect.right - stageRect.left,
            bottom: rect.bottom - stageRect.top,
          },
        };
      }),
    };
  });
}

test.describe("Arena supported formation containment", () => {
  test("proves all supported formation/camera cases and loop wrap without writes", async ({ page }, testInfo) => {
    test.skip(!candidateUrl, "Set TOUCHLINE_ARENA_VISUAL_QA_URL to a clean candidate before runtime visual QA.");
    test.skip(testInfo.project.name !== evidenceProject, "Runs only at the measured 1440×900 Chromium evidence viewport.");

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

    for (const scenario of supportedFormationMatrix) {
      await test.step(`${scenario.formation} / ${scenario.camera}`, async () => {
        await selectFormationAndSeek(page, scenario.formation, scenario.sampleSeconds);
        await expect(page.locator(`.arena-field-player[data-camera='${scenario.camera}']`)).toHaveCount(11);

        const evidence = await readStageEvidence(page);
        expect(evidence.video.nativeWidth).toBe(sourceFrame.width);
        expect(evidence.video.nativeHeight).toBe(sourceFrame.height);
        expect(evidence.cards).toHaveLength(11);
        expect(evidence.cards.every((card) => card.camera === scenario.camera)).toBe(true);

        const calibration = ARENA_PERSPECTIVE_CALIBRATIONS[scenario.camera];
        if (hasFourLineGrassPolygon(calibration)) {
          expect(evidence.cards.every((card) => card.coverage === "four-line-polygon")).toBe(true);
          const polygon = calibration.grassPolygon.map((point) => projectSourcePointToVideoBox(point, evidence.video));
          expect(evidence.cards.every((card) => fullRectIsInsidePolygon(card.rect, polygon))).toBe(true);
        } else {
          expect(hasFourLineGrassPolygon(calibration)).toBe(false);
          expect(evidence.cards.every((card) => card.coverage === "rail-only")).toBe(true);
          const liveRailMeasurement = {
            ...calibration.railMeasurement,
            stageTop: evidence.stage.top,
            carouselTop: evidence.rail.top,
          };
          expect(evidence.cards.every((card) => cardEnvelopeClearsSideSweepRail(card.rect, liveRailMeasurement))).toBe(true);
        }
      });
    }

    await test.step("loop wrap resets to wide-touchline", async () => {
      const loopVideo = page.locator(".arena-video-b");
      await loopVideo.evaluate(async (element) => {
        const video = element as HTMLVideoElement;
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("Arena loop duration is unavailable");
        video.currentTime = Math.max(0, duration - 0.05);
        await video.play();
      });
      await expect(page.locator(".arena-field-player[data-camera='wide-touchline']")).toHaveCount(11, { timeout: 5_000 });
    });

    expect(blockedWrites).toEqual([]);
    await testInfo.attach("arena-supported-formation-matrix", {
      body: Buffer.from(JSON.stringify(supportedFormationMatrix, null, 2)),
      contentType: "application/json",
    });
  });
});
