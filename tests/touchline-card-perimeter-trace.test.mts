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

function pathFor(tier: (typeof tiers)[number], variant: "player" | "coach") {
  const table = variant === "player" ? "PLAYER_SIDE_CENTRES" : "COACH_SIDE_CENTRES";
  const tableStart = source.indexOf(`const ${table}`);
  const tableEnd = source.indexOf("};", tableStart);
  const tableSource = source.slice(tableStart, tableEnd);
  const match = tableSource.match(new RegExp(`"${tier}": \\[([0-9]+), ([0-9]+)\\]`));
  assert.ok(match, `${tier} must have a ${variant} rail calibration`);
  const [, left, right] = match;
  return variant === "player"
    ? `M123 18H307L${right} 98V593L307 680H123L${left} 593V98Z`
    : `M232 28H578L${right} 153V926L578 1063H232L${left} 926V153Z`;
}

test("all seven player and coach frames receive a tier-specific centred perimeter path", () => {
  const playerPaths = new Set<string>();
  const coachPaths = new Set<string>();

  for (const tier of tiers) {
    const playerPath = pathFor(tier, "player");
    const coachPath = pathFor(tier, "coach");
    playerPaths.add(playerPath);
    coachPaths.add(coachPath);

    // Both side rails are always explicitly measured for the corresponding
    // official source frame, and the approved lower tip remains unchanged.
    assert.match(playerPath, /^M123 18H307L\d+ 98V593L307 680H123L\d+ 593V98Z$/);
    assert.match(coachPath, /^M232 28H578L\d+ 153V926L578 1063H232L\d+ 926V153Z$/);
  }

  assert.equal(playerPaths.size, 7, "player tiers must not reuse one unmeasured side path");
  assert.equal(coachPaths.size, 7, "coach tiers must not reuse one unmeasured side path");
});

test("an unknown tier fails safely to the legacy neutral path", () => {
  assert.match(source, /if \(!isPerimeterTier\(tier\)\) return TOUCHLINE_CARD_PERIMETER_PATH/);
  assert.match(source, /export const TOUCHLINE_CARD_PERIMETER_PATH = "M123 18H307L393 98V593L307 680H123L36 593V98Z"/);
});
