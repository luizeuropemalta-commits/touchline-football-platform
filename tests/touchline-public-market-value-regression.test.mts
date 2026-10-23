import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicSurfaces = [
  "app/touchline-clubs/[club]/page.tsx",
  "app/touchline-players/[player]/page.tsx",
  "components/touchline/TouchlinePlayerCardRankingsPublication.tsx",
  "app/rankings/touchline-tables-client.tsx",
  "components/touchline/TouchlineCoachCategoryShowcase.tsx",
  "components/touchline/fantasy/TouchlineGameweekCard.tsx",
];

test("removing commercial card prices must not hide football market values on public cards", () => {
  for (const path of publicSurfaces) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const choices = [...source.matchAll(/\bhideMarketValuePanel(?:=\{([^}]+)\})?/g)];
    assert.ok(choices.length > 0, `${path}: explicit public visibility choice`);
    choices.forEach(choice => assert.equal(choice[1], "false", `${path}: show football market value, not commercial card price`));
  }
});
