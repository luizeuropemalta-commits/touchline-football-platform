import { readFile, writeFile, mkdir, stat, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium } from "@playwright/test";
import { RANKINGS_LIVE_ART_IDS, RANKINGS_LIVE_LOOP_MS } from "../lib/social-rankings-live-contract.ts";
import { rankingsLiveCaptions, rankingsLiveDispatchProposal } from "../lib/social-rankings-live-editorial.ts";
const exec = promisify(execFile);
const arg = (name) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = new URL(arg("base-url") || "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("LOCALHOST_ONLY");
const root = path.resolve("artifacts/social-studio/rankings");
const hash = (b) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const requested = arg("art") ? [arg("art")] : RANKINGS_LIVE_ART_IDS;
if (requested.some((id) => !RANKINGS_LIVE_ART_IDS.includes(id))) throw new Error("INVALID_ART");
const placements = arg("placement") ? [arg("placement")] : ["FEED", "STORY"];
if (placements.some((p) => !["FEED", "STORY"].includes(p))) throw new Error("INVALID_PLACEMENT");
await mkdir(root, { recursive: true });
const inputPath = path.join(root, "render-input-20260914.json");
if (process.argv.includes("--prepare-input")) {
  const response = await fetch(new URL("/visual-qa/social-rankings-live/input", base));
  if (!response.ok) throw new Error(`INPUT_PREPARATION_FAILED:${response.status}`);
  const value = await response.json();
  if (value.publicCardsRevalidated !== true) throw new Error("PUBLIC_CARD_REVALIDATION_FAILED");
  await writeFile(inputPath, JSON.stringify(value, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ prepared: inputPath, overall: value.data.overall.name, seasonPlayers: value.data.seasonRanking.snapshot.players.length }) + "\n");
  if (process.argv.includes("--prepare-only")) process.exit(0);
}
const inputBytes = await readFile(inputPath), input = JSON.parse(inputBytes);
const FPS = 12, count = RANKINGS_LIVE_LOOP_MS / 1000 * FPS;
if (!input.goldenBootEvidenceSha256 || !input.data.weeklySelection?.complete) throw new Error("INPUT_REPREPARATION_REQUIRED");
const browser = await chromium.launch({ headless: true });
try {
  for (const artId of requested) for (const placement of placements) {
    if (artId === "GOLDEN_BOOT" && input.data.goldenBoot.state !== "FACTUAL_REVIEW") throw new Error("GOLDEN_BOOT_RECONCILIATION_REQUIRED");
    const width = 1080, height = placement === "STORY" ? 1920 : 1350;
    const stem = `${artId.toLowerCase().replaceAll("_", "-")}-${placement.toLowerCase()}`;
    const out = path.join(root, `${stem}.mp4`);
    if (await stat(out).then(() => true, () => false)) throw new Error(`OUTPUT_ALREADY_EXISTS:${out}`);
    const framesDir = path.join(root, `${stem}-frames`);
    await mkdir(framesDir, { recursive: true });
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const url = new URL("/visual-qa/social-rankings-live", base);
    url.searchParams.set("artId", artId); url.searchParams.set("placement", placement);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    const art = page.locator("[data-rankings-live-review='non-publishable']");
    await art.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-rankings-live-review]");
      return root && [...root.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0);
    }, undefined, { timeout: 45000 });
    await page.evaluate(async () => { await document.fonts.ready; for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; } });
    const geometry = await art.boundingBox();
    if (!geometry || geometry.width !== width || geometry.height !== height) throw new Error("CANVAS_DIMENSION_MISMATCH");
    async function frame(ms) {
      await page.evaluate(({ ms, loop }) => {
        const root = document.querySelector("[data-rankings-live-review]");
        const phase = ((ms % loop) + loop) % loop / loop;
        root.style.setProperty("--live-glow", String(.16 + Math.sin(phase * Math.PI * 2) * .045));
        root.style.setProperty("--live-float", `${Math.sin(phase * Math.PI * 2) * 4}px`);
        root.querySelector("svg rect[pathLength]").setAttribute("stroke-dashoffset", String(-100 * phase));
      }, { ms, loop: RANKINGS_LIVE_LOOP_MS });
      return art.screenshot({ animations: "allow" });
    }
    const first = await frame(0), middle = await frame(1500), seam = await frame(6000), secondSeam = await frame(12000);
    if (hash(first) !== hash(seam) || hash(first) !== hash(secondSeam) || hash(first) === hash(middle)) throw new Error("LOOP_OR_MOTION_INVALID");
    await writeFile(path.join(root, `${stem}-start.png`), first);
    await writeFile(path.join(root, `${stem}-quarter.png`), middle);
    const frameFiles = [];
    for (let i = 0; i < count; i++) {
      const file = path.join(framesDir, `frame-${String(i).padStart(4, "0")}.png`);
      await writeFile(file, await frame(i * 1000 / FPS)); frameFiles.push(file);
    }
    if (pageErrors.length) throw new Error(`PAGE_RUNTIME_ERROR:${pageErrors.join(";")}`);
    await context.close();
    await exec("/usr/bin/swift", [path.resolve("scripts/local/encode-png-sequence-to-mp4.swift"), framesDir, out, String(width), String(height), String(FPS)], { maxBuffer: 1_000_000 });
    const bytes = await readFile(out);
    if (bytes.length < 1024) throw new Error("EMPTY_VIDEO");
    const report = { outcome: "ENCODED_REQUIRES_DECODE_AND_HUMAN_REVIEW", codecRequested: "H264", encoder: "AVFoundation", width, height, fps: FPS, frameCount: count, durationSeconds: count / FPS, animatedFrameHashes: [hash(first), hash(middle)], loopJoinHashes: [hash(first), hash(seam), hash(secondSeam)], pageErrors, humanInspected: false, observedVideoLoops: 0, publishable: false, gates: input.data.gates };
    const reportPath = path.join(root, `${stem}-verification.json`);
    const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
    await writeFile(reportPath, reportBytes);
    const validUntil = new Date(Date.parse(input.data.provenance.fetchedAt) + 24 * 3600000).toISOString();
    const captions = rankingsLiveCaptions(input.data, artId, placement);
    const manifest = { artId, version: `rankings-live-review-${input.data.provenance.revision.slice(0, 12)}`, placement, filePath: path.relative(process.cwd(), out), sha256: hash(bytes), width, height, durationSeconds: count / FPS, caption: captions.INSTAGRAM, captions, verification: { reportPath: path.relative(process.cwd(), reportPath), reportSha256: hash(reportBytes) }, provenance: { source: input.data.provenance.source, fetchedAt: input.data.provenance.fetchedAt, asOf: input.data.provenance.asOf, validUntil, competitionId: input.data.provenance.competitionId, seasonId: input.data.provenance.seasonId, fixtureIds: input.data.provenance.fixtureIds, teamIds: input.data.table.rows.map((r) => r.team.providerTeamId), playerIds: Object.keys(input.cards), snapshotPath: path.relative(process.cwd(), inputPath), snapshotSha256: hash(inputBytes) } };
    await writeFile(path.join(root, `${stem}-manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(path.join(root, `${stem}-dispatch-proposal.json`), JSON.stringify(rankingsLiveDispatchProposal(input.data, artId), null, 2) + "\n");
    // Only this job's intermediate frames are removed; two composition samples remain.
    for (const file of frameFiles) await unlink(file);
    process.stdout.write(JSON.stringify({ artId, placement, filePath: manifest.filePath, verification: report.outcome, bytes: bytes.length }) + "\n");
  }
} finally { await browser.close(); }
