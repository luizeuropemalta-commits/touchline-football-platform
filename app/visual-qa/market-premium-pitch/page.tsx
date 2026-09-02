import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "@/lib/touchlineArena/formation-geometry";
import { TOUCHLINE_LIVE_COACHES } from "@/lib/touchlineArena/live-coaches";
import type { TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";

import { readVisualQaMarketCatalogue } from "./catalogue";
import styles from "./market-premium-pitch.module.css";

export const dynamic = "force-dynamic";

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

function visualSnapshot(catalogue: TouchlineFantasySnapshot["catalogue"]): TouchlineFantasySnapshot {
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
  selections: [],
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

export default async function MarketPremiumPitchVisualQaPage() {
  const catalogueRead = await readVisualQaMarketCatalogue();
  const totalCards = catalogueRead.catalogue.length;
  return (
    <main className={styles.page} data-market-premium-pitch-visual-qa={catalogueRead.state}>
      <header>
        <p>GEOMETRY QA · LOCAL ONLY · NOT PUBLISHABLE</p>
        <span>
          {catalogueRead.state === "ready"
            ? `${totalCards} canonical published player cards synchronised across 20 clubs.`
            : `Canonical player catalogue unavailable (${catalogueRead.reason ?? "unknown"}). No partial catalogue is shown.`}
        </span>
      </header>
      {catalogueRead.state === "ready"
        ? <FantasyGameweekClient initialSnapshot={visualSnapshot(catalogueRead.catalogue)} locale="en-GB" />
        : null}
    </main>
  );
}
