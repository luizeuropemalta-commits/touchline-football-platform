import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { assessSocialLineupLiveReference, assessSocialLineupLiveRendered } from "../lib/touchlineArena/social-lineup-live-contract.ts";
const input = JSON.parse(readFileSync(new URL("../artifacts/social-studio/lineup/render-reference-20260914.json", import.meta.url), "utf8"));
const now = Date.now();
const copy = () => structuredClone(input);
const draft = () => ({ fixtureId: input.fixtureId, seasonId: input.providerSeasonId, startsAt: input.startsAt, lineupAvailableAt: input.firstObservedAt,
  formation: input.formation, club: { teamId: input.teamId }, home: { teamId: input.homeTeamId }, away: { teamId: input.awayTeamId }, score: input.score,
  coach: { identity: { coach: { providerId: input.coach.providerId, name: input.coach.name } } },
  players: input.members.filter(m => m.starter).map(m => ({ card: { id: m.providerPlayerId, canonicalPlayerId: m.canonicalPlayerId, shirtNumber: m.officialShirt, cardTier: m.publishedTier, editorialCard: { tierKey: m.publishedTier } } })),
  bench: input.members.filter(m => !m.starter).map(m => ({ id: m.providerPlayerId, canonicalPlayerId: m.canonicalPlayerId, shirtNumber: m.officialShirt, cardTier: m.publishedTier, editorialCard: { tierKey: m.publishedTier } })) });
test("real reference is review-only and discloses formation disagreement", () => { const gate = assessSocialLineupLiveReference(input, now); assert.equal(gate.reviewable, true); assert.equal(gate.publishable, false); assert.match(gate.reason, /DISAGREEMENT/); });
test("an invented publication timestamp fails", () => { const x = copy(); x.providerPublishedAt = x.firstObservedAt; assert.equal(assessSocialLineupLiveReference(x, now).reviewable, false); });
test("a transferred card, missing bench and duplicate starter fail", () => { for (const mutate of [x => x.members[0].publicationClubId = "wrong-club", x => x.members.pop(), x => x.members[1].providerPlayerId = x.members[0].providerPlayerId]) { const x = copy(); mutate(x); assert.equal(assessSocialLineupLiveReference(x, now).reviewable, false); } });
test("rendered XI order, published tier and coach must match", () => { assert.equal(assessSocialLineupLiveRendered(input, draft()), null); for (const mutate of [x => x.players.reverse(), x => x.coach.identity.coach.name = "Eddie Howe", x => x.bench[0].editorialCard.tierKey = "invented"]) { const x = draft(); mutate(x); assert.notEqual(assessSocialLineupLiveRendered(input, x), null); } });
test("stale review cannot render and production route fails closed", () => { assert.equal(assessSocialLineupLiveReference(input, Date.parse(input.validUntil)).reviewable, false); const route = readFileSync(new URL("../app/visual-qa/social-lineup-live/page.tsx", import.meta.url), "utf8"); assert.match(route, /process\.env\.NODE_ENV !== "development"\) notFound\(\)/); });
