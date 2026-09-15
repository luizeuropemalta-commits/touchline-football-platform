import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { chromium, type Locator, type Page } from "@playwright/test";
import { matchPreviewLivePlatformCaptions } from "../../lib/touchlineArena/social-match-preview-live-caption.ts";
import { validateStudioMedia } from "../../lib/touchlineArena/social-studio-contract.ts";

const execFileAsync = promisify(execFile);
const LOOP_MS = 6_000;
const FRAMES_PER_SECOND = 12;
// A Studio reviewer needs to see the artwork survive a real loop boundary,
// not only an isolated six-second animation cycle. The generated review
// files therefore contain exactly two complete cycles (12 seconds total).
const REVIEW_LOOP_COUNT = 2;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function sha256(bytes: Uint8Array) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function localBaseUrl(value: string) {
  const url = new URL(value);
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("TL_MATCH_PREVIEW_LIVE_VIDEO_LOCALHOST_REQUIRED");
  }
  return url;
}

const base = localBaseUrl(argument("base-url"));
const outputArgument = argument("output");
if (!outputArgument) throw new Error("TL_MATCH_PREVIEW_LIVE_VIDEO_OUTPUT_REQUIRED");
const output = path.resolve(outputArgument);
const outputRoot = path.resolve("artifacts/social-studio/match-preview");
if (!output.startsWith(`${outputRoot}${path.sep}`)) throw new Error("TL_MATCH_PREVIEW_LIVE_VIDEO_OUTPUT_PATH_INVALID");

async function encodePngSequenceToMp4(sourceDirectory: string, destination: string, dimensions: { width: number; height: number }) {
  const encoder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "encode-png-sequence-to-mp4.swift");
  await execFileAsync("/usr/bin/swift", [encoder, sourceDirectory, destination,
    String(dimensions.width), String(dimensions.height), String(FRAMES_PER_SECOND)], { maxBuffer: 1_000_000 });
  const size = (await stat(destination)).size;
  if (size < 1_024) throw new Error("TL_MATCH_PREVIEW_LIVE_VIDEO_MP4_EMPTY");
}

async function assertFreshOutputDirectory() {
  try {
    await stat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await mkdir(output, { recursive: true });
      return;
    }
    throw error;
  }
  throw new Error("TL_MATCH_PREVIEW_LIVE_VIDEO_OUTPUT_EXISTS");
}

type Presentation = "feed" | "story";

function renderUrl(presentation: Presentation, extra: Record<string, string>) {
  const url = new URL("/visual-qa/social-match-preview-live", base);
  url.searchParams.set("design", "1");
  url.searchParams.set("source", "replay");
  url.searchParams.set("presentation", presentation);
  Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function waitForArt(page: Page) {
  const art = page.locator("[data-match-preview-live-preview='non-publishable']");
  await art.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-match-preview-live-preview='non-publishable']");
    const images = root ? [...root.querySelectorAll<HTMLImageElement>("img")] : [];
    return Boolean(root) && images.length >= 4 && images.every((image) => image.complete && image.naturalWidth > 0);
  }, undefined, { timeout: 30_000 });
  return art;
}

async function setDeterministicFrame(art: Locator, frameMs: number) {
  await art.evaluate((node, value) => {
    const root = node as HTMLElement;
    root.style.setProperty("--match-preview-motion-delay", `-${value}ms`);
    root.dataset.motionFrameMs = String(value);
    void root.getBoundingClientRect();
  }, frameMs % LOOP_MS);
  await art.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function readExactMetadata(art: Locator) {
  return art.evaluate((node) => {
    const root = node as HTMLElement;
    const social = root.querySelector<HTMLElement>("[data-social-art='touchline-match-preview']");
    if (!social) throw new Error("MATCH_PREVIEW_SOCIAL_ART_MISSING");
    const factualRoot = root.closest<HTMLElement>("[data-match-preview-live-video-qa='non-publishable']");
    if (!factualRoot) throw new Error("MATCH_PREVIEW_FACTUAL_ROOT_MISSING");
    return {
      fixtureId: factualRoot.dataset.fixtureId,
      fixtureUpdatedAt: factualRoot.dataset.fixtureUpdatedAt,
      replayAsOf: factualRoot.dataset.replayAsOf,
      replayRevision: factualRoot.dataset.replayRevision,
      dispatch: factualRoot.dataset.dispatch,
      presentation: root.dataset.presentation,
      caption: factualRoot.dataset.caption,
      sourceVersion: social.dataset.sourceVersion,
      sourceChecksum: social.dataset.sourceChecksum,
      sourceRevisionChecksum: social.dataset.sourceRevisionChecksum,
      sourceSnapshotAt: social.dataset.sourceSnapshotAt,
      startsAt: factualRoot.dataset.startsAt,
      homeTeam: factualRoot.dataset.homeTeamKey,
      awayTeam: factualRoot.dataset.awayTeamKey,
    };
  });
}

function validMp4Container(bytes: Uint8Array) {
  return bytes.byteLength >= 32
    && Buffer.from(bytes).subarray(4, 8).toString("ascii") === "ftyp"
    && Buffer.from(bytes).includes(Buffer.from("moov"))
    && Buffer.from(bytes).includes(Buffer.from("mdat"));
}

async function probeEncodedVideo(mp4Path: string, outputDirectory: string) {
  const probe = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "probe-social-studio-video.swift");
  await execFileAsync("/usr/bin/swift", [probe, mp4Path, outputDirectory], { maxBuffer: 1_000_000 });
  const reportPath = path.join(outputDirectory, "probe.json");
  const bytes = await readFile(reportPath);
  const report = JSON.parse(bytes.toString("utf8")) as {
    artifactSha256?: string; codec?: string; width?: number; height?: number; durationSeconds?: number;
    decodedFrames?: number; distinctFrames?: number; decoderCompleted?: boolean;
  };
  return { reportPath, reportBytes: bytes, report };
}

