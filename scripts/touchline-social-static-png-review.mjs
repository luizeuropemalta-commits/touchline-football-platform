import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { chromium } from "@playwright/test";

const root = process.cwd();
const privateRoot = resolve(root, "artifacts/social-studio/events");
const argument = (key) => process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const inputName = argument("input");
const placement = argument("placement") ?? "FEED";
const base = new URL(argument("base-url"));

if (!inputName || basename(inputName) !== inputName || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(inputName)) {
  throw new Error("PRIVATE_INPUT_FILE_REQUIRED");
}
if (!['FEED', 'STORY'].includes(placement)) throw new Error("PNG_PLACEMENT_INVALID");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("LOCAL_DEVELOPMENT_URL_REQUIRED");
}

const inputPath = resolve(privateRoot, inputName);
if (!inputPath.startsWith(`${privateRoot}/`)) throw new Error("PRIVATE_INPUT_FILE_REQUIRED");
const inputBytes = await readFile(inputPath);
const inputs = JSON.parse(inputBytes);
const input = inputs.find((candidate) => candidate?.artId === "FULL_TIME");
if (!input?.fullTime || input.fullTime.schema !== "touchline-studio-full-time-v1") {
  throw new Error("FULL_TIME_CANONICAL_FACTS_REQUIRED");
}

const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const facts = input.fullTime;
const featuredClub = facts.featured.providerTeamId === facts.home.providerTeamId
  ? facts.home
  : facts.featured.providerTeamId === facts.away.providerTeamId ? facts.away : null;
if (!featuredClub || facts.featured.card.clubName.trim().toLocaleLowerCase("en-US") !== featuredClub.name.trim().toLocaleLowerCase("en-US")) {
  throw new Error("FEATURED_CARD_CLUB_MISMATCH");
}
if (!Number.isFinite(facts.featured.officialMatchRating) || facts.featured.officialMatchRating < 0 || facts.featured.officialMatchRating > 10) {
  throw new Error("OFFICIAL_MATCH_RATING_REQUIRED");
}
for (const asset of [facts.home.logoUrl, facts.away.logoUrl, facts.fixture.venue.interiorImageUrl]) {
  if (typeof asset !== "string" || !asset.startsWith("/touchlineArena/") || asset.includes("..")) throw new Error("LOCAL_CARD_ASSET_REQUIRED");
  if (!(await stat(resolve(root, "public", decodeURIComponent(asset.slice(1))))).isFile()) throw new Error("LOCAL_CARD_ASSET_MISSING");
}

const outputDir = join(privateRoot, `png-review-${new Date().toISOString().replace(/[^0-9]/g, "")}`);
await mkdir(outputDir, { recursive: false });
const pngPath = join(outputDir, `full-time-${placement.toLowerCase()}-official-card.png`);
const evidencePath = join(outputDir, "evidence.json");
const dimensions = placement === "STORY" ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: dimensions, deviceScaleFactor: 1, reducedMotion: "reduce" });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

try {
  const url = new URL("/visual-qa/social-events-live", base);
  url.searchParams.set("artId", "FULL_TIME");
  url.searchParams.set("placement", placement);
  url.searchParams.set("input", inputName);
  await page.goto(url.href, { waitUntil: "networkidle", timeout: 45_000 });
  const art = page.locator("[data-events-live-art='FULL_TIME']");
  await art.waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const checks = await page.evaluate((expectedRating) => ({
    blocked: document.querySelector("[data-events-live-blocked]")?.getAttribute("data-events-live-blocked") ?? null,
    frameworkOverlay: Boolean(document.querySelector("nextjs-portal [data-nextjs-dialog], [data-nextjs-dialog]")),
    originalPublishedCard: Boolean(document.querySelector("[data-card-editorial-state='published']")),
    socialClone: Boolean(document.querySelector("[data-touchline-social-approved-card]")),
    matchRating: document.querySelector("[data-official-match-rating]")?.getAttribute("data-official-match-rating") ?? null,
    expectedRating,
  }), String(facts.featured.officialMatchRating));
  if (checks.blocked || checks.frameworkOverlay || !checks.originalPublishedCard || checks.socialClone || checks.matchRating !== checks.expectedRating || errors.length) {
    throw new Error(`PNG_REVIEW_RENDER_REJECTED:${JSON.stringify({ checks, errors })}`);
  }
  const bounds = await art.boundingBox();
  if (!bounds || Math.round(bounds.width) !== dimensions.width || Math.round(bounds.height) !== dimensions.height) {
    throw new Error("PNG_REVIEW_DIMENSION_DRIFT");
  }
  const pngBytes = await art.screenshot({
    path: pngPath,
    animations: "disabled",
    style: "nextjs-portal { visibility: hidden !important; }",
  });
  const evidence = {
    kind: "TOUCHLINE_LOCAL_PNG_REVIEW_ONLY",
    publishable: false,
    placement,
    dimensions,
    input: relative(root, inputPath),
    inputSha256: hash(inputBytes),
    artifact: relative(root, pngPath),
    artifactSha256: hash(pngBytes),
    featured: {
      canonicalPlayerId: facts.featured.canonicalPlayerId,
      providerPlayerId: facts.featured.providerPlayerId,
      providerTeamId: facts.featured.providerTeamId,
      clubName: facts.featured.card.clubName,
      officialMatchRating: facts.featured.officialMatchRating,
    },
    checks,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
