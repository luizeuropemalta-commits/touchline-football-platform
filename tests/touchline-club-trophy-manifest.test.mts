import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  getTouchlineClubTrophyAssets,
  TOUCHLINE_CLUB_TROPHY_MANIFEST,
} from "../lib/touchlineArena/club-trophy-manifest.ts";
import { touchLineT } from "../lib/touchlineArena/i18n.ts";

const TROPHY_ROOT = path.join(process.cwd(), "public", "touchlineArena", "clubs");

function manifestTrophyPaths() {
  return Object.entries(TOUCHLINE_CLUB_TROPHY_MANIFEST)
    .flatMap(([folderSlug, fileNames]) => fileNames.map((fileName) => `${folderSlug}/${fileName}`))
    .sort();
}

function publicTrophyPaths() {
  return readdirSync(TROPHY_ROOT)
    .sort()
    .flatMap((folderSlug) => {
      const trophyDirectory = path.join(TROPHY_ROOT, folderSlug, "trophies");
      return readdirSync(trophyDirectory)
        .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
        .map((fileName) => `${folderSlug}/${fileName}`);
    })
    .sort();
}

test("the server-owned trophy manifest covers only existing public trophy assets", () => {
  const manifestPaths = manifestTrophyPaths();
  const publicPaths = publicTrophyPaths();

  assert.equal(manifestPaths.length, 121);
  assert.deepEqual(manifestPaths, publicPaths);
});

test("Liverpool and Arsenal resolve their complete, URL-encoded trophy galleries", () => {
  const liverpool = getTouchlineClubTrophyAssets({
    shortCode: "LIV",
    clubSlug: "liverpool",
  });
  const arsenal = getTouchlineClubTrophyAssets({
    shortCode: "ARS",
    clubSlug: "arsenal",
  });

  assert.equal(liverpool.length, 9);
  assert.equal(arsenal.length, 6);
  assert.ok(liverpool.every((trophy) => trophy.imageUrl.startsWith("/touchlineArena/clubs/liverpool/trophies/")));
  assert.ok(arsenal.every((trophy) => trophy.imageUrl.startsWith("/touchlineArena/clubs/arsenal/trophies/")));
  assert.ok([...liverpool, ...arsenal].every((trophy) => trophy.imageUrl.includes("%20")));
  assert.deepEqual(
    liverpool.map((trophy) => trophy.count),
    [20, 16, 10, 8, 6, 4, 4, 3, 1],
  );
});

test("an unknown club remains honestly empty instead of receiving invented honours", () => {
  assert.deepEqual(
    getTouchlineClubTrophyAssets({
      shortCode: "UNKNOWN",
      clubSlug: "club-with-no-tracked-trophies",
    }),
    [],
  );
});

test("Club Profile has a localised, non-data empty state for a genuinely absent trophy catalog", () => {
  const pageSource = readFileSync(
    path.join(process.cwd(), "app", "touchline-clubs", "[club]", "page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /clubHonoursUnavailable/);
  assert.match(pageSource, /className="club-hub-honours-empty"/);
  assert.equal(
    touchLineT("en-GB", "clubHonoursUnavailable"),
    "Club honours are not yet available in the TouchLine verified catalogue.",
  );
  assert.equal(
    touchLineT("pt-BR", "clubHonoursUnavailable"),
    "Os títulos do clube ainda não estão disponíveis no catálogo verificado da TouchLine.",
  );
});

test("Club Profile reads the versioned manifest rather than enumerating files at request time", () => {
  const pageSource = readFileSync(
    path.join(process.cwd(), "app", "touchline-clubs", "[club]", "page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /getTouchlineClubTrophyAssets/);
  assert.doesNotMatch(pageSource, /fs\/promises/);
  assert.doesNotMatch(pageSource, /\breaddir\(/);
  assert.doesNotMatch(pageSource, /process\.cwd\(\).*trophies/s);
});
