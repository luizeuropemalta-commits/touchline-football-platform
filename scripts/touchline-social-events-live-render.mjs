import { createHash } from "node:crypto";
import { mkdir, readFile, stat, statfs, unlink, rmdir, writeFile, link } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { assessEventsLivePackage, EVENTS_LIVE_ART_IDS, EVENTS_LIVE_LOOP_MS } from "../lib/touchlineArena/social-events-live-contract.ts";
import { assessEventsLiveSeam, assertEventsLiveDecode, compareEventsLivePixels } from "../lib/touchlineArena/social-events-live-media-evidence.ts";

const run = promisify(execFile);
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const root = process.cwd();
const privateRoot = resolve(root, "artifacts/social-studio/events");
const requestedInput = arg("input");
const inputPath = requestedInput ? resolve(root, requestedInput) : join(privateRoot, "render-inputs-20260915.json");
if (!inputPath.startsWith(`${privateRoot}/`)) throw new Error("PRIVATE_RENDER_INPUT_REQUIRED");
const inputBytes = await readFile(inputPath);
const inputs = JSON.parse(inputBytes);
const selected = arg("art") ? inputs.filter(input => input.artId === arg("art")) : inputs;
if (!selected.length || selected.some(input => !EVENTS_LIVE_ART_IDS.includes(input.artId))) throw new Error("INVALID_ART_SELECTION");
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const rendererChecksum = hash(await readFile(new URL(import.meta.url)));
const encoder = resolve(root, "scripts/local/encode-png-sequence-to-mp4.swift");
const encoderChecksum = hash(await readFile(encoder));
const decoder = resolve(root, "scripts/local/probe-social-studio-video.swift");
const decoderChecksum = hash(await readFile(decoder));
const visualSourcePaths = [
  "components/touchline/social/TouchlineSocialEventsLiveReview.tsx", "components/touchline/social/TouchlineSocialEventsLiveReview.module.css",
  "components/touchline/social/TouchlineSocialEventsLiveFullTimeReview.tsx", "components/touchline/social/TouchlineSocialEventsLiveFullTimeReview.module.css",
  "components/touchline/social/TouchlineSocialEventsLiveGoalHat.tsx", "components/touchline/social/TouchlineSocialEventsLiveGoalHat.module.css",
  "components/touchline/social/TouchlineSocialGoalHatLayoutDemo.module.css", "components/touchline/social/TouchlineSocialRankingDraft.module.css",
  "components/touchline/social/TouchlineSocialFixtureScoreboard.tsx", "components/touchline/social/TouchlineSocialFixtureScoreboard.module.css",
  "components/touchline/social/TouchlineSocialApprovedExactCard.tsx", "components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx",
  "components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx", "lib/touchlineArena/social-ranking-visual-tokens.ts", "lib/touchlineArena/social-visual-tokens.ts",
  "lib/touchlineArena/social-studio-full-time-rendered-facts.ts",
];
const sourceChecksums = Object.fromEntries(await Promise.all(visualSourcePaths.map(async path => [path, hash(await readFile(resolve(root, path)))])));
const assertSourcesUnchanged = async () => {
  for (const [path, checksum] of Object.entries(sourceChecksums)) if (hash(await readFile(resolve(root, path))) !== checksum) throw new Error(`VISUAL_SOURCE_CHANGED:${path}`);
};
if (encoderChecksum !== "sha256:e823c09860eda5035d6a1fba312ff1f669a59da07bac989f889c0d2613f8a46b") throw new Error("ENCODER_SOURCE_CHANGED_REVIEW_REQUIRED");
for (const input of selected) {
  const state = assessEventsLivePackage(input, Date.now());
  if (!state.reviewable) throw new Error(`${input.artId}:${state.reason}`);
  if (input.artId === "FULL_TIME" && (!input.fullTime || input.fullTime.schema !== "touchline-studio-full-time-v1")) {
    throw new Error("FULL_TIME_RENDERED_FACTS_REQUIRED");
  }
  if (Date.parse(input.fetchedAt) > Date.now() || Date.parse(input.validUntil) <= Date.now()) throw new Error("FACTUAL_REVIEW_EXPIRED");
  for (const url of [input.home.logoUrl, input.away.logoUrl, input.playerCard.cardTemplateUrl, input.venue.interiorImageUrl]) {
    if (!url.startsWith("/touchlineArena/") || url.includes("..")) throw new Error("LOCAL_ASSET_REQUIRED");
    if (!(await stat(resolve(root, "public", decodeURIComponent(url.slice(1))))).isFile()) throw new Error("MISSING_ASSET");
  }
}
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ state: "INPUTS_CHECKED", count: selected.length, inputChecksum: hash(inputBytes), visualSourceChecksum: hash(JSON.stringify(sourceChecksums)), rendererChecksum, encoderChecksum, decoderChecksum, publishable: false }));
  process.exit(0);
}
const base = new URL(arg("base-url"));
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.protocol !== "http:") throw new Error("LOCAL_DEVELOPMENT_URL_REQUIRED");
const free = await statfs(privateRoot);
if (free.bavail * free.bsize < 2 * 1024 ** 3) throw new Error("LESS_THAN_2GB_FREE");
const requestedPlacement = arg("placement");
if (requestedPlacement && !["FEED", "STORY"].includes(requestedPlacement)) throw new Error("INVALID_PLACEMENT");
const placements = requestedPlacement ? [requestedPlacement] : ["FEED", "STORY"];
const runId = new Date().toISOString().replace(/[^0-9]/g, "");
const output = join(privateRoot, `render-${runId}`);
await mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const assertNoFrameworkErrors = async () => {
  if (errors.length || await page.locator('nextjs-portal [data-nextjs-dialog], nextjs-portal [role="dialog"], nextjs-portal [role="alert"]').count()) {
    throw new Error(`BROWSER_RUNTIME_OR_FRAMEWORK_ERROR:${errors.join(" | ")}`);
  }
};
await page.route("**/*", route => {
  const url = new URL(route.request().url());
  return url.origin === base.origin || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort();
});
const results = [];
const fps = 12, frameCount = EVENTS_LIVE_LOOP_MS / 1000 * fps;
try {
  for (const input of selected) for (const placement of placements) {
    await assertSourcesUnchanged();
    const label = `${input.artId.toLowerCase().replaceAll("_", "-")}-${placement.toLowerCase()}`;
    const dir = join(output, label);
    await mkdir(dir);
    const dimensions = { width: 1080, height: placement === "STORY" ? 1920 : 1350 };
    await page.setViewportSize(dimensions);
    const url = new URL("/visual-qa/social-events-live", base);
    url.searchParams.set("artId", input.artId); url.searchParams.set("placement", placement);
    if (requestedInput) url.searchParams.set("input", inputPath.split("/").at(-1));
    await page.goto(url.href, { waitUntil: "networkidle", timeout: 45000 });
    if (await page.locator("[data-events-live-blocked]").count()) throw new Error(await page.locator("[data-events-live-blocked]").getAttribute("data-events-live-blocked"));
    const art = page.locator(`[data-events-live-art='${input.artId}']`);
    await art.waitFor({ state: "visible" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
      for (const image of document.images) if (!image.complete || image.naturalWidth === 0) throw new Error("IMAGE_NOT_LOADED");
    });
    if (await art.getAttribute("data-source-checksum") !== hash(JSON.stringify(input))) throw new Error("RENDER_INPUT_CHANGED");
    await assertNoFrameworkErrors();
    const devChromeHosts = await page.locator("nextjs-portal").count();
    // Framework chrome is outside the artwork but can overlap its screenshot clip.
    // Screenshot-only visibility does not remove pixels, mask the art, change its
    // geometry, or alter next.config. Error overlays are checked before and after.
    const capture = async path => {
      await assertNoFrameworkErrors();
      const bytes = await art.screenshot({ path, animations: "allow", style: "nextjs-portal { visibility: hidden !important; }" });
      await assertNoFrameworkErrors();
      return bytes;
    };
    const bounds = await art.boundingBox();
    if (!bounds || bounds.width !== dimensions.width || bounds.height !== dimensions.height) throw new Error("ART_DIMENSION_DRIFT");
    if (await art.locator("button, input, select, textarea, video[controls], audio[controls]").count()) throw new Error("ART_CONTROLS_NOT_ALLOWED");
    const animationInventory = await art.evaluate(root => root.getAnimations({ subtree: true }).map(animation => {
      const timing = animation.effect.getTiming();
      return { duration: timing.duration, delay: timing.delay, iterations: timing.iterations === Infinity ? "infinite" : timing.iterations };
    }));
    if (!animationInventory.length || animationInventory.some(animation => typeof animation.duration !== "number" || animation.duration <= 0
      || EVENTS_LIVE_LOOP_MS % animation.duration !== 0 || animation.iterations !== "infinite")) throw new Error("NON_PERIODIC_ANIMATION");
    const seek = async ms => {
      await page.evaluate(async frame => {
        const root = document.querySelector("[data-events-live-ready='true']");
        for (const animation of root.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = frame; }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, ms);
    };
    const joins = {};
    const geometry = {};
    const phasePixels = {};
    for (const [name, ms] of [["start", 0], ["mid", 3000], ["end", 6000], ["second-mid", 9000], ["second-loop", 12000]]) {
      await seek(ms);
      const file = join(dir, `${name}.png`);
      joins[name] = hash(await capture(file));
      const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== dimensions.width || info.height !== dimensions.height || info.channels !== 3) throw new Error("SOURCE_PIXEL_DIMENSIONS_CHANGED");
      phasePixels[name] = data;
      geometry[name] = await art.evaluate(root => [...root.querySelectorAll("[data-touchline-social-approved-card], img, h1")].map(element => {
        const bounds = element.getBoundingClientRect();
        return { tag: element.tagName, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      }));
    }
    const comparePhases = (first, second) => compareEventsLivePixels(phasePixels[first], phasePixels[second], dimensions.width, dimensions.height);
    const pixelComparisons = { firstSeam: comparePhases("start", "end"), secondSeam: comparePhases("end", "second-loop"),
      repeatedMid: comparePhases("mid", "second-mid"), motion: comparePhases("start", "mid") };
    const seam = assessEventsLiveSeam(joins, geometry, pixelComparisons);
    const seamEvidence = { ...seam, artId: input.artId, placement, rendererChecksum, sourceChecksums,
      inputChecksum: hash(JSON.stringify(input)), joins, geometry, animationInventory, pixelComparisons,
      excludedNonArtworkChrome: { selector: "nextjs-portal", hosts: devChromeHosts, scope: "SCREENSHOT_ONLY", errorOverlayGate: "CHECKED_BEFORE_AND_AFTER_EACH_CAPTURE" },
      browserErrors: [...errors], generatedAt: new Date().toISOString(), loopSeamReviewed: false };
    await writeFile(join(dir, "seam-evidence.json"), `${JSON.stringify(seamEvidence, null, 2)}\n`, { flag: "wx" });
    if (!seam.passed) throw new Error(`LOOP_SEAM_OR_MOTION_FAILED:${Object.entries(seam.checks).filter(([, passed]) => !passed).map(([name]) => name).join(",")}`);
    await assertSourcesUnchanged();
    if (process.argv.includes("--seam-only")) {
      results.push({ artId: input.artId, placement, seamEvidence: relative(root, join(dir, "seam-evidence.json")), publishable: false });
      console.log(JSON.stringify({ state: "SEAM_CHECKED_NO_VIDEO_RENDERED", artId: input.artId, placement, output: dir }));
      continue;
    }
    const frames = join(dir, "frames"); await mkdir(frames);
    const framePaths = [];
    for (let index = 0; index < frameCount; index++) {
      await seek(index * 1000 / fps);
      const framePath = join(frames, `${String(index).padStart(4, "0")}.png`);
      await capture(framePath); framePaths.push(framePath);
    }
    const videoPath = join(dir, `${label}.mp4`);
    await run("/usr/bin/swift", [encoder, frames, videoPath, String(dimensions.width), String(dimensions.height), String(fps)], { maxBuffer: 1000000, timeout: 180000 });
    const bytes = await readFile(videoPath);
    if (bytes.length < 1024 || bytes.length > 40 * 1024 * 1024) throw new Error("VIDEO_SIZE_OUTSIDE_STUDIO_LIMIT");
    const probeDirectory = join(dir, "decode");
    await run("/usr/bin/swift", [decoder, videoPath, probeDirectory], { maxBuffer: 1000000, timeout: 180000 });
    const probe = JSON.parse(await readFile(join(probeDirectory, "probe.json"), "utf8"));
    const decodeEvidence = assertEventsLiveDecode(probe, { sha256: hash(bytes), ...dimensions, fps, seconds: 6 });
    // Retain a review-only file with two exact repetitions of the delivered cycle.
    // Hard links avoid duplicating PNG storage; only this run's created entries are cleaned.
    for (let index = 0; index < frameCount; index++) {
      const repeatPath = join(frames, `${String(index + frameCount).padStart(4, "0")}.png`);
      await link(framePaths[index], repeatPath); framePaths.push(repeatPath);
    }
    const twoLoopPath = join(dir, "two-loops-review-only.mp4");
    await run("/usr/bin/swift", [encoder, frames, twoLoopPath, String(dimensions.width), String(dimensions.height), String(fps)], { maxBuffer: 1000000, timeout: 180000 });
    const twoLoopBytes = await readFile(twoLoopPath);
    const twoLoopProbeDirectory = join(dir, "decode-two-loops");
    await run("/usr/bin/swift", [decoder, twoLoopPath, twoLoopProbeDirectory], { maxBuffer: 1000000, timeout: 180000 });
    const twoLoopProbe = JSON.parse(await readFile(join(twoLoopProbeDirectory, "probe.json"), "utf8"));
    const twoLoopEvidence = assertEventsLiveDecode(twoLoopProbe, { sha256: hash(twoLoopBytes), ...dimensions, fps, seconds: 12 });
    const snapshot = { source: input.source, competitionId: input.competitionId, seasonId: input.seasonId, asOf: input.asOf, fetchedAt: input.fetchedAt, validUntil: input.validUntil, fixtureIds: input.fixtureIds, teamIds: input.teamIds, playerIds: input.playerIds,
      factualData: input.artId === "FULL_TIME" ? { fullTime: input.fullTime } : { ...input.factualData, eventEvidence: input.evidence }, mode: input.mode, publishable: false };
    const snapshotPath = join(dir, "factual-snapshot.json");
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
    await writeFile(join(dir, "caption-en-GB.txt"), `${input.caption}\n`, { flag: "wx" });
    await writeFile(join(dir, "caption-instagram-en-GB.txt"), `${input.captions.instagram}\n`, { flag: "wx" });
    await writeFile(join(dir, "caption-facebook-en-GB.txt"), `${input.captions.facebook}\n`, { flag: "wx" });
    const destinations = input.destinations.filter(destination => destination.placement === placement);
    await writeFile(join(dir, "destinations.json"), `${JSON.stringify(destinations, null, 2)}\n`, { flag: "wx" });
    const result = { artId: input.artId, version: "events-retrospective-v2", placement, filePath: relative(root, videoPath), sha256: hash(bytes), ...dimensions,
      sourceChecksums, visualSourceChecksum: hash(JSON.stringify(sourceChecksums)), rendererChecksum,
      expectedDurationSeconds: 6, frameRate: fps, encodedInputFrames: frameCount, inputChecksum: hash(JSON.stringify(input)), encoderChecksum,
      ...decodeEvidence, decoder: "avfoundation", decoderChecksum, decodeReport: relative(root, join(probeDirectory, "probe.json")),
      loopJoinPixelChecks: joins, geometryAtLoopPhases: geometry, animationInventory, seamEvidence: relative(root, join(dir, "seam-evidence.json")),
      twoLoopReview: { ...twoLoopEvidence, filePath: relative(root, twoLoopPath), sha256: hash(twoLoopBytes), decodeReport: relative(root, join(twoLoopProbeDirectory, "probe.json")), deliveryAsset: false },
      verificationState: "DECODED_TWO_LOOPS_AVAILABLE_REQUIRES_HUMAN_REVIEW",
      caption: input.caption, captions: input.captions, destinations, provenance: { ...snapshot, snapshotPath: relative(root, snapshotPath), snapshotSha256: hash(await readFile(snapshotPath)) },
      gates: { artwork: "PENDING", caption: "PENDING", automation: "BLOCKED", outbound: "DISABLED", publishable: false } };
    results.push(result);
    await assertSourcesUnchanged();
    await writeFile(join(dir, "render-evidence.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    for (const framePath of framePaths) await unlink(framePath);
    await rmdir(frames);
    console.log(JSON.stringify({ state: "DECODED_TWO_LOOPS_REVIEW_PENDING", artId: input.artId, placement, filePath: result.filePath, durationSeconds: probe.durationSeconds, decodedFrames: probe.decodedFrames, bytes: bytes.length }));
  }
  if (errors.length) throw new Error(`BROWSER_RUNTIME_ERRORS:${errors.join(" | ")}`);
  await writeFile(join(output, "events-render-manifest.json"), `${JSON.stringify({ results, publishable: false, humanReviewRequired: true, browserErrors: errors }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ state: process.argv.includes("--seam-only") ? "SEAM_CHECKS_ONLY_NO_VIDEO" : "RENDERED_AND_DECODED_NOT_VISUALLY_APPROVED", output, videos: process.argv.includes("--seam-only") ? 0 : results.length }));
} finally { await context.close(); await browser.close(); }
