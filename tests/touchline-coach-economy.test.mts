import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyTouchlineCoach,
  resolveTouchlineCoachSeasonClassification,
} from "../lib/touchlineArena/coach-classification.ts";
import { resolveCompetitionCardOffer } from "../lib/touchlineArena/competition-card-offer.ts";

function offerForCoach(classification: ReturnType<typeof classifyTouchlineCoach>) {
  return resolveCompetitionCardOffer({
    subjectType: "coach",
    subjectId: classification.coachProviderId,
    competitionId: "england",
    seasonId: "2026-27",
    tierKey: classification.tierKey,
    classification,
  });
}

test("players and coaches use one England tier, price, currency and minor-unit catalogue", () => {
  const playerSapphire = resolveCompetitionCardOffer({
    subjectType: "player",
    subjectId: "player-1",
    competitionId: "england",
    seasonId: "2026-27",
    tierKey: "sapphire-blue",
  });
  const coachSapphire = offerForCoach(classifyTouchlineCoach({ coachProviderId: "coach-1" }));
  const playerRuby = resolveCompetitionCardOffer({
    subjectType: "player",
    subjectId: "player-2",
    competitionId: "england",
    seasonId: "2026-27",
    tierKey: "ruby-red",
  });
  const coachRuby = offerForCoach(classifyTouchlineCoach({
    coachProviderId: "coach-2",
    sourceLeagueId: "la-liga",
    sourceSeasonId: "2025-26",
    finalPosition: 18,
    hasCompleteProfessionalSeason: true,
  }));

  assert.equal(coachSapphire.tierKey, playerSapphire.tierKey);
  assert.equal(coachSapphire.displayPrice, "£1");
  assert.equal(coachSapphire.amountMinor, 100);
  assert.equal(coachSapphire.currency, "GBP");
  assert.equal(playerRuby.displayPrice, "£0");
  assert.equal(coachRuby.tierKey, "ruby-red");
  assert.equal(coachRuby.displayPrice, playerRuby.displayPrice);
  assert.equal(coachRuby.amountMinor, playerRuby.amountMinor);
});

test("the approved Coach-first fallbacks are paid Sapphire Blue, never fabricated Ruby Red", () => {
  const promoted = classifyTouchlineCoach({ coachProviderId: "promoted", promotionType: "playoff-winners" });
  const newcomer = classifyTouchlineCoach({ coachProviderId: "new", hasCompleteProfessionalSeason: false });
  const smallLeague = classifyTouchlineCoach({ coachProviderId: "small", sourceLeagueId: "malta-premier-league" });
  const nearRelegation = classifyTouchlineCoach({
    coachProviderId: "elite-17",
    sourceLeagueId: "la-liga",
    sourceSeasonId: "2025-26",
    finalPosition: 17,
    hasCompleteProfessionalSeason: true,
  });

  for (const item of [promoted, newcomer, smallLeague, nearRelegation]) {
    assert.equal(item.tierKey, "sapphire-blue");
    assert.equal(offerForCoach(item).displayPrice, "£1");
  }
  assert.equal(promoted.classificationReason, "promoted");
  assert.equal(smallLeague.classificationReason, "non-elite-fallback");
});

test("elite history belongs to the coach and is based on a complete season, not the new club", () => {
  const champion = classifyTouchlineCoach({
    coachProviderId: "elite-champion",
    sourceLeagueId: "bundesliga",
    sourceLeagueName: "Bundesliga",
    sourceClub: "Former club",
    sourceSeasonId: "2025-26",
    finalPosition: 1,
    hasCompleteProfessionalSeason: true,
  });
  assert.equal(champion.tierKey, "diamond-gold");
  assert.equal(champion.classificationSource, "last-complete-season");
  assert.equal(offerForCoach(champion).displayPrice, "£15");
  assert.equal("newClub" in champion, false);
});

test("a captured coach classification stays fixed until the next season reset", () => {
  const captured = classifyTouchlineCoach({
    coachProviderId: "coach",
    sourceLeagueId: "serie-a",
    sourceSeasonId: "2025-26",
    finalPosition: 1,
    hasCompleteProfessionalSeason: true,
  });
  const nextCandidate = classifyTouchlineCoach({ coachProviderId: "coach", hasCompleteProfessionalSeason: false });

  assert.equal(resolveTouchlineCoachSeasonClassification({
    activeSeasonId: "2026-27",
    capturedSeasonId: "2026-27",
    captured,
    candidate: nextCandidate,
  }), captured);
  assert.equal(resolveTouchlineCoachSeasonClassification({
    activeSeasonId: "2027-28",
    capturedSeasonId: "2026-27",
    captured,
    candidate: nextCandidate,
  }), nextCandidate);
});

test("Coach-first receives server-owned offers and does not use a second price table", () => {
  const coachCard = readFileSync(new URL("../lib/touchlineArena/coach-card.ts", import.meta.url), "utf8");
  const coachRoute = readFileSync(new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url), "utf8");
  const marketRoute = readFileSync(new URL("../app/api/touchline-arena/market/inventory/route.ts", import.meta.url), "utf8");
  const arena = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(coachCard, /TOUCHLINE_COACH_TIER_PRICES/);
  assert.match(coachCard, /touchlineArenaTierForKey\(cardTier\)/);
  assert.match(coachRoute, /export async function GET\(\)/);
  assert.match(coachRoute, /resolveCompetitionCardOffer/);
  assert.match(marketRoute, /resolveCompetitionCardOffer/);
  assert.match(marketRoute, /subjectType: "player"/);
  assert.match(arena, /coachOffersByProviderId/);
  assert.match(arena, /offer\.displayPrice/);
  assert.match(arena, /offer\.tierKey/);
});
