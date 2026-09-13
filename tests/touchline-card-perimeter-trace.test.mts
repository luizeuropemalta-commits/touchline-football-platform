import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tiers = [
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
] as const;

const source = readFileSync(
  new URL("../components/touchline/cards/TouchlineCardPerimeterTrace.tsx", import.meta.url),
  "utf8",
);

const expectedPlayerRailCentres = {
  "ruby-red": [21, 412],
  "sapphire-blue": [18, 412],
  "amethyst-purple": [14, 417],
  "radiant-gold": [15, 414],
  "emerald-green": [25, 411],
  "clear-diamond": [19, 412],
  "diamond-gold": [29, 400],
} as const;

const expectedCoachRailCentres = {
  "ruby-red": [95, 711],
  "sapphire-blue": [79, 726],
  "amethyst-purple": [78, 730],
  "radiant-gold": [89, 715],
  "emerald-green": [78, 725],
  "clear-diamond": [76, 748],
  "diamond-gold": [80, 733],
} as const;

function railCentresFor(tier: (typeof tiers)[number], variant: "player" | "coach") {
  const table = variant === "player"
    ? "TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES"
    : "TOUCHLINE_COACH_PERIMETER_SIDE_CENTRES";
  const tableStart = source.indexOf(`export const ${table}`);
  const tableEnd = source.indexOf("};", tableStart);
  const tableSource = source.slice(tableStart, tableEnd);
  const match = tableSource.match(new RegExp(`"${tier}": \\[([0-9]+), ([0-9]+)\\]`));
  assert.ok(match, `${tier} must have a ${variant} rail calibration`);
  return [Number(match[1]), Number(match[2])] as const;
}

test("all seven player and coach frames receive a tier-specific centred perimeter path", () => {
  const playerPaths = new Set<string>();
  const coachPaths = new Set<string>();

  for (const tier of tiers) {
    const playerRailCentres = railCentresFor(tier, "player");
    const coachRailCentres = railCentresFor(tier, "coach");
    const playerPath = `M123 18H307L${playerRailCentres[1]} 98V593L307 680H123L${playerRailCentres[0]} 593V98Z`;
    const coachPath = `M232 28H578L${coachRailCentres[1]} 153V926L578 1063H232L${coachRailCentres[0]} 926V153Z`;
    playerPaths.add(playerPath);
    coachPaths.add(coachPath);

    // Both rails are measured from the real source frame, not inferred from
    // a shared fallback. The bottom remains deliberately proud of the art.
    assert.deepEqual(playerRailCentres, expectedPlayerRailCentres[tier]);
    assert.deepEqual(coachRailCentres, expectedCoachRailCentres[tier]);
    assert.ok(playerRailCentres[0] < playerRailCentres[1], `${tier} player rails must remain ordered`);
    assert.ok(coachRailCentres[0] < coachRailCentres[1], `${tier} coach rails must remain ordered`);
    assert.equal(playerPath, `M123 18H307L${playerRailCentres[1]} 98V593L307 680H123L${playerRailCentres[0]} 593V98Z`);
    assert.equal(coachPath, `M232 28H578L${coachRailCentres[1]} 153V926L578 1063H232L${coachRailCentres[0]} 926V153Z`);
  }

  assert.equal(playerPaths.size, 7, "player tiers must not reuse one unmeasured side path");
  assert.equal(coachPaths.size, 7, "coach tiers must not reuse one unmeasured side path");
});

test("an unknown tier fails safely to the legacy neutral path", () => {
  assert.match(source, /if \(!isPerimeterTier\(tier\)\) return TOUCHLINE_CARD_PERIMETER_PATH/);
  assert.match(source, /export const TOUCHLINE_CARD_PERIMETER_PATH = "M123 18H307L393 98V593L307 680H123L36 593V98Z"/);
});
