import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the seven-tier studio uses the same names as public player and coach cards", () => {
  const source = readFileSync(new URL("../app/visual-qa/touchline-card-studio/page.tsx", import.meta.url), "utf8");
  assert.ok(!/label: "(?:Ruby Red|Sapphire Blue|Amethyst Purple|Emerald Green|Diamond Gold)"/.test(source), "studio labels must not retain the superseded English dictionary");
  assert.ok(source.includes('touchlineCardTierName(preview.tierKey, "en-GB")'), "resolve preview labels from the canonical tier dictionary");
});

test("card studio retains editing, search and saved-card reads without writing the retired formation", () => {
  const source = readFileSync(new URL("../app/visual-qa/touchline-card-studio/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /saveCurrentCardToFormation|Save to Formation|arena-video-preview|nextFormationSlot|FORMATION_CARD_SLOTS_BY_ROLE/);
  assert.doesNotMatch(source, /localStorage\.setItem\(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY/);
  assert.match(source, /onClick=\{searchSportMonks\}/);
  assert.match(source, /onClick=\{\(\) => selectCandidate\(candidate\)\}/);
  assert.match(source, /onClick=\{\(\) => loadFormationCardForEditing\(savedPlayer\)\}/);
  assert.match(source, /<TouchlineEliteExactCard[^>]*isEditable[^>]*layoutStorageKey=\{TOUCHLINE_CARD_STUDIO_LAYOUT_KEY\}[^>]*persistLayoutToMaster/);
  assert.match(source, /CARD_PREVIEW_VALUES\.map/);
});
