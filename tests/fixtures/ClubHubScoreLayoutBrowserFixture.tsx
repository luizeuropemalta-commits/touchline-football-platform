import ClubHubOfficialLineup from "../../components/touchline/ClubHubOfficialLineup";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
import { touchlineLivePresentationStore } from "../../lib/touchlineArena/live-presentation-client-store";

export const transportDigest = () => touchlineLivePresentationStore.getSnapshot()?.sportsPublication?.publication.contentDigest ?? null;

/** Synthetic public fixture only; real lineup, score, shared transport and crests. */
export default function ClubHubScoreLayoutBrowserFixture({ locale, fixture }: {
  locale: string; fixture: TouchlinePublicFixture;
}) {
  return <main className="club-hub-shell">
    <ClubHubOfficialLineup clubName="Isolated ClubHub" locale={locale} draftLocalesEnabled
      lineup={{ status: "preview", formation: "4-3-3", players: [] }}
      labels={{ nationality: "Country", points: "Points", totalPoints: "Total", cardPrice: "Value" }}
      liveUpdates liveSeasonRating={false}
      matchup={{ fixtureId: fixture.providerId, initialFixture: fixture,
        home: { name: "Arsenal", shortCode: "ARS", accent: "#ef0107", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png" },
        away: { name: "Chelsea", shortCode: "CHE", accent: "#034694", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png" },
        status: "SSR status must not duplicate shared status", startsAt: "Synthetic kickoff", startsAtIso: fixture.startsAt }} />
  </main>;
}