async function render() {
  await assertFreshOutputDirectory();
  const browser = await chromium.launch({ headless: true });
  const manifest: Record<string, unknown> = {
    artifact: "TouchLine Match Preview Block 1 local video review",
    publishable: false,
    outbound: "disabled",
    generatedAt: new Date().toISOString(),
    loopMs: LOOP_MS,
    presentations: {},
  };
  try {
    for (const presentation of ["feed", "story"] as const) {
      const dimensions = presentation === "feed" ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 };
      const screenshots: Record<string, string> = {};
      const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor: 1 });
      const page = await context.newPage();
      try {
        await page.goto(renderUrl(presentation, { frameMs: "0" }), { waitUntil: "domcontentloaded", timeout: 45_000 });
        const art = await waitForArt(page);
        const metadata = await readExactMetadata(art);
        const approvalSource = JSON.parse(await page.locator("#match-preview-live-provenance").textContent() ?? "null");
        if (metadata.presentation !== presentation || metadata.dispatch !== "BLOCKED_REMOTE_RANKING_SNAPSHOT_STALE"
          || !metadata.caption || !metadata.fixtureId || !metadata.replayRevision
          || approvalSource?.provenance?.replayRevision !== metadata.replayRevision
          || approvalSource?.draft?.caption !== metadata.caption) {
          throw new Error(`TL_MATCH_PREVIEW_LIVE_METADATA_INVALID:${presentation}`);
        }
        for (const [name, frameMs] of [["start", 0], ["mid", LOOP_MS / 2], ["end", LOOP_MS], ["secondJoin", LOOP_MS * 2]] as const) {
          await setDeterministicFrame(art, frameMs);
          const imagePath = path.join(output, `${presentation}-loop-${name}.png`);
          await art.screenshot({ path: imagePath });
          screenshots[name] = sha256(await readFile(imagePath));
        }
        // The approved card assets keep their own browser rasterisation path,
        // so pixel-identical screenshots are not a trustworthy seam oracle.
        // The encoder repeats the same deterministic frame schedule below;
        // the join frames are retained as review evidence and the independent
        // decoder plus a human two-loop review remain mandatory.
        if (screenshots.start === screenshots.mid) {
          throw new Error(`TL_MATCH_PREVIEW_LIVE_MOTION_NOT_VISIBLE:${presentation}`);
        }

        const frameDirectory = path.join(output, `${presentation}-frames`);
        await mkdir(frameDirectory, { recursive: true });
        const framesPerLoop = LOOP_MS / 1_000 * FRAMES_PER_SECOND;
        const frameCount = framesPerLoop * REVIEW_LOOP_COUNT;
        for (let index = 0; index < frameCount; index += 1) {
          const frameMs = Math.round((index % framesPerLoop) * 1_000 / FRAMES_PER_SECOND);
          await setDeterministicFrame(art, frameMs);
          await art.screenshot({ path: path.join(frameDirectory, `frame-${String(index).padStart(4, "0")}.png`) });
        }
        const mp4Path = path.join(output, `match-preview-${presentation}-local-review.mp4`);
        await encodePngSequenceToMp4(frameDirectory, mp4Path, dimensions);
        const mp4 = await readFile(mp4Path);
        if (!validMp4Container(mp4)) throw new Error(`TL_MATCH_PREVIEW_LIVE_VIDEO_MP4_INVALID:${presentation}`);
        const probeDirectory = path.join(output, `${presentation}-mp4-probe`);
        const probe = await probeEncodedVideo(mp4Path, probeDirectory);
        const expectedDurationSeconds = LOOP_MS / 1000 * REVIEW_LOOP_COUNT;
        if (probe.report.artifactSha256 !== sha256(mp4)
          || probe.report.codec !== "h264"
          || probe.report.width !== dimensions.width
          || probe.report.height !== dimensions.height
          || !probe.report.decoderCompleted
          || !Number.isFinite(probe.report.durationSeconds)
          || Math.abs(probe.report.durationSeconds - expectedDurationSeconds) > 0.2
          || !Number.isInteger(probe.report.decodedFrames)
          || (probe.report.decodedFrames ?? 0) < frameCount
          || (probe.report.distinctFrames ?? 0) < 2) {
          throw new Error(`TL_MATCH_PREVIEW_LIVE_VIDEO_PROBE_INVALID:${presentation}`);
        }
        const snapshotPath = path.join(output, `${presentation}-factual-snapshot.json`);
        const snapshotBytes = Buffer.from(`${JSON.stringify(approvalSource, null, 2)}\n`);
        await writeFile(snapshotPath, snapshotBytes, { flag: "wx" });
        const reportPath = path.join(output, `${presentation}-verification.json`);
        const report = { outcome: "ENCODED_AND_DECODED_REQUIRES_HUMAN_REVIEW", codecRequested: "H264", encoder: "AVFoundation", ...dimensions,
          fps: FRAMES_PER_SECOND, framesPerLoop, frameCount, durationSeconds: expectedDurationSeconds,
          loopCount: REVIEW_LOOP_COUNT, loopJoinFrames: { startMs: 0, endMs: LOOP_MS, secondJoinMs: LOOP_MS * 2 },
          loopJoinHashes: screenshots, humanInspected: false, observedVideoLoops: REVIEW_LOOP_COUNT,
          probe: { reportPath: path.relative(process.cwd(), probe.reportPath), reportSha256: sha256(probe.reportBytes), decoder: probe.report.codec,
            decodedFrames: probe.report.decodedFrames, durationSeconds: probe.report.durationSeconds },
          publishable: false, dispatch: metadata.dispatch };
        const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
        await writeFile(reportPath, reportBytes, { flag: "wx" });
        const captions = matchPreviewLivePlatformCaptions(metadata.caption);
        const mp4Checksum = sha256(mp4);
        // This is an evidence-shaped local manifest only. It does not upload
        // the file or claim an object exists in the Studio review bucket.
        const objectKey = `v1/MATCH_PREVIEW/${presentation === "feed" ? "FEED" : "STORY"}/${mp4Checksum.slice("sha256:".length)}.mp4`;
        const media = validateStudioMedia({ artId: "MATCH_PREVIEW", version: `match-preview-live-${metadata.replayRevision.slice(7, 19)}`,
          placement: presentation === "feed" ? "FEED" : "STORY", filePath: path.relative(process.cwd(), mp4Path), sha256: mp4Checksum,
          objectKey, byteSize: mp4.byteLength, etag: `local-${mp4Checksum.slice("sha256:".length)}`, ...dimensions,
          durationSeconds: expectedDurationSeconds, caption: captions.INSTAGRAM, captions,
          verification: { reportPath: path.relative(process.cwd(), reportPath), reportSha256: sha256(reportBytes) },
          provenance: { source: "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED", fetchedAt: approvalSource.provenance.fetchedAt, asOf: approvalSource.provenance.replayAsOf,
            validUntil: new Date(Date.parse(approvalSource.provenance.fetchedAt) + 86400000).toISOString(),
            competitionId: approvalSource.provenance.competitionId, seasonId: approvalSource.provenance.seasonId,
            fixtureIds: [metadata.fixtureId], teamIds: [approvalSource.draft.home.teamId, approvalSource.draft.away.teamId],
            playerIds: [approvalSource.draft.home.leader.card.canonicalPlayerId, approvalSource.draft.away.leader.card.canonicalPlayerId],
            snapshotPath: path.relative(process.cwd(), snapshotPath), snapshotSha256: sha256(snapshotBytes) } });
        await writeFile(path.join(output, `${presentation}-studio-manifest.json`), `${JSON.stringify(media, null, 2)}\n`, { flag: "wx" });
        await rm(frameDirectory, { recursive: true, force: false });
        manifest.presentations = {
          ...(manifest.presentations as Record<string, unknown>),
          [presentation]: {
            dimensions,
            source: presentation === "feed"
              ? "frozen 041 Feed snapshot with verified local replay facts and local motion wrapper"
              : "separate Story candidate; full Feed composition preserved without crop",
            approval: presentation === "feed"
              ? "approval replay only; remote ranking snapshot remains stale and outbound is blocked"
              : "not approved; does not inherit Feed approval",
            facts: metadata,
            captions,
            loopJoinHashes: screenshots,
            mp4: path.basename(mp4Path),
            mp4Checksum,
            localObjectKeyEvidence: objectKey,
            mp4Bytes: mp4.byteLength,
            frameRate: FRAMES_PER_SECOND,
            framesPerLoop,
            frameCount,
            loopCount: REVIEW_LOOP_COUNT,
            temporaryPngFrames: "deleted after local MP4 container validation",
            videoProbe: {
              reportPath: path.relative(process.cwd(), probe.reportPath),
              reportSha256: sha256(probe.reportBytes),
              decoder: probe.report.codec,
              decodedFrames: probe.report.decodedFrames,
              durationSeconds: probe.report.durationSeconds,
              state: "DECODED_REQUIRES_HUMAN_TWO_LOOP_REVIEW",
            },
          },
        };
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outcome: "local-video-ready", output, manifest: path.join(output, "manifest.json") })}\n`);
}

await render();
