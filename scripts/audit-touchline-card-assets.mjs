import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const clubsRoot = path.join(projectRoot, "public/touchlineArena/cards/templates/clubs");
const EXPECTED_WIDTH = 430;
const EXPECTED_HEIGHT = 691;
const EXPECTED_DIMENSION = `${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`;
const INTENTIONAL_SHARED_TEMPLATE_CLUBS = new Set([
  "Brentford FC|Sunderland AFC",
]);

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

async function inspectAsset(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let transparent = 0;
  let green = 0;
  let opaque = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    if (a === 0) transparent += 1;
    if (a === 255) opaque += 1;
    if (isGreenPixel(r, g, b, a)) green += 1;
  }

  const relativePath = path.relative(clubsRoot, filePath);
  const [club, , filename] = relativePath.split(path.sep);
  const bytes = fs.statSync(filePath).size;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 12);

  return {
    club,
    tier: path.basename(filename, ".png"),
    filePath,
    dimension: `${info.width}x${info.height}`,
    bytes,
    hash,
    transparentPct: Number(((transparent / total) * 100).toFixed(1)),
    opaquePct: Number(((opaque / total) * 100).toFixed(1)),
    greenPct: Number(((green / total) * 100).toFixed(1)),
  };
}

const assets = [];
for (const filePath of listPngs(clubsRoot)) {
  assets.push(await inspectAsset(filePath));
}

const duplicateGroups = Object.values(
  assets.reduce((groups, asset) => {
    groups[asset.hash] = groups[asset.hash] || [];
    groups[asset.hash].push(asset);
    return groups;
  }, {}),
).filter((group) => group.length > 1);

function isIntentionalSharedTemplateGroup(group) {
  const clubs = group.map((asset) => asset.club).sort();
  const tiers = new Set(group.map((asset) => asset.tier));
  return clubs.length === 2
    && tiers.size === 1
    && INTENTIONAL_SHARED_TEMPLATE_CLUBS.has(clubs.join("|"));
}

const intentionalSharedTemplateGroups = duplicateGroups.filter(isIntentionalSharedTemplateGroup);
const unexpectedDuplicateGroups = duplicateGroups.filter((group) => !isIntentionalSharedTemplateGroup(group));

const dimensionFailures = assets.filter((asset) => asset.dimension !== EXPECTED_DIMENSION);
const greenFailures = assets.filter((asset) => asset.greenPct > 10 && asset.transparentPct < 1);

console.log(JSON.stringify({
  totalAssets: assets.length,
  expectedDimension: EXPECTED_DIMENSION,
  dimensionFailures: dimensionFailures.map(({ club, tier, dimension, bytes, greenPct, transparentPct }) => ({ club, tier, dimension, bytes, greenPct, transparentPct })),
  greenFailures: greenFailures.map(({ club, tier, dimension, greenPct, transparentPct }) => ({ club, tier, dimension, greenPct, transparentPct })),
  intentionalSharedTemplateGroups: intentionalSharedTemplateGroups.map((group) => group.map(({ club, tier, dimension }) => ({ club, tier, dimension }))),
  unexpectedDuplicateGroups: unexpectedDuplicateGroups.map((group) => group.map(({ club, tier, dimension }) => ({ club, tier, dimension }))),
}, null, 2));

if (dimensionFailures.length || greenFailures.length || unexpectedDuplicateGroups.length) {
  process.exitCode = 1;
}
