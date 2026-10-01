import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
function assertExactFilter(css: string, selector: string, expected: string) {
  const escapedSelector = normalize(selector).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const rule = css.match(new RegExp(`(?:^|[{}])\\s*${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `missing exact selector: ${selector}`);
  const filters = [...rule[1].matchAll(/(?:^|;)\s*filter\s*:\s*([^;]+);/g)];
  assert.equal(filters.length, 1, `expected one filter: ${selector}`);
  assert.equal(normalize(filters[0][1]), expected, selector);
}

test("ClubHub normal, hover and focus crests retain only their neutral shadows", () => {
  const profile = read("app/touchline-clubs/[club]/page.tsx");
  assertExactFilter(profile, ".club-hub-logo img", "drop-shadow(0 22px 34px rgba(0,0,0,.46))");
  assertExactFilter(profile, ".club-hub-logo-stack:hover .club-hub-logo img, .club-hub-logo-stack:focus-within .club-hub-logo img", "drop-shadow(0 24px 38px rgba(0,0,0,.5))");
});

test("crest filter guard rejects a coloured shadow split across lines", () => {
  const selector = ".club-hub-logo img";
  const black = "drop-shadow(0 22px 34px rgba(0,0,0,.46))";
  assert.throws(() => assertExactFilter(`${selector} { filter:\n${black}\n drop-shadow(\n0 0 15px\nvar(--club-accent)\n); }`, selector, black), assert.AssertionError);
});

test("ClubHub fixture crest wrapper adds no diffuse shadow above the shared crest image", () => {
  const css = read("components/touchline/ClubHubOfficialLineup.module.css");
  const rule = css.match(/(?:^|[{}])\s*\.matchupCrest\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule, "fixture crest rule must remain present");
  assert.match(rule, /width:\s*48px;/);
  assert.match(rule, /height:\s*48px;/);
  assert.match(rule, /object-fit:\s*contain;/);
  assert.doesNotMatch(rule, /(?:filter|box-shadow|text-shadow)\s*:/);
  assert.match(read("components/touchline/ClubHubOfficialLineup.tsx"), /className=\{styles\.matchupCrest\}/);
});

test("club crests have no coloured halo in shared cards and isolated social crests", () => {
  for (const path of ["app/globals.css", "components/touchline/cards/TouchlineCoachCard.module.css"]) {
    assert.doesNotMatch(read(path), /drop-shadow\([^;]*var\(--touchline-club-crest-color\)/, path);
  }
  for (const path of ["components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives.tsx", "components/touchline/social/TouchlineSocialApprovedFinalScoreDraft.tsx"]) {
    assert.doesNotMatch(read(path), /filter: `drop-shadow\(0 0 10px \$\{club.accent\}/, path);
  }
  assert.doesNotMatch(read("app/touchline-clubs/[club]/page.tsx"), /\.club-hub-logo-stack::before\s*\{[^}]*blur\(/);
  assert.doesNotMatch(read("components/touchline/match-centre/touchline-match-centre.module.css"), /drop-shadow\([^;]*var\(--team-mark-neon/);
  assert.match(read("app/touchline-coaches/[coach]/page.tsx"), /\.coach-profile-club img,\.coach-profile-club > svg\s*\{[^}]*filter:none/);
  assert.match(read("components/touchline/ClubHubNavigationPending.module.css"), /\.crest\s*\{[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(read("components/touchline/club-social/TouchlineClubSocialFeed.module.css"), /\.liveMedia img\s*\{[^}]*filter: none/);
  assert.match(read("components/touchline/social/TouchlineSocialEventsLiveFullTimeReview.module.css"), /\.side img\s*\{[^}]*filter: none/);
});

test("thin silhouette contour and unrelated card glow remain intact", () => {
  const contour = read("app/touchline-crest-visibility.css");
  for (const club of ["liverpool", "tottenham-hotspur", "nottingham-forest"]) assert.ok(contour.includes(club));
  assert.match(contour, /drop-shadow\(\.5px 0 0 #fff\)/);
  assert.match(read("app/globals.css"), /data-touchline-card-neon-trace/);
  assert.match(read("components/touchline/social/TouchlineSocialEventsLiveFullTimeReview.module.css"), /\.exactCard\s*\{[^}]*drop-shadow/);
});
