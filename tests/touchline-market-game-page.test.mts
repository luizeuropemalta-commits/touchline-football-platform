import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Market is the authenticated game page, not a redirect to ClubOwner", () => {
  const page = source("app/clubowner/page.tsx");
  assert.match(page, /auth\.getUser\(/);
  assert.match(page, /isOwnerEmail\(user\.email\)/);
  assert.match(page, /loadTouchlineFantasySnapshot\(user\)/);
  assert.match(page, /<FantasyGameweekClient[\s\S]*embedded[\s\S]*marketPage/);
  assert.doesNotMatch(page, /ClubOwnerProfileRenderer|redirect\(`\/my-club|ArenaClient/);
});

test("avatar context captures configuration before auth, retains its error and supplies only confirmed stored media", () => {
  const page = source("app/clubowner/page.tsx");
  assert.ok(page.indexOf("const readAvatarContext = createClubOwnerAvatarContextReader()") < page.indexOf("const supabase = await createClient()"));
  assert.doesNotMatch(page, /getUser\(\)\.then\(\(\{ data \}\) => data\.user\)/);
  assert.match(page, /readAvatarContext\(authentication, user\.id\)/);
  assert.match(page, /resolveTouchlineClubOwnerPageIdentity\(user, undefined, avatarContext\?\.avatarUrl\)/);
  assert.doesNotMatch(page, /canUpload:\s*true|\.from\(["']users|ensureTouchlineArenaAccess/);
});

test("Market presentation preserves one XI editor and places the coach outside the pitch", () => {
  const client = source("app/fantasy/FantasyGameweekClient.tsx");
  assert.match(client, /surfaceVariant=\{marketPage \? "smoked-glass"/);
  assert.match(client, /data-market-technical-area="true"/);
  assert.match(client, /data-market-starting-xi="true"/);
  assert.match(client, /<TouchlinePitchSurface[^>]*>[\s\S]*selectedCards\.map/);
  assert.match(client, /fetch\("\/api\/touchline-fantasy\/lineup"/);
  assert.doesNotMatch(client, /<video/);
});

test("smoked glass is a static presentation with neon markings, not a video or blur layer", () => {
  const css = source("components/touchline/pitch/TouchlinePitchSurface.module.css");
  assert.match(css, /\.surfaceSmokedGlass\s*\{[^}]*--pitch-line:\s*#a3ff12/);
  const rule = css.match(/\.surfaceSmokedGlass\s*\{[^}]+\}/)?.[0] ?? "";
  assert.doesNotMatch(rule, /backdrop-filter|url\(|animation:|will-change/);
});
