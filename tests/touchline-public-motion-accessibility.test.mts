import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Match Centre exposes one page heading, a selected-fixture state and motion-safe panel scroll", () => {
  const component = source("components/touchline/match-centre/TouchlineMatchCentre.tsx");
  const styles = source("components/touchline/match-centre/touchline-match-centre.module.css");

  assert.equal((component.match(/<h1\b/g) ?? []).length, 1);
  assert.match(component, /<h1 className=\{styles\.title\}>\{dictionary\.title\}<\/h1>/);
  assert.match(component, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(component, /className=\{styles\.freshnessNotice\} role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(component, /dictionary\.liveDataUpdating/);
  assert.match(component, /dictionary\.lastVerified/);
  assert.match(component, /aria-pressed=\{isSelected\}/);
  assert.match(component, /aria-controls=\{selected \? "touchline-match-panel" : undefined\}/);
  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
  assert.match(styles, /\.fixture:focus-visible, \.selectedFixture:focus-visible/);
  assert.match(styles, /\.selectionAnnouncement \{[\s\S]*?clip-path: inset\(50%\)/);
  assert.match(styles, /\.freshnessNotice \{[\s\S]*?border: 1px solid/);
  assert.match(styles, /\.hero::before \{[\s\S]*?official-live-pitch-1600\.webp[\s\S]*?pointer-events/);
  assert.doesNotMatch(styles.slice(styles.indexOf(".hero::before"), styles.indexOf(".hero[data-state=\"live\"]")), /animation:/);
  assert.doesNotMatch(styles.slice(styles.indexOf(".freshnessNotice"), styles.indexOf(".return")), /animation:/);
  assert.match(styles, /@media \(max-width: 850px\) \{[\s\S]*?\.header \{ grid-template-columns: 1fr auto;[^}]*\}[\s\S]*?\.headerTitle \{ display: none; \}[\s\S]*?\.headerSignal \{ min-width: 150px; \}/);
});

test("the public Arena introduction respects reduced motion", () => {
  const component = source("components/touchline/arena/TouchlineArenaIntro.tsx");

  assert.match(component, /useState<MotionPreference>\("pending"\)/);
  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /media\.addEventListener\("change", syncPreference\)/);
  assert.match(component, /touchlineArenaIntroTimeline\(reducedMotion\)/);
  assert.match(component, /revealRef\.current\(reducedMotion\)/);
  assert.match(component, /return \(\) => media\.removeEventListener\("change", syncPreference\)/);
});

test("Club trophies remain manually operable without autoplay when reduced motion is preferred", () => {
  const component = source("components/touchline/ClubTrophyCarousel.tsx");

  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /if \(prefersReducedMotion\) \{[\s\S]*?moveImmediately\(\);[\s\S]*?return;/);
  assert.match(component, /if \(!isCarousel \|\| prefersReducedMotion \|\| phase !== "idle"\) return;/);
  assert.match(component, /AUTO_ADVANCE_DELAY_MS/);
  assert.doesNotMatch(component, /track\.animate|iterations: Infinity/);
  assert.match(component, /role="region"[\s\S]*?aria-roledescription="carousel"/);
  assert.match(component, /aria-controls=\{viewportId\}/);
});

test("ClubHub mobile profile controls retain a 44px target", () => {
  const page = source("app/touchline-clubs/[club]/page.tsx");
  const mobileStyles = page.slice(page.indexOf("@media (max-width: 720px)"));

  assert.match(mobileStyles, /\.club-hub-card-meta a \{[\s\S]*?min-height: 44px/);
});
