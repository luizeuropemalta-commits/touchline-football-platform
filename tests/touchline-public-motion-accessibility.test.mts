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
  assert.doesNotMatch(styles.slice(styles.indexOf(".freshnessNotice"), styles.indexOf(".return")), /animation:/);
  assert.match(styles, /@media \(max-width: 850px\) \{[\s\S]*?\.header > div \{ display: grid; \}[\s\S]*?\.header > div span \{ display: none; \}/);
});

test("Coming Soon stops its automatic timeline and videos for reduced motion", () => {
  const component = source("components/touchline/coming-soon/TouchlineComingSoonLanding.tsx");

  assert.match(component, /useState<MotionPreference>\("pending"\)/);
  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /media\.addEventListener\("change", syncPreference\)/);
  assert.match(component, /const displayPhase: TouchlineArenaIntroPhase = reducedMotion \? "reveal" : phase/);
  assert.match(component, /if \(motionPreference === "reduce"\) return;/);
  assert.match(component, /setCycle\(\(value\) => value \+ 1\), CYCLE_MS/);
  assert.match(component, /if \(reducedMotion\) \{[\s\S]*?entryVideoRef\.current\?\.pause\(\);[\s\S]*?loopVideoRef\.current\?\.pause\(\);[\s\S]*?return;/);
  assert.match(component, /transition: reducedMotion \? "none"/);
  assert.match(component, /backgroundColor: reducedMotion \? "#020604" : undefined/);
});

test("Club trophies remain manually operable without autoplay when reduced motion is preferred", () => {
  const component = source("components/touchline/ClubTrophyCarousel.tsx");

  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /if \(window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \{[\s\S]*?animationRef\.current = null;[\s\S]*?return;/);
  assert.match(component, /const nextOffset = \(manualOffsetRef\.current \+ direction \* manualStepDistance \+ setWidth\) % setWidth/);
  assert.match(component, /track\.style\.transform = `translate3d\(\$\{-nextOffset\}px, 0, 0\)`/);
  assert.match(component, /role="region"[\s\S]*?aria-roledescription="carousel"/);
  assert.match(component, /aria-controls=\{viewportId\}/);
});

test("ClubHub mobile profile controls retain a 44px target", () => {
  const page = source("app/touchline-clubs/[club]/page.tsx");
  const mobileStyles = page.slice(page.indexOf("@media (max-width: 720px)"));

  assert.match(mobileStyles, /\.club-hub-card-meta a \{[\s\S]*?min-height: 44px/);
});
