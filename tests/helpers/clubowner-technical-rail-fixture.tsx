import ClubOwnerTechnicalRail from "../../components/touchline/fantasy/ClubOwnerTechnicalRail";
import { ClubOwnerCollectionSlots } from "../../components/touchline/fantasy/ClubOwnerCollectionSlots";
import TouchlineCoachCardZoom from "../../components/touchline/cards/TouchlineCoachCardZoom";
import type { TouchlineCoach } from "../../lib/football-data/types";
import { createTouchlineArenaCoachSlot } from "../../lib/touchlineArena/coach-card";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { ClubOwnedPlayer } from "../../lib/touchlineFantasy/club-acquisition";
import collection from "../../components/touchline/fantasy/ClubOwnerCollectionSlots.module.css";
import fantasy from "../../app/fantasy/fantasy.module.css";
import type { ComponentType, ReactNode } from "react";
import ClubHubFixtureStrip from "../../components/touchline/ClubHubFixtureStrip";
import TouchlinePitchSurface from "../../components/touchline/pitch/TouchlinePitchSurface";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
export { createPortal as createArenaPortal } from "react-dom";
export { fantasy as arenaStyles };

// Synthetic identities are confined to this isolated layout fixture. Production
// slot/card/coach components and CSS are rendered; no account or market writes.
const catalogue: ClubOwnerSquadCard[] = Array.from({ length: 9 }, (_, index) => ({
  id: `rail-player-${index}`, canonicalPlayerId: `rail-player-${index}`, name: `Synthetic Reserve ${index + 1}`,
  shortName: `Reserve ${index + 1}`, role: "midfielder", position: "Central Midfield", clubName: "Arsenal", shirtNumber: index + 1,
  countryCode3: "ENG", marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 1_000_000, marketValueState: "verified",
    cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-03T00:00:00Z" },
}));
const players: ClubOwnedPlayer[] = catalogue.map((card, slot) => ({ playerId: card.id, clubId: "Arsenal", position: "MID", valueEur: 1_000_000, area: "reserves", slot }));
const state = { players };
const noop = () => {};
const coach: TouchlineCoach = {
  id: "synthetic-rail-coach", provider: "sportmonks", providerId: "990001",
  name: "Synthetic Rail Coach", displayName: "Synthetic Rail Coach", teamId: "19",
  source: { provider: "sportmonks", providerId: "990001", raw: { syntheticLayoutFixture: true } },
};
const fixtures: TouchlinePublicFixture[] = Array.from({ length: 10 }, (_, index) => ({
  id: `9905${index}`, providerId: `9905${index}`, competitionId: "8", seasonId: "26000", roundId: "8", roundName: "8", status: "FT", startsAt: "2026-10-23T15:00:00Z",
  homeTeam: { id: "19", providerId: "19", name: `Synthetic Home ${index}` },
  awayTeam: { id: "236", providerId: "236", name: `Synthetic Away ${index}` }, homeScore: 2, awayScore: 1,
}));

export default function TechnicalRailFixture({ width, direction = "ltr", enabled = true, arenaOpen = false, ArenaBoundary }: {
  width: number; direction?: "ltr" | "rtl"; enabled?: boolean; arenaOpen?: boolean;
  ArenaBoundary: ComponentType<{ expanded: boolean; label: string; onClose(): void; children: ReactNode }>;
}) {
  const picker = <details data-test-formation="true"><summary>Formation</summary><button type="button">4-3-3</button></details>;
  return <section className={fantasy.myClubCommand} data-fantasy-context="market" dir={direction} style={{ padding: 0 }}>
    <div className={fantasy.myClubCommandGrid}>
    <ArenaBoundary expanded={arenaOpen} label="Technical rail Arena fixture" onClose={noop}>
    <section className={fantasy.myClubSquad}>
    <div className={fantasy.arenaBody}>
    <div className={fantasy.arenaLiveRail} data-clubowner-live-position="above-reserves">
      <ClubHubFixtureStrip initialFixtures={fixtures} initialAdmissionScope={{ competitionId: "8", seasonId: "26000" }} initialNow={Date.parse("2026-10-24T00:00:00Z")} initialTimeZone="UTC" locale="en-GB" />
    </div>
    <div className={fantasy.myClubPitchViewport}>
      {/* Real production portal/lifecycle is provided from AST. This remains
          an isolated geometry composition, not an authenticated XI simulation. */}
      {!arenaOpen ? <ClubOwnerTechnicalRail enabled={enabled} cardWidth={width} label="Technical area">
        <div className={`${fantasy.myClubFieldCoach} ${collection.technicalRow}`} data-technical-test-row="true">
          <ClubOwnerCollectionSlots state={state} catalogue={catalogue} area="reserves" start={0} count={4} locale="en-GB" displayWidth={width} enabled onChoose={noop} />
          <div className={fantasy.technicalCoachCard} data-technical-coach="true" style={{ width: width * 1.3 }}>
            <TouchlineCoachCardZoom coach={coach} slot={createTouchlineArenaCoachSlot(coach, 1, "sapphire-blue")}
              clubName="Arsenal" locale="en-GB" contract={null} competition={null} liveCompetitionUpdates
              profileHref="/touchline-coaches/990001?lang=en-GB" assetLoading="eager" showLeadershipCrown
              acquisitionPrice={{ label: "Signing value", valueTc: 10_000_000 }} />
            <span>Coach</span>
          </div>
          <ClubOwnerCollectionSlots state={state} catalogue={catalogue} area="reserves" start={4} count={5} locale="en-GB" displayWidth={width} enabled onChoose={noop} />
        </div>
        <div className={`${fantasy.myClubTechnicalLine} ${collection.technicalLine}`} data-technical-test-line="true"><span>Technical area</span></div>
      </ClubOwnerTechnicalRail> : null}
      {!arenaOpen ? picker : <div className={fantasy.arenaToolbar} data-test-arena="true">
        <div className={fantasy.arenaFormationControl}>{picker}</div>
        <div className={fantasy.arenaHudRight}><button className={fantasy.viewToggle} type="button" data-arena-close="true">Close Arena fixture</button></div>
      </div>}
      <TouchlinePitchSurface className={fantasy.myClubTacticalPitch} ariaLabel="Technical rail pitch fixture" orientation="horizontal" surfaceVariant="smoked-glass"><span /></TouchlinePitchSurface>
    </div>
    </div>
    </section>
    </ArenaBoundary>
    </div>
  </section>;
}
