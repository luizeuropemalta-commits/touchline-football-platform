import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const css = source.split("<style>{`")[1].split("`}</style>")[0];
const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

test("stadium cover avoids a viewport-sized backdrop while retaining its own artwork", () => {
  assert.match(rule(".club-hub-hero"), /backdrop-filter: none;/);
  assert.match(rule(".club-hub-hero"), /isolation: isolate;/);
  assert.match(rule(".club-hub-hero"), /radial-gradient/);
  assert.match(rule(".club-hub-hero-image"), /object-fit: cover;/);
  assert.match(rule(".club-hub-hero-image"), /animation-play-state: var\(--touchline-decoration-motion, paused\);/);
});

test("ClubHub reserves in-flow areas for identity, official channels and honours", () => {
  assert.match(rule(".club-hub-hero"), /display: grid/);
  assert.match(rule(".club-hub-hero"), /grid-template-areas: "identity channels" "honours channels"/);
  assert.match(rule(".club-hub-identity"), /grid-area: identity/);
  for (const [selector, area] of [[".club-hub-hero-footer", "honours"], [".club-hub-hero-channels", "channels"]]) {
    assert.match(rule(selector), new RegExp(`grid-area: ${area}`));
    assert.match(rule(selector), /position: relative/);
    assert.doesNotMatch(rule(selector), /position: absolute|(?:top|right|bottom|left):/);
  }
});

test("tablet and landscape retain desktop columns without restoring the three-child flex row", () => {
  const tablet = css.split("@media (max-width: 980px)")[1].split("@media")[0];
  const landscape = css.split("@media (orientation: landscape)")[1].split("@media")[0];
  assert.match(tablet, /grid-template-areas: "identity channels" "honours channels"/);
  assert.match(landscape, /grid-template-areas: "identity channels" "honours channels"/);
  assert.doesNotMatch(landscape, /\.club-hub-hero,\s*\.club-hub-identity/);
  assert.match(rule(".club-hub-identity h1"), /overflow-wrap: anywhere/);
});

test("small landscape phones retain two columns with a fitted left identity", () => {
  const small = css.split("@media (orientation: landscape) and (max-width: 720px) and (max-height: 520px)")[1]?.split("@media")[0];
  assert.ok(small, "small landscape needs an explicit readable layout");
  assert.match(small, /grid-template-columns: minmax\(0, 1fr\) minmax\(240px, 300px\)/);
  assert.match(small, /grid-template-areas: "identity channels" "honours channels"/);
  assert.match(small, /\.club-hub-logo-stack\s*\{\s*width: 100px/);
  assert.match(small, /flex-direction: column; align-items: flex-start/);
});


test("cover channels keep their own lower-right area without expanding the mobile cover", () => {
  const channels = rule(".club-hub-hero-channels");
  assert.match(channels, /align-self: end/);
  assert.match(channels, /justify-self: end/);
  assert.match(channels, /width: min\(100%, 350px\)/);
  const tablet = css.split("@media (max-width: 980px)")[1].split("@media")[0];
  assert.match(tablet, /\.club-hub-hero-channels\s*\{[^}]*justify-self: end/);
  assert.doesNotMatch(tablet.split(".club-hub-hero-channels {")[1].split("}")[0], /520px|margin: 0 auto|align-self: auto/);
});


test("blocked portrait fallback reserves identity without lowering cover typography", () => {
  const portrait = css.split("@media (max-width: 480px) and (orientation: portrait)")[1].split("@media")[0];
  assert.match(portrait, /grid-template-areas: "identity" "honours" "channels"/);
  const channelCss = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.module.css", import.meta.url), "utf8");
  assert.match(channelCss, /\.cover \.copy h2 \{ font-size: 14px;/);
  assert.match(channelCss, /\.cover \.copy p \{ font-size: 12px;/);
  assert.match(channelCss, /\.cover a \{\s*min-width: 44px;/);
  assert.doesNotMatch(channelCss, /\.channel a:(?:hover|focus-visible)/);
  const component = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.tsx", import.meta.url), "utf8");
  assert.match(component, /import controls from "\.\/TouchlineGlobalNavigation\.module\.css"/);
  assert.match(component, /<a className=\{controls\.link\}/);
});
