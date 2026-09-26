import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";
import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";

test("Portuguese full provider positions and pitch abbreviations remain presentation-only", () => {
  for (const [original, expected] of [
    ["Attacking Midfield", "Meia ofensivo"], ["Central Midfield", "Meio-campista"],
    ["Defensive Midfield", "Volante"], ["Centre-Back", "Zagueiro"],
    ["Left-Back", "Lateral esquerdo"], ["Right-Back", "Lateral direito"],
    ["Left Winger", "Ponta esquerda"], ["Right Winger", "Ponta direita"],
    ["Centre-Forward", "Centroavante"], ["Goalkeeper", "Goleiro"],
    ["CAM", "Meia ofensivo"], ["RWB", "Ala direito"],
  ]) {
    assert.equal(localizedPositionLabel(original, "pt-BR"), expected);
    assert.equal(localizedPositionLabel(original, "en-GB"), original);
  }
  for (const unknown of [null, undefined, "", "Unverified Role", "Meia ofensivo"]) {
    assert.equal(localizedPositionLabel(unknown, "pt-BR"), unknown);
  }
});
test("shared card zoom and full profile use the same localised position without mutating identity", () => {
  const input = Object.freeze({ locale: "pt-BR", name: "Rayan Cherki", clubName: "Manchester City", position: "Attacking Midfield" });
  const details = buildTouchlinePlayerCardZoomDetails(input);
  assert.equal(details.subtitle, "Manchester City · Meia ofensivo");
  assert.equal(details.fields?.find(field => field.label === "Posição")?.value, "Meia ofensivo");
  assert.equal(input.position, "Attacking Midfield");
  const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ localizedPositionLabel \} from "@\/lib\/touchlineArena\/position-labels"/);
  assert.doesNotMatch(page, /const ptPositionLabels/);
});

test("ClubHub squad captions use the same position labels as the profile and zoom", () => {
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  assert.ok(grid.includes("localizedPositionLabel(card.position, locale)"), "squad caption must use the shared presentation-only formatter");
  assert.doesNotMatch(grid, /function localizedPosition\(/);
});

test("both dedicated ranking summaries localise positions without changing data inputs", () => {
  const page = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.equal(page.match(/localizedPositionLabel\(card\.position, locale\)/g)?.length, 2);
  assert.match(page, /position: card\.position,/);
});
