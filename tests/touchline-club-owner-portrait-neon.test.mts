import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("the Club Owner portrait uses an opt-in fixed-green continuous perimeter trace", () => {
  const social = source("components/touchline/social/TouchlineSocial.tsx");
  const profile = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const trace = source("components/touchline/social/ClubOwnerPortraitPerimeterTrace.tsx");
  const css = source("components/touchline/social/TouchlineSocial.module.css");
  const ownerCss = css.slice(
    css.indexOf('.socialAvatar[data-club-owner-portrait-trace="touchline-logo-green"] {'),
    css.indexOf("@keyframes club-owner-portrait-perimeter-trace"),
  );
  const traceCss = css.slice(
    css.indexOf('[data-club-owner-portrait-neon-trace="true"] {'),
    css.indexOf("@keyframes club-owner-portrait-perimeter-trace"),
  );

  assert.match(profile, /const CLUB_OWNER_TOUCHLINE_NEON = "#a3ff12"/);
  assert.match(profile, /accent=\{CLUB_OWNER_TOUCHLINE_NEON\}[\s\S]*?clubOwnerPortraitTrace/);
  assert.match(social, /clubOwnerPortraitTrace = false/);
  assert.match(social, /data-club-owner-portrait-trace=\{clubOwnerPortraitTrace \? "touchline-logo-green" : undefined\}/);
  assert.match(social, /\{clubOwnerPortraitTrace \? <ClubOwnerPortraitPerimeterTrace \/> : null\}[\s\S]*?className=\{styles\.socialAvatarPhoto\}/);
  assert.match(trace, /data-club-owner-portrait-neon-trace="true"/);
  assert.match(trace, /aria-hidden="true"/);
  assert.match(trace, /focusable="false"/);
  assert.match(trace, /pathLength="100"/);
  assert.match(trace, /fill="none"/);
  assert.match(trace, /data-club-owner-portrait-neon-trace-base="true"/);
  assert.match(trace, /data-club-owner-portrait-neon-trace-run="true"/);
  assert.match(trace, /r="46\.5"/);
  assert.match(ownerCss, /--club-owner-portrait-trace-color: #a3ff12/);
  assert.match(traceCss, /overflow: visible/);
  assert.match(traceCss, /pointer-events: none/);
  assert.match(traceCss, /stroke-dasharray: 2 98/);
  assert.doesNotMatch(traceCss, /mask|clip-path|filter:|overflow: hidden|var\(--social-accent\)/);
  assert.match(css, /\.socialAvatarPhoto \{[\s\S]*?overflow: hidden/);
  assert.doesNotMatch(traceCss, /touch-action:\s*none/);
  assert.match(css, /@keyframes club-owner-portrait-perimeter-trace \{[\s\S]*?9% \{ stroke-dasharray: 14 86; opacity: \.82; \}[\s\S]*?71% \{ stroke-dasharray: 16 84; stroke-dashoffset: -74; opacity: \.72; \}[\s\S]*?100% \{ stroke-dasharray: 100 0; stroke-dashoffset: -100; opacity: \.28; \}/);
});

test("the Club Owner portrait trace keeps hover, reduced-motion and photo boundaries safe", () => {
  const css = source("components/touchline/social/TouchlineSocial.module.css");
  const globalCss = source("app/globals.css");
  const hoverStart = css.indexOf(
    "@media (hover: hover) and (pointer: fine)",
    css.indexOf("@keyframes club-owner-portrait-perimeter-trace"),
  );
  const hoverScope = css.slice(hoverStart, css.indexOf(".socialCardVisual", hoverStart));
  const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

  assert.match(hoverScope, /\.socialAvatar:not\(\[data-club-owner-portrait-trace\]\):hover/);
  assert.match(hoverScope, /data-club-owner-portrait-trace="touchline-logo-green"\]:hover \{[\s\S]*?translateY\(-2px\)/);
  assert.match(hoverScope, /:hover \[data-club-owner-portrait-neon-trace-run="true"\][\s\S]*?animation: club-owner-portrait-perimeter-trace 1500ms cubic-bezier\(\.22,\.74,\.28,1\) both/);
  assert.match(css, /:focus-within \[data-club-owner-portrait-neon-trace-run="true"\]/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?data-club-owner-portrait-trace="touchline-logo-green"\]:active \{[\s\S]*?translateY\(-2px\)/);
  assert.match(css, /:active \[data-club-owner-portrait-neon-trace-run="true"\][\s\S]*?animation: club-owner-portrait-perimeter-trace 1500ms cubic-bezier\(\.22,\.74,\.28,1\) both/);
  assert.match(reducedMotion, /\[data-club-owner-portrait-neon-trace-run="true"\] \{ animation: none !important; opacity: 0; \}/);
  assert.match(reducedMotion, /\[data-club-owner-portrait-neon-trace-base="true"\] \{ opacity: \.76; \}/);
  assert.match(reducedMotion, /data-club-owner-portrait-trace="touchline-logo-green"\] \{ transform: none !important; \}/);
  assert.doesNotMatch(reducedMotion, /touch-action:\s*none/);
  // Card/crest touch elevation was delivered in the preceding card-trace
  // checkpoint. Validate that contract here instead of adding a parallel rule.
  assert.match(globalCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.touchline-card-surface\[data-card-motion="true"\]:hover \[data-touchline-card-crest="true"\][\s\S]*?translate3d\(0, -1px, 0\)/);
  assert.match(globalCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.touchline-card-surface\[data-card-motion="true"\]\[data-neon-active="true"\] \{[\s\S]*?scale\(1\.028\)/);
  assert.match(globalCss, /touch-action: manipulation/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.touchline-card-surface\[data-card-motion="true"\]:hover,[\s\S]*?transform: none !important/);
});
