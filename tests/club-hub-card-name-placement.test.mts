import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clubHubPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

test("ClubHub keeps the player name inside the official card and never repeats it below", () => {
  const cardMeta = clubHubPage.match(/<div className="club-hub-card-meta">([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.match(cardMeta, /t\("openSelectedPlayerProfile"\)/);
  assert.doesNotMatch(cardMeta, /card\.shortName/);
  assert.doesNotMatch(cardMeta, /<strong>/);
});

test("ClubHub compact cards reserve enough width for a readable official shirt name", () => {
  assert.match(clubHubPage, /minmax\(218px, 1fr\)/);
  assert.match(clubHubPage, /width: min\(100%, 180px\) !important/);
  assert.match(clubHubPage, /width: min\(100%, 190px\) !important/);
  assert.match(clubHubPage, /initialRenderScale=\{180 \/ 430\}/);
  assert.match(clubHubPage, /imageLoading=\{index < 6 \? "eager" : "lazy"\}/);
});
