import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ClubHub squad frames use confirmed card tiers and leave unresolved borders static", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /card\.editorialCard\?\.tierKey \?\? null/);
  assert.match(source, /"--tier-accent": tierAccent/);
  assert.match(source, /TouchlineClubPerimeterTrace accent=\{tierKey \? tierAccent : undefined\}/);
  assert.match(source, /data-squad-tier-frame=\{tierKey \?\? "unresolved"\}/);
  assert.match(source, /cards\.slice\(0, visibleCount\)/);
});

test("ClubHub positional leaders share their published card colour, not a fixed green frame", () => {
  const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/club-hub/ClubHubPremiumPrototype.module.css", import.meta.url), "utf8");
  assert.match(source, /const tierKey = leader\?\.card\.editorialCard\?\.tierKey \?\? null/);
  assert.match(source, /data-leader-tier-frame=\{tierKey \?\? "unresolved"\}/);
  assert.match(source, /"--tier-accent": tierAccent/);
  assert.match(source, /TouchlineClubPerimeterTrace accent=\{tierKey \? tierAccent : undefined\} className=\{premiumStyles.lineupLeaderTrace\}/);
  const block = css.slice(css.indexOf(".lineupLeaderCard {"), css.indexOf(".statusRail .nextFixtureCard"));
  assert.match(block, /color-mix\(in srgb, var\(--tier-accent\)/);
  assert.doesNotMatch(block, /#a3ff12|rgba\(163,255,18/);
});
