import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "@/lib/touchlineArena/formation-geometry";
import { TOUCHLINE_LIVE_COACHES } from "@/lib/touchlineArena/live-coaches";
import { touchlineMarketPositionBucket } from "@/lib/touchlineArena/position-eligibility";
import { touchlineFantasySlotAcceptsPlayer } from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";

import { readVisualQaMarketCatalogue } from "./catalogue";
import styles from "./market-premium-pitch.module.css";

export const dynamic = "force-dynamic";

type VisualQaMarketPitchProps = Readonly<{
  searchParams: Promise<{
    surface?: string;
  }>;
}>;

const COACHES = TOUCHLINE_LIVE_COACHES.map(({ coach, countryCode3 }, index) => {
  const club = TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.teamId === coach.teamId);
  return {
    id: coach.providerId,
    coach,
    slot: createTouchlineArenaCoachSlot(coach, index + 1),
    clubId: club?.teamId ?? coach.teamId ?? "visual-qa",
    clubName: club?.name ?? "TouchLine England",
    clubLogoUrl: club?.logoUrl ?? null,
    countryCode3,
    competition: null,
  };
});

const ACTIVE_GAMEWEEK = {
  id: "visual-qa-gameweek",
  number: 3,
  state: "MARKET_OPEN" as const,
  marketOpensAt: "2026-08-31T20:00:00.000Z",
  locksAt: "2026-09-04T18:55:00.000Z",
  firstFixtureAt: "2026-09-04T19:00:00.000Z",
  lastFixtureAt: "2026-09-06T18:30:00.000Z",
};

function canonicalRosterRole(role: string) {
  return role === "goalkeeper" || role === "defender" || role === "midfielder" || role === "forward"
    ? role
    : null;
}

/**
 * The visual fixture must exercise the actual large-card formation, not an
 * empty field. It chooses a unique, canonical card for every slot using the
 * same eligibility function as the product. This page is local-only and
 * never writes a lineup or relies on made-up player data.
 */
function visualSelections(catalogue: TouchlineFantasySnapshot["catalogue"]): TouchlineFantasySnapshot["selections"] {
  const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
  const usedPlayerIds = new Set<string>();

  return geometry.slots.flatMap((slot) => {
    const card = catalogue.find((candidate) => {
      const playerId = candidate.canonicalPlayerId ?? candidate.id;
      const positionBucket = touchlineMarketPositionBucket(candidate.position, canonicalRosterRole(candidate.role));
      return positionBucket !== "outfield"
        && !usedPlayerIds.has(playerId)
        && touchlineFantasySlotAcceptsPlayer(slot, {
          playerId,
          clubId: candidate.clubName,
          marketValueEur: candidate.editorialCard?.marketValueEur ?? 0,
          positionBucket,
        });
    });
    if (!card) return [];
    const playerId = card.canonicalPlayerId ?? card.id;
    usedPlayerIds.add(playerId);
    return [{ playerId, slotId: slot.id }];
  });
}

function visualSnapshot(catalogue: TouchlineFantasySnapshot["catalogue"]): TouchlineFantasySnapshot {
  const selections = visualSelections(catalogue);
  return {
  userId: "visual-qa-local-only",
  entitlementActive: true,
  subscription: { amountMinor: 2990, currency: "GBP" },
  config: { budgetEur: 900_000_000, maxPlayersPerClub: 11, lockOffsetMinutes: 5 },
  gameweeks: [ACTIVE_GAMEWEEK],
  activeGameweek: ACTIVE_GAMEWEEK,
  userGameweek: {
    id: "visual-qa-lineup",
    formationCode: "4-3-3",
    state: "DRAFT",
    totalMarketValueEur: 0,
    carriedFromPrevious: false,
    selectedCoachId: COACHES[0]?.id ?? null,
  },
  selections,
  catalogue,
  coaches: COACHES,
  lineupAlerts: [],
  formationRegistry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
  gameweekScore: 0,
  seasonScore: 0,
  matchHistory: [],
  gameweekRanking: [],
  seasonRanking: [],
  };
}

export default async function MarketPremiumPitchVisualQaPage({ searchParams }: VisualQaMarketPitchProps) {
  const params = await searchParams;
  const embeddedMyClub = params.surface === "my-club";
  const catalogueRead = await readVisualQaMarketCatalogue();
  const totalCards = catalogueRead.catalogue.length;
  return (
    <main
      className={styles.page}
      data-market-premium-pitch-visual-qa={catalogueRead.state}
      data-market-premium-pitch-surface={embeddedMyClub ? "my-club" : "gameweek"}
    >
      <header>
        <p>GEOMETRY QA · LOCAL ONLY · NOT PUBLISHABLE</p>
        <span>
          {catalogueRead.state === "ready"
            ? `${totalCards} canonical published player cards synchronised across 20 clubs.`
            : `Canonical player catalogue unavailable (${catalogueRead.reason ?? "unknown"}). No partial catalogue is shown.`}
        </span>
      </header>
      {catalogueRead.state === "ready"
        ? <FantasyGameweekClient
            embedded={embeddedMyClub}
            initialSnapshot={visualSnapshot(catalogueRead.catalogue)}
            locale="en-GB"
          />
        : null}
    </main>
  );
}
