import type { CSSProperties } from "react";

import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import type { TouchlineGeometryQaFixture } from "@/lib/touchlineArena/social-lineup-presentation-policy";

import styles from "./TouchlineSocialLineupGeometryQa.module.css";

/**
 * Geometry-only renderer. It intentionally cannot accept a real social draft
 * and contains no official club identity, crest or player-card component.
 */
export default function TouchlineSocialLineupGeometryQaView({
  fixture,
}: Readonly<{ fixture: TouchlineGeometryQaFixture }>) {
  return (
    <main
      className={styles.canvas}
      data-social-art="geometry-qa-not-publishable"
      data-fixture-kind={fixture.sourceProvenance}
      data-fixture-id={fixture.fixtureId}
      data-team-id={fixture.teamId}
    >
      <header className={styles.banner}>
        <span>GEOMETRY QA</span>
        <span>SYNTHETIC FIXTURE · NOT PUBLISHABLE</span>
      </header>
      <TouchlinePitchSurface
        className={styles.pitch}
        orientation="vertical"
        ariaLabel={`Geometry QA ${fixture.formation} synthetic field`}
      >
        {fixture.players.map((player) => (
          <div
            key={player.id}
            className={styles.player}
            style={{ "--qa-x": `${player.x}%`, "--qa-y": `${player.y}%` } as CSSProperties}
            data-geometry-placeholder-id={player.id}
          >
            {player.label}
          </div>
        ))}
      </TouchlinePitchSurface>
      <footer className={styles.footer}>
        {fixture.fixtureId} · {fixture.teamId} · {fixture.formation} · GEOMETRY ONLY
      </footer>
    </main>
  );
}
