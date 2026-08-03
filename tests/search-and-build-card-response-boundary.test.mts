import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const route = await readFile(
  new URL("../app/api/players/search-and-build-card/route.ts", import.meta.url),
  "utf8",
);
const cardStudio = await readFile(
  new URL("../app/visual-qa/touchline-card-studio/page.tsx", import.meta.url),
  "utf8",
);

function routeSection(startMarker: string, endMarker: string) {
  const start = route.indexOf(startMarker);
  const end = route.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing route marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing route marker: ${endMarker}`);
  return route.slice(start, end);
}

test("every route-owned JSON response passes through the client sanitizer", () => {
  assert.equal(route.match(/NextResponse\.json\(/g)?.length, 1);
  assert.match(
    route,
    /function playerRouteJson\([\s\S]*?NextResponse\.json\(sanitizePlayerRouteResponseForClient\(payload\), init\)/,
  );
});

test("the exact response sanitizer removes secrets, raw payloads, image paths and Sportmonks URLs", () => {
  const sanitizerSource = routeSection(
    "const BLOCKED_CLIENT_RESPONSE_KEYS",
    "function playerRouteJson",
  );
  const javascript = ts.transpileModule(sanitizerSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sanitize = new Function(
    `${javascript}; return sanitizePlayerRouteResponseForClient;`,
  )() as (value: unknown) => unknown;

  const previousToken = process.env.SPORTMONKS_API_TOKEN;
  process.env.SPORTMONKS_API_TOKEN = "private-provider-token";

  try {
    const sanitized = sanitize({
      token: "private-provider-token",
      raw_data: { transfers: ["licensed"] },
      nested: {
        image_path: "https://cdn.sportmonks.com/images/players/1.png",
        apiToken: "private-provider-token",
        providerMedia: "https://cdn.sportmonks.com/images/teams/9.png",
      },
      candidates: [{ name: "Player", imagePath: "https://cdn.sportmonks.com/player.png" }],
      avatarStatus: "missing_sportmonks_image_path",
      playerCard: {
        name: "Player",
        flagUrl: "/touchlineArena/shared/country-flags-4x3/gb-eng.svg",
        clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/manchester-city.png",
      },
    });
    const serialized = JSON.stringify(sanitized);

    assert.doesNotMatch(serialized, /private-provider-token|raw_data|image_path|imagePath|sportmonks\.com/i);
    assert.match(serialized, /country-flags-4x3/);
    assert.match(serialized, /club-logos/);
  } finally {
    if (previousToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = previousToken;
  }
});

test("search and full-card DTOs expose only normalized UI fields", () => {
  const candidateBuilder = routeSection(
    "function cachedPlayerSearchCandidate",
    "function safeIlikeNeedle",
  );
  assert.doesNotMatch(candidateBuilder, /(?:imagePath|image_path|clubLogoUrl|raw_data)\s*:/);

  const fullResponse = routeSection(
    "return playerRouteJson({\n      playerCard,",
    "  } catch (error: any)",
  );
  assert.doesNotMatch(
    fullResponse,
    /player:\s*savedPlayer|hasSportMonksPhoto|rawPlayerImagePath|normalizedImagePath|savedPlayerImagePath|openAiKeyConfigured|avatarErrorMessage/,
  );
  assert.match(fullResponse, /playerDataSource/);

  const cardBuilder = routeSection("function buildPlayerCard", "export async function POST");
  assert.match(cardBuilder, /flagUrl: touchlineCountryFlagUrl\(player\.country_code3\)/);
  assert.match(cardBuilder, /leagueLogoUrl: localTouchLineAssetUrl\(player\.current_league_logo_url\)/);
  assert.match(cardBuilder, /sourcePhotoUrl: ""/);
  assert.doesNotMatch(route, /avatarStatus:\s*message\s*===/);
});

test("player search and card build remain data-only without generative providers", () => {
  assert.doesNotMatch(
    route,
    /getOrCreateTouchlinePlayerAvatar|customAvatarPrompt|avatarOverrides|OPENAI_|RUNWAY|openai_avatar_generation_timeout/,
  );
  assert.match(route, /function approvedStaticCardPortraitUrl/);
  assert.match(route, /const playerCard = buildPlayerCard\(savedPlayer\)/);
});

test("Card Studio keeps the official editor without Runway or avatar-generation controls", () => {
  assert.doesNotMatch(
    cardStudio,
    /\/api\/touchline-arena\/runway-card-avatar|requestRunway|runwayPrompt|runwayReferenceUrl|Preparar prompt|Gerar teste/,
  );
  assert.doesNotMatch(cardStudio, /type="file"\s+accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(cardStudio, /persistLayoutToMaster/);
  assert.match(cardStudio, /approved static TouchLine portrait/);
});
