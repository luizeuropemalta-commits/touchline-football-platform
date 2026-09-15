import { createHash } from "node:crypto";
import { link, mkdir, readFile, statfs, unlink, rmdir, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { assessSocialLineupLiveReference, SOCIAL_LINEUP_LIVE_LOOP_MS } from "../lib/touchlineArena/social-lineup-live-contract.ts";
import { checksumTouchlineCanonicalJson } from "../lib/touchlineArena/social-lineup-render-source.ts";
import { socialLineupLiveEditorial } from "../lib/touchlineArena/social-lineup-live-editorial.ts";
import { validateStudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { assertEventsLiveDecode } from "../lib/touchlineArena/social-events-live-media-evidence.ts";

const run = promisify(execFile);
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const root = process.cwd(), privateRoot = resolve(root, "artifacts/social-studio/lineup");
const reference = JSON.parse(await readFile(join(privateRoot, "render-reference-20260914.json"), "utf8"));
const gate = assessSocialLineupLiveReference(reference, Date.now());
if (!gate.reviewable) throw new Error(gate.reason);
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const encoder = resolve(root, "scripts/local/encode-png-sequence-to-mp4.swift");
const encoderChecksum = hash(await readFile(encoder));
const decoder = resolve(root, "scripts/local/probe-social-studio-video.swift");
const decoderChecksum = hash(await readFile(decoder));
if (encoderChecksum !== "sha256:e823c09860eda5035d6a1fba312ff1f669a59da07bac989f889c0d2613f8a46b") throw new Error("ENCODER_REVIEW_REQUIRED");
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ state: "REFERENCE_CHECKED_RUNTIME_READER_PENDING", fixtureId: reference.fixtureId, members: reference.members.length,
    gate, referenceChecksum: checksumTouchlineCanonicalJson(reference), encoderChecksum, publishable: false }));
  process.exit(0);
}
const base = new URL(arg("base-url"));
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.protocol !== "http:") throw new Error("LOCAL_DEVELOPMENT_URL_REQUIRED");
const placement = arg("placement");
if (placement && !["FEED", "STORY"].includes(placement)) throw new Error("INVALID_PLACEMENT");
const free = await statfs(privateRoot);
if (free.bavail * free.bsize < 2 * 1024 ** 3) throw new Error("LESS_THAN_2GB_FREE");
const output = join(privateRoot, `render-${new Date().toISOString().replace(/[^0-9]/g, "")}`);
await mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: "no-preference" });
const page = await context.newPage(), errors = [], results = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await page.route("**/*", route => {
  const url = new URL(route.request().url());
  return url.origin === base.origin || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort();
});
const fps = 12, frameCount = SOCIAL_LINEUP_LIVE_LOOP_MS / 1000 * fps;
try {
  for (const target of placement ? [placement] : ["FEED", "STORY"]) {
    const dir = join(output, `lineup-${target.toLowerCase()}`); await mkdir(dir);
    const dimensions = { width: 1080, height: target === "STORY" ? 1920 : 1350 };
    await page.setViewportSize(dimensions);
    const url = new URL("/visual-qa/social-lineup-live", base); url.searchParams.set("placement", target);
    await page.goto(url.href, { waitUntil: "networkidle", timeout: 60000 });
    const blocked = page.locator("[data-lineup-live-blocked]");
    if (await blocked.count()) throw new Error(await blocked.getAttribute("data-lineup-live-blocked"));
    const art = page.locator("[data-lineup-live-ready='true']"); await art.waitFor({ state: "visible" });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    const snapshot = JSON.parse(await page.locator("#social-lineup-live-provenance").textContent());
    const editorial = socialLineupLiveEditorial(reference, snapshot.draft);
    if (snapshot.provenance.referenceChecksum !== checksumTouchlineCanonicalJson(reference)
      || await art.getAttribute("data-source-checksum") !== checksumTouchlineCanonicalJson(snapshot)) throw new Error("SOURCE_CHANGED");
    const box = await art.boundingBox();
    if (!box || box.width !== dimensions.width || box.height !== dimensions.height) throw new Error("CANVAS_SIZE_MISMATCH");
    const seek = async ms => page.evaluate(async frame => {
      const root = document.querySelector("[data-lineup-live-ready='true']");
      for (const animation of root.getAnimations({ subtree: true })) {
        animation.pause();
        // The existing cards are preserved at their initial state. Only the new
        // continuous boundary runner owns the six-second media timeline.
        animation.currentTime = animation.effect?.target?.matches?.("[data-lineup-loop]") ? frame : 0;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, ms);
    const seams = {};
    for (const [name, ms] of [["start", 0], ["mid", 3000], ["end", 6000], ["second-loop", 12000]]) {
      await seek(ms); seams[name] = hash(await art.screenshot({ path: join(dir, `${name}.png`), animations: "allow" }));
    }
    if (seams.start !== seams.end || seams.end !== seams["second-loop"] || seams.start === seams.mid) throw new Error("LOOP_SEAM_OR_MOTION_FAILED");
    const frames = join(dir, "frames"); await mkdir(frames); const paths = [];
    for (let index = 0; index < frameCount; index++) {
      await seek(index * 1000 / fps); const path = join(frames, `${String(index).padStart(4, "0")}.png`);
      await art.screenshot({ path, animations: "allow" }); paths.push(path);
    }
    const video = join(dir, `lineup-${target.toLowerCase()}.mp4`);
    await run("/usr/bin/swift", [encoder, frames, video, String(dimensions.width), String(dimensions.height), String(fps)], { timeout: 180000, maxBuffer: 1000000 });
    const bytes = await readFile(video);
    if (bytes.length < 1024 || bytes.length > 40 * 1024 * 1024) throw new Error("VIDEO_SIZE_OUTSIDE_STUDIO_LIMIT");
    const decodeDirectory = join(dir, "decode");
    await run("/usr/bin/swift", [decoder, video, decodeDirectory], { timeout: 180000, maxBuffer: 1000000 });
    const probe = JSON.parse(await readFile(join(decodeDirectory, "probe.json"), "utf8"));
    const decodeEvidence = assertEventsLiveDecode(probe, { sha256: hash(bytes), ...dimensions, fps, seconds: 6 });
    for (let index = 0; index < frameCount; index++) {
      const repeatedFrame = join(frames, `${String(index + frameCount).padStart(4, "0")}.png`);
      await link(paths[index], repeatedFrame); paths.push(repeatedFrame);
    }
    const twoLoopVideo = join(dir, "two-loops-review-only.mp4");
    await run("/usr/bin/swift", [encoder, frames, twoLoopVideo, String(dimensions.width), String(dimensions.height), String(fps)], { timeout: 180000, maxBuffer: 1000000 });
    const twoLoopBytes = await readFile(twoLoopVideo);
    const twoLoopDecodeDirectory = join(dir, "decode-two-loops");
    await run("/usr/bin/swift", [decoder, twoLoopVideo, twoLoopDecodeDirectory], { timeout: 180000, maxBuffer: 1000000 });
    const twoLoopProbe = JSON.parse(await readFile(join(twoLoopDecodeDirectory, "probe.json"), "utf8"));
    const twoLoopEvidence = assertEventsLiveDecode(twoLoopProbe, { sha256: hash(twoLoopBytes), ...dimensions, fps, seconds: 12 });
    const snapshotPath = join(dir, "factual-snapshot.json"), snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
    await writeFile(snapshotPath, snapshotBytes, { flag: "wx" });
    await writeFile(join(dir, "caption-en-GB.txt"), `${reference.caption}\n`, { flag: "wx" });
    await writeFile(join(dir, "captions-pt-BR.json"), `${JSON.stringify(editorial.captions, null, 2)}\n`, { flag: "wx" });
    await writeFile(join(dir, "caption-instagram-pt-BR.txt"), `${editorial.captions.INSTAGRAM}\n`, { flag: "wx" });
    await writeFile(join(dir, "caption-facebook-pt-BR.txt"), `${editorial.captions.FACEBOOK}\n`, { flag: "wx" });
    await writeFile(join(dir, "dispatch-proposal.json"), `${JSON.stringify(editorial.dispatch, null, 2)}\n`, { flag: "wx" });
    const result = { artId: "LINEUP", version: reference.version, placement: target, filePath: relative(root, video), sha256: hash(bytes), ...dimensions,
      fixtureIds: [reference.fixtureId], teamIds: [reference.teamId], playerIds: reference.members.map(m => m.providerPlayerId),
      expectedDurationSeconds: 6, frameRate: fps, encodedInputFrames: frameCount, encoderChecksum,
      sourceChecksum: checksumTouchlineCanonicalJson(snapshot), provenancePath: relative(root, join(dir, "factual-snapshot.json")),
      loopJoinPixelChecks: seams, ...decodeEvidence, decoder: "avfoundation", decoderChecksum,
      decodeReport: relative(root, join(decodeDirectory, "probe.json")),
      twoLoopReview: { ...twoLoopEvidence, filePath: relative(root, twoLoopVideo), sha256: hash(twoLoopBytes),
        decodeReport: relative(root, join(twoLoopDecodeDirectory, "probe.json")), deliveryAsset: false },
      verificationState: "DECODED_TWO_LOOPS_AVAILABLE_REQUIRES_HUMAN_REVIEW",
      caption: editorial.captions.INSTAGRAM, captions: editorial.captions, approval: reference.approval, formationReview: reference.formationReview, publishable: false };
    results.push(result);
    const reportPath = join(dir, "render-evidence.json"), reportBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
    await writeFile(reportPath, reportBytes, { flag: "wx" });
    const mediaSha = result.sha256.slice("sha256:".length);
    const media = validateStudioMedia({ artId: "LINEUP", version: reference.version, placement: target,
      filePath: result.filePath, sha256: result.sha256, ...dimensions, durationSeconds: frameCount / fps,
      objectKey: `v1/LINEUP/${target}/${mediaSha}.mp4`, byteSize: bytes.length, etag: `local-sha256-${mediaSha}`,
      caption: editorial.captions.INSTAGRAM, captions: editorial.captions,
      verification: { reportPath: relative(root, reportPath), reportSha256: hash(reportBytes) },
      provenance: { source: "RETROSPECTIVE_PROVIDER_LINEUP_REVALIDATED", fetchedAt: snapshot.provenance.fetchedAt,
        asOf: new Date(reference.sourceSyncedAt).toISOString(), validUntil: reference.validUntil,
        competitionId: reference.competitionId, seasonId: reference.seasonId,
        fixtureIds: [reference.fixtureId], teamIds: [reference.teamId], playerIds: reference.members.map(member => member.canonicalPlayerId),
        snapshotPath: relative(root, snapshotPath), snapshotSha256: hash(snapshotBytes) } });
    await writeFile(join(dir, "studio-manifest.json"), `${JSON.stringify(media, null, 2)}\n`, { flag: "wx" });
    for (const path of paths) await unlink(path); await rmdir(frames);
    console.log(JSON.stringify({ state: "DECODED_TWO_LOOPS_REVIEW_PENDING", placement: target, filePath: result.filePath,
      durationSeconds: probe.durationSeconds, decodedFrames: probe.decodedFrames, bytes: bytes.length }));
  }
  if (errors.length) throw new Error(`BROWSER_ERRORS:${errors.join(" | ")}`);
  await writeFile(join(output, "lineup-render-manifest.json"), `${JSON.stringify({ results, publishable: false, humanReviewRequired: true }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ state: "RENDERED_AND_DECODED_NOT_VISUALLY_APPROVED", output, videos: results.length }));
} finally { await context.close(); await browser.close(); }
