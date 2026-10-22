import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAssetWriteOptions, runAssetUtility } from './normalize-touchline-card-template-boxes.mjs';
let sharp;

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const clubsRoot = path.join(projectRoot, "public/touchlineArena/cards/templates/clubs");
const WIDTH = 430;
const HEIGHT = 691;
const TARGET_RATIO = WIDTH / HEIGHT;

function listPngs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('symlink in templates');
      if (entry.isDirectory()) return listPngs(fullPath);
      if (!fullPath.endsWith(".png") || !fullPath.includes(`${path.sep}market-tiers${path.sep}`)) return [];
      if (!entry.isFile()) throw new Error('non-regular template');
      return [fullPath];
    })
    .sort();
}

function isGreenPixel(r, g, b, a) {
  return a > 240 && g > 165 && r < 95 && b < 120 && g > r * 1.55 && g > b * 1.35;
}

function expandBoxToRatio(box, imageWidth, imageHeight) {
  let width = box.maxX - box.minX + 1;
  let height = box.maxY - box.minY + 1;
  let targetWidth = width;
  let targetHeight = height;

  if (width / height > TARGET_RATIO) {
    targetHeight = Math.ceil(width / TARGET_RATIO);
  } else {
    targetWidth = Math.ceil(height * TARGET_RATIO);
  }

  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  const left = Math.floor(centerX - targetWidth / 2);
  const top = Math.floor(centerY - targetHeight / 2);
  const right = left + targetWidth;
  const bottom = top + targetHeight;

  return {
    left,
    top,
    width: Math.max(1, targetWidth),
    height: Math.max(1, targetHeight),
    extendLeft: Math.max(0, -left),
    extendTop: Math.max(0, -top),
    extendRight: Math.max(0, right - imageWidth),
    extendBottom: Math.max(0, bottom - imageHeight),
  };
}

async function loadNormalizedPixels(filePath) {
  const image = sharp(filePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const repaired = Buffer.from(data);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let green = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const r = repaired[offset];
      const g = repaired[offset + 1];
      const b = repaired[offset + 2];
      const a = repaired[offset + 3];
      const removeGreen = isGreenPixel(r, g, b, a);
      if (removeGreen) {
        repaired[offset + 3] = 0;
        green += 1;
        continue;
      }
      if (a > 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error(`No visible card content found in ${filePath}`);
  }

  return {
    buffer: repaired,
    info,
    box: { minX, minY, maxX, maxY },
    greenPct: green / (info.width * info.height),
  };
}

async function analyzeRepair(bytes) {
  const { info, greenPct } = await loadNormalizedPixels(bytes);
  return `${info.width}x${info.height}` !== `${WIDTH}x${HEIGHT}` || greenPct > 0.1;
}

async function repairAsset(filePath) {
  const { buffer, info, box, greenPct } = await loadNormalizedPixels(filePath);
  const dimension = `${info.width}x${info.height}`;
  const needsRepair = dimension !== `${WIDTH}x${HEIGHT}` || greenPct > 0.1;
  if (!needsRepair) throw new Error('repair selection changed');

  const expanded = expandBoxToRatio(box, info.width, info.height);
  const source = sharp(buffer, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  });

  const extractLeft = expanded.left + expanded.extendLeft;
  const extractTop = expanded.top + expanded.extendTop;
  const extendedWidth = info.width + expanded.extendLeft + expanded.extendRight;
  const extendedHeight = info.height + expanded.extendTop + expanded.extendBottom;
  const extractWidth = Math.min(expanded.width, extendedWidth - extractLeft);
  const extractHeight = Math.min(expanded.height, extendedHeight - extractTop);

  if (extractLeft < 0 || extractTop < 0 || extractWidth < 1 || extractHeight < 1 || extractLeft + extractWidth > extendedWidth || extractTop + extractHeight > extendedHeight) {
    throw new Error(`Invalid extract area for ${filePath}: ${JSON.stringify({ expanded, extractLeft, extractTop, extractWidth, extractHeight, extendedWidth, extendedHeight })}`);
  }

  const extendedBuffer = await source
    .extend({
      left: expanded.extendLeft,
      top: expanded.extendTop,
      right: expanded.extendRight,
      bottom: expanded.extendBottom,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const extended = await sharp(extendedBuffer)
    .extract({
      left: extractLeft,
      top: extractTop,
      width: extractWidth,
      height: extractHeight,
    })
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return extended;
}

export async function runRepair(options) {
  return runAssetUtility({ ...options, analyze: options.analyze ?? analyzeRepair, transform: options.transform ?? repairAsset });
}

async function main(args) {
  const options = parseAssetWriteOptions(args);
  sharp = (await import('sharp')).default;
  const result = await runRepair({ ...options, sourceRoot: clubsRoot, files: listPngs(clubsRoot).map(filePath => ({ filePath })) });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
