import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");

test("season selection uses bilingual cumulative provisional leader copy, never frozen weekly winners", () => {
  assert.match(copy, /seasonSelection: "Seleção da Temporada"/);
  assert.match(copy, /seasonSelection: "Team of the Season"/);
  assert.match(copy, /seasonSelectionRule: "[^"]*provisórios[^"]*acumuladas da temporada/);
  assert.match(copy, /seasonSelectionRule: "[^"]*provisional[^"]*accumulated season/);
  assert.match(client, /<h2>\{copy\.seasonSelection\}<\/h2>/);
  assert.match(client, /<span>\{copy\.seasonSelectionRule\}<\/span>/);
  assert.match(client, /\{copy\.seasonSelectionHint\}/);
  assert.doesNotMatch(client, /Melhores da Gameweek|Gameweek Best XI|Seleção congelada|Selection frozen|gameweekBestRoundName/);
});
