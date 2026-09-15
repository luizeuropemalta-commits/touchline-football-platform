import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessEventsLivePackage, assessEventsLivePresentation, assessEventsLiveReview, eventsLiveFrame, type EventsLivePackageInput } from "../lib/touchlineArena/social-events-live-contract.ts";
import { assessEventsLiveSeam, assertEventsLiveDecode, compareEventsLivePixels } from "../lib/touchlineArena/social-events-live-media-evidence.ts";

const inputs = JSON.parse(await readFile(new URL("../artifacts/social-studio/events/render-inputs-20260915.json", import.meta.url), "utf8")) as (EventsLivePackageInput & { caption: string })[];
const candidate = (artId: string) => structuredClone(inputs.find(input => input.artId === artId)!.evidence);

test("all five dated real match snapshots reconcile without granting automation", () => {
  for (const input of inputs) {
    const result = assessEventsLiveReview(input.evidence, Date.now());
    assert.equal(result.reviewable, true, `${input.artId}:${result.reason}`);
    assert.equal(result.publishable, false);
    assert.equal(result.automation, "BLOCKED");
    assert.equal(input.evidence.confirmationState, null);
    assert.equal(input.totalRating, null);
    assert.ok(input.caption.includes(input.dateLabel));
  }
});
test("own-goal author stays with Newcastle while Leeds receives the goal", () => {
  const fact = candidate("OWN_GOAL");
  assert.equal(fact.playerTeamId, "20");
  assert.equal(fact.events.find(event => event.id === "157918183")!.teamId, "71");
  fact.playerTeamId = "71";
  assert.equal(assessEventsLiveReview(fact, Date.now()).reason, "OWN_GOAL_CLUB_CONFLICT");
});
test("hat-trick excludes the own goal and requires three distinct goals by the same player", () => {
  const fact = candidate("HAT_TRICK_HERO");
  fact.eventIds[1] = "157716482";
  assert.equal(assessEventsLiveReview(fact, Date.now()).reviewable, false);
  const duplicate = candidate("HAT_TRICK_HERO");
  duplicate.eventIds[1] = duplicate.eventIds[0]!;
  assert.equal(assessEventsLiveReview(duplicate, Date.now()).reason, "THREE_CREDITED_GOALS_REQUIRED");
});
test("rescinded target and conflicting final score cannot render", () => {
  const red = candidate("RED_CARD_CONFIRMED");
  red.events.find(event => event.id === red.eventIds[0])!.addition = "Red card rescinded";
  assert.equal(assessEventsLiveReview(red, Date.now()).reviewable, false);
  const goal = candidate("GOAL_CONFIRMED"); goal.finalScore.home = 3;
  assert.equal(assessEventsLiveReview(goal, Date.now()).reason, "FINAL_SCORE_CONFLICT");
});
test("live fixture and unpublished card cannot masquerade as a dated retrospective", () => {
  const live = candidate("GOAL_CONFIRMED"); live.fixtureStatus = "LIVE";
  assert.equal(assessEventsLiveReview(live, Date.now()).reason, "FINAL_FIXTURE_REQUIRED");
  const unpublished = candidate("FULL_TIME"); unpublished.cardPublished = false;
  assert.equal(assessEventsLiveReview(unpublished, Date.now()).reason, "CANONICAL_PUBLISHED_CARD_REQUIRED");
});
test("frame phase repeats exactly without an endpoint pause", () => {
  assert.equal(eventsLiveFrame(6000), eventsLiveFrame(0));
  assert.equal(eventsLiveFrame(12000), eventsLiveFrame(0));
  assert.equal(eventsLiveFrame(6100), 100);
  assert.throws(() => eventsLiveFrame(NaN));
});

test("rendered score cannot diverge from the goal-time score in the snapshot", () => {
  const rendered = JSON.parse(JSON.stringify(inputs.find(input => input.artId === "GOAL_CONFIRMED")));
  assert.equal(assessEventsLivePresentation(rendered, Date.now()).reviewable, true);
  rendered.score = { home: 4, away: 1 };
  assert.equal(assessEventsLivePresentation(rendered, Date.now()).reason, "RENDERED_FACTS_CONFLICT");
});

test("fresh packages bind both social destinations, card and match settlement", () => {
  for (const input of inputs) assert.equal(assessEventsLivePackage(input, Date.now()).reviewable, true, input.artId);
  const drift = structuredClone(inputs[0]!);
  drift.matchRating += 1;
  assert.equal(assessEventsLivePackage(drift, Date.now()).reason, "CARD_OR_METRIC_PROVENANCE_CONFLICT");
});
test("wrong scorer attribution and own-goal beneficiary cannot pass", () => {
  const drift = structuredClone(inputs.find(input => input.artId === "FULL_TIME")!);
  drift.goals[1]!.playerName = "Dominic Calvert-Lewin";
  assert.equal(assessEventsLivePackage(drift, Date.now()).reason, "SCORER_LIST_CONFLICT");
  const own = structuredClone(inputs.find(input => input.artId === "OWN_GOAL")!);
  own.destinations[0]!.beneficiaryProviderTeamId = "20";
  assert.equal(assessEventsLivePackage(own, Date.now()).reason, "DESTINATION_IDENTITY_CONFLICT");
});
test("expired review and duplicate placement require fresh evidence", () => {
  const drift = structuredClone(inputs[0]!);
  assert.equal(assessEventsLivePackage(drift, Date.parse(drift.validUntil)).reason, "FACTUAL_REVIEW_EXPIRED");
  drift.destinations[1] = drift.destinations[0]!;
  assert.equal(assessEventsLivePackage(drift, Date.now()).reason, "DESTINATION_IDENTITY_CONFLICT");
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
