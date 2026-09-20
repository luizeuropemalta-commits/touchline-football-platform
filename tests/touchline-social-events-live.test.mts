import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessEventsLivePackage, assessEventsLivePresentation, assessEventsLiveReview, EVENTS_LIVE_ART_IDS, eventsLiveFrame, type EventsLivePackageInput } from "../lib/touchlineArena/social-events-live-contract.ts";
import { assessEventsLiveSeam, assertEventsLiveDecode, compareEventsLivePixels } from "../lib/touchlineArena/social-events-live-media-evidence.ts";
import { validateStudioOfficialDeclaration, verifyStudioPublishedSource } from "../lib/touchlineArena/social-studio-source-gate.ts";
import type { StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { syntheticEventsLiveInputs, SYNTHETIC_EVENT_IDS, SYNTHETIC_EVENTS_NOW, SYNTHETIC_EVENTS_SOURCE, SYNTHETIC_TEAMS } from "./fixtures/social-events-live.synthetic.mts";

const inputs = syntheticEventsLiveInputs();
const candidate = (artId: string) => structuredClone(inputs.find(input => input.artId === artId)!.evidence);
// Deterministic unit scenarios, not archived football facts. The missing real
// replay remains a separate BLOCKED factual audit; see the fixture README.
const reviewTime = (input: EventsLivePackageInput) => Math.min(
  Date.parse(input.validUntil) - 1,
  Math.max(Date.parse(input.asOf), Date.parse(input.fetchedAt), Date.parse(input.evidence.finalizedAt)),
);

test("all five synthetic event scenarios reconcile without granting automation", () => {
  assert.deepEqual(inputs.map(input => input.artId), [...EVENTS_LIVE_ART_IDS]);
  const isolated = syntheticEventsLiveInputs();
  isolated[0]!.evidence.events[0]!.teamId = "mutated-test-copy";
  assert.equal(isolated[1]!.evidence.events[0]!.teamId, SYNTHETIC_TEAMS.home);
  assert.equal(inputs[0]!.evidence.events[0]!.teamId, SYNTHETIC_TEAMS.home);
  for (const input of inputs) {
    const result = assessEventsLiveReview(input.evidence, SYNTHETIC_EVENTS_NOW);
    assert.equal(result.reviewable, true, `${input.artId}:${result.reason}`);
    assert.equal(result.publishable, false);
    assert.equal(result.automation, "BLOCKED");
    assert.equal(input.evidence.confirmationState, null);
    assert.equal(input.totalRating, null);
    assert.ok(input.caption.includes(input.dateLabel));
  }
});
test("own-goal author stays with the away club while the home club receives the goal", () => {
  const fact = candidate("OWN_GOAL");
  assert.equal(fact.playerTeamId, SYNTHETIC_TEAMS.away);
  assert.equal(fact.events.find(event => event.id === SYNTHETIC_EVENT_IDS.ownGoal)!.teamId, SYNTHETIC_TEAMS.home);
  fact.playerTeamId = SYNTHETIC_TEAMS.home;
  assert.equal(assessEventsLiveReview(fact, SYNTHETIC_EVENTS_NOW).reason, "OWN_GOAL_CLUB_CONFLICT");
});
test("hat-trick excludes the own goal and requires three distinct goals by the same player", () => {
  const fact = candidate("HAT_TRICK_HERO");
  fact.eventIds[1] = SYNTHETIC_EVENT_IDS.ownGoal;
  assert.equal(assessEventsLiveReview(fact, SYNTHETIC_EVENTS_NOW).reviewable, false);
  // Also pass the identity guard deliberately: an own-goal kind must not
  // become a third credited goal merely because its author IDs were relabelled.
  const wronglyCredited = candidate("HAT_TRICK_HERO");
  const ownGoal = wronglyCredited.events.find(event => event.id === SYNTHETIC_EVENT_IDS.ownGoal)!;
  ownGoal.playerId = wronglyCredited.playerId;
  ownGoal.providerPlayerId = wronglyCredited.playerProviderId;
  wronglyCredited.eventIds[1] = ownGoal.id;
  assert.equal(assessEventsLiveReview(wronglyCredited, SYNTHETIC_EVENTS_NOW).reason, "THREE_CREDITED_GOALS_REQUIRED");
  const duplicate = candidate("HAT_TRICK_HERO");
  duplicate.eventIds[1] = duplicate.eventIds[0]!;
  assert.equal(assessEventsLiveReview(duplicate, SYNTHETIC_EVENTS_NOW).reason, "THREE_CREDITED_GOALS_REQUIRED");
});
test("rescinded target and conflicting final score cannot render", () => {
  const red = candidate("RED_CARD_CONFIRMED");
  red.events.find(event => event.id === red.eventIds[0])!.addition = "Red card rescinded";
  assert.equal(assessEventsLiveReview(red, SYNTHETIC_EVENTS_NOW).reviewable, false);
  const goal = candidate("GOAL_CONFIRMED"); goal.finalScore.home = 3;
  assert.equal(assessEventsLiveReview(goal, SYNTHETIC_EVENTS_NOW).reason, "FINAL_SCORE_CONFLICT");
});
test("live fixture and unpublished card cannot masquerade as a dated retrospective", () => {
  const live = candidate("GOAL_CONFIRMED"); live.fixtureStatus = "LIVE";
  assert.equal(assessEventsLiveReview(live, SYNTHETIC_EVENTS_NOW).reason, "FINAL_FIXTURE_REQUIRED");
  const unpublished = candidate("FULL_TIME"); unpublished.cardPublished = false;
  assert.equal(assessEventsLiveReview(unpublished, SYNTHETIC_EVENTS_NOW).reason, "CANONICAL_PUBLISHED_CARD_REQUIRED");
});
test("frame phase repeats exactly without an endpoint pause", () => {
  assert.equal(eventsLiveFrame(6000), eventsLiveFrame(0));
  assert.equal(eventsLiveFrame(12000), eventsLiveFrame(0));
  assert.equal(eventsLiveFrame(6100), 100);
  assert.throws(() => eventsLiveFrame(NaN));
});

test("rendered score cannot diverge from the goal-time score in the snapshot", () => {
  const rendered = JSON.parse(JSON.stringify(inputs.find(input => input.artId === "GOAL_CONFIRMED")));
  assert.equal(assessEventsLivePresentation(rendered, SYNTHETIC_EVENTS_NOW).reviewable, true);
  rendered.score = { home: 4, away: 1 };
  assert.equal(assessEventsLivePresentation(rendered, SYNTHETIC_EVENTS_NOW).reason, "RENDERED_FACTS_CONFLICT");
});

test("fresh packages bind both social destinations, card and match settlement", () => {
  for (const input of inputs) {
    const result = assessEventsLivePackage(input, reviewTime(input));
    assert.equal(result.reviewable, true, input.artId);
    assert.equal(result.publishable, false);
    assert.equal(result.automation, "BLOCKED");
  }
  const drift = structuredClone(inputs[0]!);
  drift.matchRating += 1;
  assert.equal(assessEventsLivePackage(drift, reviewTime(drift)).reason, "CARD_OR_METRIC_PROVENANCE_CONFLICT");
});
test("wrong scorer attribution and own-goal beneficiary cannot pass", () => {
  const drift = structuredClone(inputs.find(input => input.artId === "FULL_TIME")!);
  drift.goals[1]!.playerName = "Wrong Synthetic Scorer";
  assert.equal(assessEventsLivePackage(drift, reviewTime(drift)).reason, "SCORER_LIST_CONFLICT");
  const own = structuredClone(inputs.find(input => input.artId === "OWN_GOAL")!);
  own.destinations[0]!.beneficiaryProviderTeamId = SYNTHETIC_TEAMS.away;
  assert.equal(assessEventsLivePackage(own, reviewTime(own)).reason, "DESTINATION_IDENTITY_CONFLICT");
});
test("expired review and duplicate placement require fresh evidence", () => {
  const drift = structuredClone(inputs[0]!);
  assert.equal(assessEventsLivePackage(drift, Date.parse(drift.validUntil)).reason, "FACTUAL_REVIEW_EXPIRED");
  drift.destinations[1] = drift.destinations[0]!;
  assert.equal(assessEventsLivePackage(drift, reviewTime(drift)).reason, "DESTINATION_IDENTITY_CONFLICT");
});
test("missing membership, incomplete settlement and absent corroboration fail closed", () => {
  const mutations: [string, (input: EventsLivePackageInput) => void, string][] = [
    ["membership", input => { input.factualData.cardPublication.membership_status = ""; }, "CARD_OR_METRIC_PROVENANCE_CONFLICT"],
    ["coverage", input => { input.factualData.settlement.scoring_coverage_status = "incomplete"; }, "CARD_OR_METRIC_PROVENANCE_CONFLICT"],
    ["external sources", input => { input.factualData.externalSources = []; }, "DATED_CAPTION_OR_EXTERNAL_SOURCE_REQUIRED"],
  ];
  for (const original of inputs) for (const [label, mutate, reason] of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(assessEventsLivePackage(changed, reviewTime(changed)).reason, reason, `${original.artId}:${label}`);
  }
});
test("synthetic unit evidence cannot enter the official publication source gate", async () => {
  const sha = `sha256:${"a".repeat(64)}`;
  const input = inputs[0]!;
  const media: StudioMedia = {
    artId: input.artId, placement: "FEED", version: "synthetic-test-only", filePath: "artifacts/social-studio/test/video.mp4", sha256: sha,
    objectKey: `v1/GOAL_CONFIRMED/FEED/${"a".repeat(64)}.mp4`, byteSize: 1024, etag: "test-only",
    width: 1080, height: 1350, durationSeconds: 6, caption: input.caption,
    verification: { reportPath: "artifacts/social-studio/test/probe.json", reportSha256: sha },
    provenance: { source: SYNTHETIC_EVENTS_SOURCE, competitionId: "00000000-0000-4000-8000-000000000101", seasonId: "00000000-0000-4000-8000-000000000102",
      fixtureIds: [input.evidence.fixtureId], teamIds: [input.factualData.cardPublication.current_club_id], playerIds: [input.evidence.playerId],
      fetchedAt: input.fetchedAt, asOf: input.asOf, validUntil: input.validUntil,
      snapshotPath: "artifacts/social-studio/test/snapshot.json", snapshotSha256: sha },
  };
  await assert.rejects(verifyStudioPublishedSource(media, input, async () => {
    assert.fail("Synthetic data must be rejected before canonical reads");
  }, SYNTHETIC_EVENTS_NOW), /OFFICIAL_SOURCE_NOT_ALLOWED/);
  // A forged official outer label cannot hide synthetic nested lineage.
  const officialEnvelope = structuredClone(media);
  officialEnvelope.provenance.source = "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW";
  assert.doesNotThrow(() => validateStudioOfficialDeclaration(officialEnvelope));
  await assert.rejects(verifyStudioPublishedSource(officialEnvelope, {
    ...officialEnvelope.provenance, factualData: { lineage: input.factualData.lineage },
  }, async () => {
    assert.fail("Nested synthetic lineage must be rejected before canonical reads");
  }, SYNTHETIC_EVENTS_NOW), /OFFICIAL_SOURCE_NOT_ALLOWED/);
});
test("a 0.166s partial video cannot pass a requested six-second render", () => {
  const expected = { sha256: "sha256:test", width: 1080, height: 1350, fps: 12, seconds: 6 };
  const report = { artifactSha256: expected.sha256, decoder: "avfoundation", codec: "h264", width: 1080, height: 1350,
    durationSeconds: 6, decodedFrames: 72, distinctFrames: 72, decoderCompleted: true, firstPresentationSeconds: 0, lastPresentationSeconds: 71 / 12 };
  assert.equal(assertEventsLiveDecode(report, expected).decodedFrames, 72);
  assert.throws(() => assertEventsLiveDecode({ ...report, durationSeconds: 1 / 6, decodedFrames: 2 }, expected));
  assert.throws(() => assertEventsLiveDecode({ ...report, artifactSha256: "different" }, expected));
  assert.equal(assertEventsLiveDecode(report, expected).loopSeamReviewed, false);
});
test("premium adapter preserves 043 classes without live card or fabricated aggregate", async () => {
  const source = await readFile(new URL("../components/touchline/social/TouchlineSocialEventsLiveGoalHat.tsx", import.meta.url), "utf8");
  for (const required of ["rankingStyles.hatStory", "rankingStyles.hatCardFrame", "localStyles.pointsValue", "localStyles.celebrationWordGold", "TouchlineSocialFixtureScoreboard", "TouchlineSocialApprovedExactCard", "MATCH REWIND"]) assert.ok(source.includes(required));
  for (const forbidden of ["squadCardToExactPlayer", "LIVE MATCH MOMENT", "draft.totalRating.toFixed", "firstObservedAt:", "@/components/touchline/cards/"]) assert.ok(!source.includes(forbidden));
});
test("seam distinguishes pixel contamination from exact geometric drift", () => {
  const joins = { start: "actual-start", mid: "actual-mid", end: "actual-start", "second-mid": "actual-mid", "second-loop": "actual-start" };
  const geometry = Object.fromEntries(Object.keys(joins).map(phase => [phase, [{ tag: "IMG", x: 52, y: 70, width: 80, height: 80 }]]));
  const frame = new Uint8Array(300), changed = new Uint8Array(300).fill(255);
  const equal = compareEventsLivePixels(frame, frame, 10, 10), different = compareEventsLivePixels(frame, changed, 10, 10);
  const pixels = { firstSeam: equal, secondSeam: equal, repeatedMid: equal, motion: different };
  assert.equal(assessEventsLiveSeam(joins, geometry, pixels).passed, true);
  const dirty = assessEventsLiveSeam({ ...joins, end: "actual-start-plus-dev-indicator" }, geometry, { ...pixels, firstSeam: different });
  assert.equal(dirty.passed, false);
  assert.equal(dirty.checks.firstSeamPixelsSafe, false);
  assert.equal(dirty.checks.firstSeamGeometryEqual, true);
  const drift = structuredClone(geometry); drift.end![0]!.x += 0.001;
  assert.equal(assessEventsLiveSeam(joins, drift, pixels).checks.firstSeamGeometryEqual, false);
  assert.equal(assessEventsLiveSeam({ ...joins, mid: joins.start, "second-mid": joins.start }, geometry, { ...pixels, motion: equal }).passed, false);
  assert.equal(assessEventsLiveSeam({}, {}).passed, false);
});
test("043 lower card labels keep a readable inset above the decorative jewel", async () => {
  const [component, css, frozenCard] = await Promise.all([
    readFile(new URL("../components/touchline/social/TouchlineSocialEventsLiveGoalHat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/social/TouchlineSocialEventsLiveGoalHat.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/social/TouchlineSocialApprovedExactCard.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok(component.includes("className={ownStyles.cardInformation}"), "refinement must be scoped to this 043 card instance");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector}{`);
    assert.ok(start >= 0, `missing scoped rule: ${selector}`);
    return css.slice(start + selector.length + 1, css.indexOf("}", start));
  };
  const pixels = (declarations: string, property: string) => Number(new RegExp(`(?:^|;)${property}:(\\d+)px(?:!important)?(?:;|$)`).exec(declarations)?.[1]);
  const row = rule(".cardInformation>div:last-child");
  assert.ok(pixels(row, "bottom") >= 140, "information must clear the lower jewel instead of crossing it");
  assert.ok(pixels(row, "left") >= 52 && pixels(row, "right") >= 52, "labels need inset from the sloping frame");
  assert.ok(pixels(row, "font-size") >= 16, "values must remain legible at feed size");
  assert.ok(pixels(rule(".cardInformation>div:last-child small"), "font-size") >= 12, "the former 8px micro-labels are insufficient");
  assert.ok(frozenCard.includes("bottom: 48") && frozenCard.includes("fontSize: 8"), "approved shared card stays unchanged");
  assert.ok(!/\.cardInformation[^{}]*img[^{}]*\{/.test(css), "do not recolour the card image to compensate for encoder channels");
});
