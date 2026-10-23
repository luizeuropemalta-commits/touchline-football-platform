import { useState } from "react";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { TouchlinePlayerSeasonScope, TouchlineSeasonExactCard, TouchlineSeasonCardZoom, TouchlineSeasonValue, TouchlineSeasonStat } from "../../components/touchline/cards/TouchlinePlayerSeasonScope";
import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import { TouchlineCoachProfilePublication, TouchlineCoachProfileValue } from "../../components/touchline/TouchlineCoachProfilePublication";
import ClubHubPositionLeaders from "../../components/touchline/ClubHubPositionLeaders";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { TouchlineSportsPublication } from "../../lib/touchlineArena/sports-publication";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../../lib/touchlineArena/card-ranking-live";
import { touchlineLivePresentationStore } from "../../lib/touchlineArena/live-presentation-client-store";

// Read-only test observation; it neither subscribes nor requests a publication.
export const transportDigest = () => touchlineLivePresentationStore.getSnapshot()?.sportsPublication?.publication.contentDigest ?? null;

// Synthetic, read-only composition. These seeds never change after mounting;
// revisions must pass through the actual shared transport and parsers.
export default function PlayerSeasonPublicationBrowserFixture({ seed, seedless = false, serverSeed }: { seed: TouchlineSportsPublication; seedless?: boolean; serverSeed?: TouchlineSportsPublication }) {
  const [note, setNote] = useState("");
  const target = seed.playerRanking!.players.find(row => row.providerPlayerId === "106")!;
  const card: ClubOwnerSquadCard = { id: target.playerId, canonicalPlayerId: target.playerId, providerPlayerId: "106",
    name: "Synthetic Player A", shortName: "Synthetic A", position: "Striker", role: "ST", clubName: "Arsenal",
    shirtNumber: 9, countryCode3: "ENG", seasonTotalRating: target.totalRating, touchlinePoints: 0,
    marketValue: "€95M", marketValueState: "verified",
    editorialCard: { tierKey: "radiant-gold", marketValueEur: 95_000_000, marketValueState: "verified",
      cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-18T00:00:00Z" } };
  const other = seed.playerRanking!.players.find(row => row.providerPlayerId === "107")!;
  const otherCard = { ...card, id: other.playerId, canonicalPlayerId: other.playerId, providerPlayerId: "107", name: "Synthetic Player B", seasonTotalRating: other.totalRating };
  const player = squadCardToExactPlayer(card);
  const exactProps = { player, runtimeLocaleOverride: "en-GB", staticRenderScale: 140 / 430,
    subscribeToRanking: false, showSocialMetrics: false, showCardActions: false } as const;
  const latestServerSeed = serverSeed ?? seed;
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(seedless && !serverSeed ? TOUCHLINE_PRESEASON_RANKING_STATE : latestServerSeed.playerRanking, seedless && !serverSeed ? null : latestServerSeed.coachRanking)}
    expectedSeasonId={seed.playerRanking!.seasonId!} livePlayerUpdates liveCoachUpdates>
    <main style={{ padding: 16 }}>
      <p>ISOLATED SYNTHETIC PUBLICATION · no customer or provider connection</p>
      <label>Local note<input aria-label="Local note" value={note} onChange={event => setNote(event.target.value)} /></label>
      <TouchlinePlayerSeasonScope playerId={target.playerId} providerPlayerId="106" seasonId={seed.playerRanking!.seasonId} enabled>
        <div data-profile-total><TouchlineSeasonValue>42</TouchlineSeasonValue></div>
        <div data-profile-rank><TouchlineSeasonValue field="positionRank">#2</TouchlineSeasonValue></div>
        <TouchlineSeasonStat label="Season summary" seed={null} expectedSeasonId={seed.playerRanking!.seasonId}
          unavailable="—" availableClassName="stat-available" unavailableClassName="stat-unavailable" />
        <div data-profile-hero style={{ width: 140 }}><TouchlineSeasonExactCard {...exactProps} /></div>
        <div data-profile-zoom style={{ width: 140 }}>
          <TouchlineSeasonCardZoom ariaLabel="Open synthetic player" locale="en-GB"
            expandedContent={<TouchlineSeasonExactCard {...exactProps} staticRenderScale={1} />}
            details={{ title: "Synthetic Player A", fields: [
              { label: "Total rating", kind: "rating-total", group: "performance", value: "42" },
              { label: "Historical fixture", kind: "history", group: "performance", value: "Historical 7.2" },
            ] }}>
            <TouchlineSeasonExactCard {...exactProps} />
          </TouchlineSeasonCardZoom>
        </div>
      </TouchlinePlayerSeasonScope>
      <div data-gameweek style={{ width: 140 }}><TouchlineGameweekCard card={card} locale="en-GB" displayWidth={140} liveSeasonRating /></div>
      <TouchlineCoachProfilePublication coachProviderId="42" seed={null} seasonLabel="Synthetic season">
        <div data-coach-matches><TouchlineCoachProfileValue field="matches" /></div>
      </TouchlineCoachProfilePublication>
      <div data-club-leaders><ClubHubPositionLeaders cards={[card, otherCard]} seed={seed.playerRanking!} enabled locale="en-GB" /></div>
    </main>
  </TouchlineCardLeadershipProvider>;
}
