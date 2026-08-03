import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

function listFiles(root: string, extension: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(filePath, extension);
    return entry.isFile() && filePath.endsWith(extension) ? [filePath] : [];
  });
}

test("delivers all official player frames through lightweight WebP variants", async () => {
  const zoomRoot = "public/touchlineArena/cards/templates/zoom/clubs";
  const compactRoot = "public/touchlineArena/cards/templates/live-compact/clubs";
  const zoomFrames = listFiles(zoomRoot, ".webp").filter((file) => file.includes(`${path.sep}market-tiers${path.sep}`));
  const compactFrames = listFiles(compactRoot, ".webp").filter((file) => file.includes(`${path.sep}market-tiers${path.sep}`));

  assert.equal(zoomFrames.length, 140);
  assert.equal(compactFrames.length, 140);
  assert.equal(
    listFiles("public/touchlineArena/cards/templates/live-compact", ".png").length,
    0,
    "generated compact PNG fallbacks must stay out of the runtime delivery tree",
  );

  for (const file of zoomFrames) {
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 430, file);
    assert.equal(metadata.height, 691, file);
    assert.equal(metadata.hasAlpha, true, file);
    assert.ok(fs.statSync(file).size < 100_000, `${file} exceeds the 100 KB zoom budget`);
  }

  for (const file of compactFrames) {
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 119, file);
    assert.equal(metadata.height, 192, file);
    assert.equal(metadata.hasAlpha, true, file);
    assert.ok(fs.statSync(file).size < 16_000, `${file} exceeds the 16 KB Live budget`);
  }
});

test("ships official foreground frame overlays for compact cards and zoom", async () => {
  const compactRoot = "public/touchlineArena/frames/live-compact";
  const zoomRoot = "public/touchlineArena/frames/zoom";
  const compactFrames = listFiles(compactRoot, ".webp");
  const zoomFrames = listFiles(zoomRoot, ".webp");

  assert.equal(compactFrames.length, 7);
  assert.equal(zoomFrames.length, 7);

  for (const file of compactFrames) {
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 215, file);
    assert.equal(metadata.height, 346, file);
    assert.equal(metadata.hasAlpha, true, file);
    assert.ok(fs.statSync(file).size < 30_000, `${file} exceeds the 30 KB compact overlay budget`);
  }

  for (const file of zoomFrames) {
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 430, file);
    assert.equal(metadata.height, 691, file);
    assert.equal(metadata.hasAlpha, true, file);
    assert.ok(fs.statSync(file).size < 100_000, `${file} exceeds the 100 KB zoom overlay budget`);
  }
});

test("keeps coach source PNGs offline and ships compact and zoom WebP variants", async () => {
  const sourceRoot = "public/touchlineArena/cards/coaches";
  const compactRoot = "public/touchlineArena/cards/templates/live-compact/coaches";
  const zoomRoot = "public/touchlineArena/cards/templates/zoom/coaches";
  const canonicalNames = [
    "01_blue_coach",
    "02_red_coach",
    "03_green_coach",
    "04_purple_coach",
    "05_silver_coach",
    "06_gold_coach",
    "07_golddiamond_coach",
  ];

  for (const name of canonicalNames) {
    const source = path.join(sourceRoot, `${name}.png`);
    const compact = path.join(compactRoot, `${name}.webp`);
    const zoom = path.join(zoomRoot, `${name}.webp`);
    assert.ok(fs.statSync(source).size > 1_000_000, `${source} should remain source-only`);
    assert.ok(fs.statSync(compact).size < 30_000, `${compact} exceeds the 30 KB Live budget`);
    assert.ok(fs.statSync(zoom).size < 200_000, `${zoom} exceeds the 200 KB zoom budget`);
    const compactMetadata = await sharp(compact).metadata();
    const zoomMetadata = await sharp(zoom).metadata();
    assert.equal(compactMetadata.width, 240, `${compact} must use the official compact coach canvas`);
    assert.equal(compactMetadata.height, 320, `${compact} must use the official compact coach canvas`);
    assert.equal(zoomMetadata.width, 810, `${zoom} must use the official coach zoom canvas`);
    assert.equal(zoomMetadata.height, 1080, `${zoom} must use the official coach zoom canvas`);
    assert.equal(compactMetadata.hasAlpha, true, compact);
    assert.equal(zoomMetadata.hasAlpha, true, zoom);
  }

  const component = fs.readFileSync("components/touchline/cards/TouchlineCoachCard.tsx", "utf8");
  assert.match(component, /data-card-delivery=\{optimizeForLiveCompact \? "live-compact" : "zoom-optimized"\}/);
  assert.match(component, /src=\{optimizeForLiveCompact \? compactCardTemplateUrl : zoomCardTemplateUrl\}/);
  assert.doesNotMatch(component, /src=\{cardTemplateUrl\}/);
});

test("keeps the Live pitch and all fixture crests inside responsive runtime budgets", async () => {
  const pitchRoot = "public/touchlineArena/live";
  const pitchBudgets = new Map([
    ["official-live-pitch-640.webp", 45_000],
    ["official-live-pitch-960.webp", 90_000],
    ["official-live-pitch-1600.webp", 200_000],
  ]);

  for (const [name, budget] of pitchBudgets) {
    const file = path.join(pitchRoot, name);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, "webp", file);
    assert.ok(fs.statSync(file).size < budget, `${file} exceeds its responsive budget`);
  }

  const logoRoot = "public/touchlineArena/shared/club-logos/2026-27/live-160";
  const logos = listFiles(logoRoot, ".webp");
  assert.equal(logos.length, 20);
  assert.ok(
    logos.reduce((total, file) => total + fs.statSync(file).size, 0) < 300_000,
    "the complete Live fixture crest set exceeds 300 KB",
  );
  for (const file of logos) {
    const metadata = await sharp(file).metadata();
    assert.ok((metadata.width ?? 0) <= 160, file);
    assert.ok((metadata.height ?? 0) <= 160, file);
    assert.ok(fs.statSync(file).size < 20_000, `${file} exceeds the 20 KB crest budget`);
  }

  const arenaClient = fs.readFileSync("app/arena/ArenaClient.tsx", "utf8");
  assert.match(arenaClient, /function liveOptimizedClubLogoUrl/);
  assert.match(arenaClient, /official-live-pitch-640\.webp\?v=\$\{ARENA_LIVE_VISUAL_ASSET_VERSION\} 640w/);
  assert.match(arenaClient, /official-live-pitch-1600\.webp\?v=\$\{ARENA_LIVE_VISUAL_ASSET_VERSION\} 1600w/);
  assert.match(arenaClient, /const ARENA_LIVE_VISUAL_ASSET_VERSION = "2026-07-28-1"/);
  assert.doesNotMatch(arenaClient, /src="\/touchlineArena\/live\/official-live-pitch-dgim-studio-freepik\.jpg"/);

  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  assert.match(nextConfig, /Cache-Control/);
  assert.match(nextConfig, /public, max-age=31536000, immutable/);
  assert.match(nextConfig, /\/touchlineArena\/cards\/templates\/live-compact\/\:path\*/);
  assert.match(nextConfig, /\/touchlineArena\/cards\/templates\/zoom\/\:path\*/);
  assert.match(nextConfig, /\/touchlineArena\/frames\/live-compact\/\:path\*/);
  assert.match(nextConfig, /\/touchlineArena\/frames\/zoom\/\:path\*/);
  assert.match(nextConfig, /\/touchlineArena\/shared\/club-logos\/2026-27\/live-160\/\:path\*/);
});
