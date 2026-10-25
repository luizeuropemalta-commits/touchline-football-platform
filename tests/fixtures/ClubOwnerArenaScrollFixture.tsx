import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
export { createPortal as createArenaPortal } from "react-dom";
import ClubHubFixtureStrip from "../../components/touchline/ClubHubFixtureStrip";
import TouchlineCoachCardZoom from "../../components/touchline/cards/TouchlineCoachCardZoom";
import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import TouchlinePitchSurface from "../../components/touchline/pitch/TouchlinePitchSurface";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY, type TouchlineFormationGeometrySlot } from "../../lib/touchlineArena/formation-geometry";
import { touchlineFantasyPitchCardWidth } from "../../lib/touchlineFantasy/market-browser";
import type { TouchlineCoach } from "../../lib/football-data/types";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import styles from "../../app/fantasy/fantasy.module.css";
export { styles as arenaStyles };

const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"]!;
const coach: TouchlineCoach = { id: "synthetic-arena-coach", providerId: "990002", provider: "sportmonks", name: "Synthetic Arena Coach", displayName: "Synthetic Arena Coach", teamId: "19",
  source: { provider: "sportmonks", providerId: "990002", raw: { syntheticLayoutFixture: true } } };
const cards: ClubOwnerSquadCard[] = geometry.slots.map((slot, index) => ({
  id: `synthetic-arena-player-${index}`, canonicalPlayerId: `synthetic-arena-player-${index}`, name: `Synthetic Player ${index + 1}`,
  shortName: `Player ${index + 1}`, role: slot.role, position: slot.id, clubName: "Arsenal", shirtNumber: index + 1,
  countryCode3: "ENG", marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 1_000_000, marketValueState: "verified", cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-24T00:00:00Z" },
}));
const fixtures: TouchlinePublicFixture[] = Array.from({ length: 10 }, (_, index) => ({ id: `9900${index}`, providerId: `9900${index}`, status: "FT", startsAt: "2026-10-23T15:00:00Z",
  homeTeam: { id: `${index * 2 + 1}`, providerId: `${index * 2 + 1}`, name: `Synthetic Home ${index}`, shortCode: "HOM" },
  awayTeam: { id: `${index * 2 + 2}`, providerId: `${index * 2 + 2}`, name: `Synthetic Away ${index}`, shortCode: "AWY" }, homeScore: 2, awayScore: 2 }));

// Geometry-only composition: real components/CSS, synthetic identities and no
// account. ArenaBoundary and position() are extracted from production AST by
// the test; their portal, focus, body lock and Escape logic are not duplicated.
export default function ClubOwnerArenaScrollFixture({ ArenaBoundary, position }: {
  ArenaBoundary: ComponentType<{ expanded: boolean; label: string; onClose(): void; children: ReactNode }>;
  position(slot: TouchlineFormationGeometrySlot): CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(48);
  const pitchContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pitch = pitchContainer.current?.querySelector<HTMLElement>(`[data-fixture-pitch] > .${styles.myClubTacticalPitch}`);
    if (!pitch) return;
    const update = () => setWidth(touchlineFantasyPitchCardWidth(geometry.slots, pitch.offsetWidth, pitch.offsetHeight, { labelHeight: 18, gap: 6 }));
    update(); const observer = new ResizeObserver(update); observer.observe(pitch);
    return () => observer.disconnect();
  }, [expanded]);
  const coachCard = <TouchlineCoachCardZoom coach={coach} slot={createTouchlineArenaCoachSlot(coach, 1, "sapphire-blue")} clubName="Arsenal" locale="en-GB" contract={null}
    competition={null} liveCompetitionUpdates profileHref="/touchline-coaches/990002?lang=en-GB" assetLoading="eager" showLeadershipCrown />;
  return <>
    <button type="button" data-arena-open="true" onClick={() => setExpanded(true)}>Open Arena fixture</button>
    <ArenaBoundary expanded={expanded} label="Arena geometry fixture" onClose={() => setExpanded(false)}>
      <section className={styles.myClubSquad}>
        <div className={styles.arenaBody}>
          <div className={styles.arenaLiveRail}><ClubHubFixtureStrip locale="en-GB" initialFixtures={fixtures} initialNow={Date.parse("2026-10-24T00:00:00Z")} /></div>
          <div ref={pitchContainer} className={styles.myClubPitchViewport} data-fixture-pitch>
            <div className={styles.arenaToolbar} data-arena-toolbar="true">
              <div className={styles.arenaFormationControl} data-arena-formation="true">
                <details className={styles.formationPicker}>
                  <summary>Choose formation<strong>4-3-3</strong></summary>
                  <div className={styles.formationSelectionPanel}>
                    <div className={styles.formationCoachPreview}>{coachCard}</div>
                    <div className={styles.formationChoices}>{Object.keys(TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY).map(code => <button key={code} type="button"><b>{code}</b><small>11 slots</small></button>)}</div>
                  </div>
                </details>
              </div>
              <div className={styles.arenaHudRight} data-arena-hud-right="true">
                <button className={styles.viewToggle} type="button" data-arena-close="true" onClick={() => setExpanded(false)}>Close Arena</button>
                <output className={styles.arenaRoundPoints}><span>Round points</span><strong>0.00</strong></output>
              </div>
              <div className={styles.arenaCoach} data-arena-coach="true"><div style={{ width }}>{coachCard}</div><span>Coach</span></div>
            </div>
            <TouchlinePitchSurface className={styles.myClubTacticalPitch} ariaLabel="Arena fixture pitch" orientation="horizontal" surfaceVariant="smoked-glass">
              {geometry.slots.map((slot, index) => <div className={styles.myClubTacticalSlot} data-arena-slot={slot.id} key={slot.id} style={{ ...position(slot), width: Math.max(44, width) }}>
                <span style={{ width, "--touchline-card-static-scale": width / 430 } as CSSProperties}><TouchlineGameweekCard card={cards[index]} locale="en-GB" compact displayWidth={width} /></span><b>{slot.id}</b>
              </div>)}
            </TouchlinePitchSurface>
          </div>
        </div>
      </section>
    </ArenaBoundary>
  </>;
}
