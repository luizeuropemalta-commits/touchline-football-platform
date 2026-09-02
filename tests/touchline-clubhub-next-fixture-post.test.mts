import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/visual-qa/clubhub-next-fixture-post/page.tsx", "utf8");
const previewDraft = readFileSync("app/visual-qa/clubhub-next-fixture-post/preview-draft.ts", "utf8");
const icons = readFileSync("lib/touchlineArena/social-copy-icons.ts", "utf8");
const snapshot = readFileSync("app/visual-qa/clubhub-premium-redesign/qa-canonical-snapshot.json", "utf8");
const exactCard = readFileSync("components/touchline/cards/TouchlineEliteExactCard.tsx", "utf8");
const matchPreview = readFileSync("components/touchline/social/TouchlineSocialMatchPreviewDraft.tsx", "utf8");
const duelContract = readFileSync("lib/touchlineArena/social-duel-frame.ts", "utf8");
const clubHub = readFileSync("components/touchline/club-hub/ClubHubPremiumPrototype.tsx", "utf8");

test("next-fixture post preview is local-only and outbound-disabled", () => {
  assert.match(page, /VERCEL_ENV === "production"/);
  assert.match(page, /LOCAL VISUAL QA · NOT PUBLISHED/);
  assert.match(page, /<dd>Disabled<\/dd>/);
});

test("post preview uses the verified fixture, leaders and ratings", () => {
  assert.match(page, /Arsenal v Chelsea/);
  assert.match(snapshot, /"name": "Emirates Stadium"/);
  assert.match(snapshot, /"name": "Bukayo Saka"/);
  assert.match(snapshot, /"name": "João Pedro"/);
  assert.match(snapshot, /"totalRating": 15\.5/);
  assert.match(snapshot, /"totalRating": 16\.45/);
  assert.match(previewDraft, /Who comes out on top\?/);
  assert.match(previewDraft, /qa-canonical-snapshot\.json/);
  assert.match(page, /readClubHubNextFixturePreview/);
});

test("shared social icon vocabulary is reusable and public copy has no provider wording", () => {
  assert.match(icons, /TOUCHLINE_SOCIAL_COPY_ICONS/);
  assert.doesNotMatch(page, /SportMonks|provider wording|API wording/);
});

test("static social cards do not double-apply the scaled preview transform", () => {
  assert.match(exactCard, /if \(hasStaticRenderScale\) return;[\s\S]*?new ResizeObserver\(resize\)/);
});

test("duel title identifies one current leader from each club rather than the overall ranking", () => {
  assert.match(duelContract, /heading: "CLUB LEADERS HEAD-TO-HEAD"/);
  assert.match(duelContract, /leaderLabel: "CURRENT CLUB LEADER"/);
  assert.match(matchPreview, /TOUCHLINE_SOCIAL_DUEL_FRAME\.heading/);
  assert.doesNotMatch(matchPreview, /LEADING TOUCHLINE CARDS/);
});

test("the exact canonical draft is embedded in the local Arsenal ClubHub with like and share actions", () => {
  assert.match(clubHub, /data-clubhub-preview="match-preview"/);
  assert.match(clubHub, /data-source-checksum=\{featuredPost\.draft\.sourceChecksum\}/);
  assert.match(clubHub, /TouchlineSocialMatchPreviewDraftView draft=\{featuredPost\.draft\}/);
  assert.match(clubHub, /<ClubHubLikeButton \/>/);
  assert.match(clubHub, /<ClubHubShareButton/);
});
