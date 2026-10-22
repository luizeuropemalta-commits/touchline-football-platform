import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planAssetBackup, verifyAssetSources } from "./local/verified-asset-backup.mjs";
import { transformVerifiedAssets } from "./local/verified-asset-transform.mjs";
let sharp;

const WRITE_CONFIRMATION_FLAG = "--confirm-one-off-asset-write";

export function parseAssetWriteOptions(args) {
  const backups = args.filter(arg => arg.startsWith('--backup-root='));
  if (args.length !== 2 || args.filter(arg => arg === WRITE_CONFIRMATION_FLAG).length !== 1 || backups.length !== 1
      || !path.isAbsolute(backups[0].slice('--backup-root='.length))) {
    throw new Error(`Inactive one-off asset utility. Require ${WRITE_CONFIRMATION_FLAG} --backup-root=<new-absolute-directory>`);
  }
  return { backupRoot: path.resolve(backups[0].slice('--backup-root='.length)) };
}

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
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
    if (club.isSymbolicLink()) throw new Error('symlink in templates');
    if (!club.isDirectory()) continue;
    const tiersDir = path.join(CLUB_TEMPLATES_DIR, club.name, "market-tiers");
    let tierFiles = [];
    try {
      if ((await fs.lstat(tiersDir)).isSymbolicLink()) throw new Error('symlink in market tiers');
      tierFiles = await fs.readdir(tiersDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    for (const tierFile of tierFiles) {
      if (!tierFile.name.endsWith(".png")) continue;
      if (!tierFile.isFile()) throw new Error('non-regular template');
      const tier = tierFile.name.replace(/\.png$/i, "");
      if (!TARGET_BOX_BY_TIER[tier]) continue;
      files.push({
        club: club.name,
        tier,
        filePath: path.join(tiersDir, tierFile.name),
      });
    }
  }

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

async function analyzeTemplate(bytes, { tier }) {
  const box = await alphaBox(bytes);
  return Boolean(box && !boxMatches(box, TARGET_BOX_BY_TIER[tier]));
}

async function normalizeTemplate(filePath, { tier }) {
  const target = TARGET_BOX_BY_TIER[tier];
  const box = await alphaBox(filePath);
  if (!box || boxMatches(box, target)) throw new Error('normalization selection changed');

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

  return normalized;
}

// Shared only by the two inactive utilities; injected callbacks enable byte-only tests.
export async function runAssetUtility({ sourceRoot, files, backupRoot, analyze, transform }) {
  if (!path.isAbsolute(backupRoot)) throw new Error('absolute backup required');
  const items = files.map(item => ({ filePath: item.filePath, tier: item.tier, club: item.club }));
  if (!items.length) return { status: 'NOOP', completed: [], skipped: [] };
  const plan = await planAssetBackup(sourceRoot, items.map(item => item.filePath));
  const changedPaths = [];
  for (const [index, item] of items.entries()) {
    const bytes = await fs.readFile(item.filePath);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== plan.entries[index].sha256) throw new Error('analysis source diverged');
    if (await analyze(bytes, { ...item })) changedPaths.push(item.filePath);
  }
  await verifyAssetSources(plan);
  return transformVerifiedAssets({ plan, changedPaths, backupRoot, transform: (bytes, entry) => transform(bytes, { ...items.find(item => item.filePath === entry.path) }) });
}

export async function runNormalizer(options) {
  return runAssetUtility({ ...options, analyze: options.analyze ?? analyzeTemplate, transform: options.transform ?? normalizeTemplate });
}

async function main(args) {
  const options = parseAssetWriteOptions(args);
  sharp = (await import('sharp')).default;
  const result = await runNormalizer({ ...options, sourceRoot: CLUB_TEMPLATES_DIR, files: await listTemplateFiles() });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
