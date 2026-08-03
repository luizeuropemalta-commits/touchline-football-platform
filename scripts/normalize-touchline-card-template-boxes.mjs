import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const WRITE_CONFIRMATION_FLAG = "--confirm-one-off-asset-write";

if (!process.argv.includes(WRITE_CONFIRMATION_FLAG)) {
  console.error(
    `Inactive one-off asset normalizer. No files were changed. Pass ${WRITE_CONFIRMATION_FLAG} only after creating an independent backup and reviewing every target.`,
  );
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CLUB_TEMPLATES_DIR = path.join(PROJECT_ROOT, "public/touchlineArena/cards/templates/clubs");
const CANVAS_W = 430;
const CANVAS_H = 691;
const ALPHA_THRESHOLD = 8;

const TARGET_BOX_BY_TIER = {
  "amethyst-purple": { left: 0, top: 17, width: 430, height: 657 },
  "clear-diamond": { left: 0, top: 25, width: 430, height: 638 },
  "diamond-gold": { left: 0, top: 18, width: 430, height: 651 },
  "emerald-green": { left: 0, top: 15, width: 430, height: 660 },
  "radiant-gold": { left: 0, top: 9, width: 430, height: 676 },
  "ruby-red": { left: 0, top: 12, width: 430, height: 668 },
  "sapphire-blue": { left: 0, top: 15, width: 430, height: 661 },
};

async function fileSha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function alphaBox(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function boxMatches(box, target) {
  return box.left === target.left && box.top === target.top && box.width === target.width && box.height === target.height;
}

async function listTemplateFiles() {
  const clubs = await fs.readdir(CLUB_TEMPLATES_DIR, { withFileTypes: true });
  const files = [];

  for (const club of clubs) {
    if (!club.isDirectory()) continue;
    const tiersDir = path.join(CLUB_TEMPLATES_DIR, club.name, "market-tiers");
    let tierFiles = [];
    try {
      tierFiles = await fs.readdir(tiersDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const tierFile of tierFiles) {
      if (!tierFile.isFile() || !tierFile.name.endsWith(".png")) continue;
      const tier = tierFile.name.replace(/\.png$/i, "");
      if (!TARGET_BOX_BY_TIER[tier]) continue;
      files.push({
        club: club.name,
        tier,
        filePath: path.join(tiersDir, tierFile.name),
      });
    }
  }

  return files;
}

async function normalizeTemplate({ filePath, tier }) {
  const target = TARGET_BOX_BY_TIER[tier];
  const box = await alphaBox(filePath);
  if (!box) return { changed: false, reason: "empty-alpha" };
  if (boxMatches(box, target)) return { changed: false, reason: "already-normalized", box };

  const extracted = await sharp(filePath)
    .ensureAlpha()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(target.width, target.height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const normalized = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: extracted, left: target.left, top: target.top }])
    .png()
    .toBuffer();

  await fs.writeFile(filePath, normalized);
  return { changed: true, before: box, after: await alphaBox(filePath) };
}

async function main() {
  const files = await listTemplateFiles();
  const backupRoot = process.argv.find((arg) => arg.startsWith("--backup-root="))?.split("=")[1];
  const touched = [];

  for (const item of files) {
    const beforeHash = await fileSha256(item.filePath);
    const result = await normalizeTemplate(item);
    const afterHash = await fileSha256(item.filePath);

    if (result.changed || beforeHash !== afterHash) {
      touched.push({
        club: item.club,
        tier: item.tier,
        file: path.relative(PROJECT_ROOT, item.filePath),
        beforeHash,
        afterHash,
        before: result.before,
        after: result.after,
      });
    }
  }

  if (backupRoot) {
    await fs.mkdir(backupRoot, { recursive: true });
    await fs.writeFile(path.join(backupRoot, "normalize-report.json"), JSON.stringify({ touched, totalFiles: files.length }, null, 2));
  }

  console.log(JSON.stringify({ totalFiles: files.length, changed: touched.length, touched }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
