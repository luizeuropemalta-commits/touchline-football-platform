import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const WRITE_CONFIRMATION_FLAG = "--confirm-one-off-asset-write";

if (!process.argv.includes(WRITE_CONFIRMATION_FLAG)) {
  console.error(
    `Inactive one-off asset generator. No files were changed. Pass ${WRITE_CONFIRMATION_FLAG} only after reviewing its hardcoded source paths and output targets.`,
  );
  process.exit(1);
}

const projectRoot = process.cwd();
const outputDirectory = path.join(
  projectRoot,
  "public",
  "touchlineArena",
  "shared",
  "shirt-number-digits",
);
const downloadsDirectory = path.join(
  "/Users/luizlopez/Downloads",
  "touchline_numbers",
);

const sourceFiles = {
  "0": path.join(downloadsDirectory, "touchline-0.png"),
  "1": path.join(downloadsDirectory, "touchline-1.png"),
  "2": path.join(downloadsDirectory, "touchline-2.png"),
  "3": path.join(downloadsDirectory, "touchline-3.png"),
  "4": path.join(downloadsDirectory, "touchline-4.png"),
  "5": path.join(downloadsDirectory, "touchline-5.png"),
  "6": path.join(downloadsDirectory, "touchline-6.png"),
  "7": path.join(downloadsDirectory, "touchline-7.png"),
  "8": path.join(downloadsDirectory, "touchline-8.png"),
  "9": path.join(downloadsDirectory, "touchline-9.png"),
};

const structuralHoleCount = {
  "1": 0,
  "2": 0,
  "3": 0,
  "4": 1,
  "5": 0,
  "6": 1,
  "7": 0,
  "8": 2,
  "9": 1,
};

function floodExterior(boundary, width, height) {
  const exterior = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function enqueue(index) {
    if (boundary[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail] = index;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return exterior;
}

function labelEnclosedComponents(boundary, exterior, width, height) {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  let nextLabel = 1;

  for (let start = 0; start < labels.length; start += 1) {
    if (boundary[start] || exterior[start] || labels[start]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    labels[start] = nextLabel;
    queue[tail] = start;
    tail += 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      area += 1;
      const x = index % width;
      const y = Math.floor(index / width);

      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);

      for (const neighbor of neighbors) {
        if (
          boundary[neighbor] ||
          exterior[neighbor] ||
          labels[neighbor]
        ) {
          continue;
        }
        labels[neighbor] = nextLabel;
        queue[tail] = neighbor;
        tail += 1;
      }
    }

    components.push({ label: nextLabel, area });
    nextLabel += 1;
  }

  return { labels, components };
}

function cropMask(mask, width, height, padding = 24) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("The number silhouette is empty.");
  }

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const rgba = Buffer.alloc(cropWidth * cropHeight * 4);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceIndex = (minY + y) * width + minX + x;
      const targetIndex = (y * cropWidth + x) * 4;
      rgba[targetIndex] = 255;
      rgba[targetIndex + 1] = 255;
      rgba[targetIndex + 2] = 255;
      rgba[targetIndex + 3] = mask[sourceIndex] ? 255 : 0;
    }
  }

  return { rgba, width: cropWidth, height: cropHeight };
}

async function maskFromIllustration(sourcePath, digit) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const boundary = new Uint8Array(width * height);

  for (let index = 0; index < boundary.length; index += 1) {
    const sourceIndex = index * channels;
    const luminance =
      data[sourceIndex] * 0.2126 +
      data[sourceIndex + 1] * 0.7152 +
      data[sourceIndex + 2] * 0.0722;
    boundary[index] = luminance < 205 ? 1 : 0;
  }

  const exterior = floodExterior(boundary, width, height);
  const { labels, components } = labelEnclosedComponents(
    boundary,
    exterior,
    width,
    height,
  );
  const body = components.reduce(
    (largest, component) => component.area > largest.area ? component : largest,
    { label: 0, area: 0 },
  );
  const holeLabels = new Set(
    components
      .filter((component) => component.label !== body.label)
      .sort((left, right) => right.area - left.area)
      .slice(0, structuralHoleCount[digit])
      .map((component) => component.label),
  );
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < mask.length; index += 1) {
    if (exterior[index]) continue;
    if (holeLabels.has(labels[index])) continue;
    mask[index] = 1;
  }

  return {
    ...cropMask(mask, width, height),
    bodyArea: body.area,
    holeCount: holeLabels.size,
  };
}

async function maskFromTransparentAsset(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceAlpha = Buffer.alloc(info.width * info.height);

  for (let index = 0; index < sourceAlpha.length; index += 1) {
    sourceAlpha[index] = data[index * info.channels + 3];
  }

  const closedAlpha = await sharp(sourceAlpha, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .dilate(5)
    .erode(5)
    .threshold(96)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const mask = new Uint8Array(closedAlpha.length);

  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = closedAlpha[index] > 0 ? 1 : 0;
  }

  return {
    ...cropMask(mask, info.width, info.height),
    bodyArea: mask.reduce((total, value) => total + value, 0),
    holeCount: 1,
  };
}

await mkdir(outputDirectory, { recursive: true });

for (const [digit, sourcePath] of Object.entries(sourceFiles)) {
  const result =
    digit === "0"
      ? await maskFromTransparentAsset(sourcePath)
      : await maskFromIllustration(sourcePath, digit);
  const targetPath = path.join(outputDirectory, `${digit}.png`);

  await sharp(result.rgba, {
    raw: {
      width: result.width,
      height: result.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(targetPath);

  console.log(
    `${digit}: ${result.width}x${result.height}, body=${result.bodyArea}, holes=${result.holeCount}`,
  );
}
