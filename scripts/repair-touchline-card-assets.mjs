import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WRITE_CONFIRMATION_FLAG = "--confirm-one-off-asset-write";

if (!process.argv.includes(WRITE_CONFIRMATION_FLAG)) {
  console.error(
    `Inactive one-off asset repair. No files were changed. Pass ${WRITE_CONFIRMATION_FLAG} only after creating an independent backup and reviewing every target.`,
  );
  process.exit(1);
}

const projectRoot = process.cwd();
const clubsRoot = path.join(projectRoot, "public/touchlineArena/cards/templates/clubs");
const WIDTH = 430;
const HEIGHT = 691;
const TARGET_RATIO = WIDTH / HEIGHT;

function listPngs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listPngs(fullPath);
      return fullPath.endsWith(".png") && fullPath.includes(`${path.sep}market-tiers${path.sep}`) ? [fullPath] : [];
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

async function repairAsset(filePath) {
  const { buffer, info, box, greenPct } = await loadNormalizedPixels(filePath);
  const dimension = `${info.width}x${info.height}`;
  const needsRepair = dimension !== `${WIDTH}x${HEIGHT}` || greenPct > 0.1;
  if (!needsRepair) return null;

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

  await fs.promises.writeFile(filePath, extended);

  return {
    filePath,
    before: dimension,
    greenPct: Number((greenPct * 100).toFixed(1)),
  };
}

const repaired = [];
for (const filePath of listPngs(clubsRoot)) {
  const result = await repairAsset(filePath).catch((error) => {
    error.message = `${error.message}\nWhile repairing: ${filePath}`;
    throw error;
  });
  if (result) repaired.push(result);
}

console.log(JSON.stringify({ repairedCount: repaired.length, repaired }, null, 2));
