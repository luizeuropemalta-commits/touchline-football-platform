import TouchlineOfficialLeagueTable from "@/components/touchline/TouchlineOfficialLeagueTable";
import {
  resolveTouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableTeam,
} from "@/lib/football-data/official-league-table";

export const metadata = {
  title: "TouchLine · Initial official league table visual QA",
  robots: { index: false, follow: false },
};

const FIXTURE_CLUBS: readonly [string, string, string][] = [
  ["3", "Brentford FC", "brentford"],
  ["6", "Tottenham Hotspur", "tottenham-hotspur"],
  ["8", "Liverpool FC", "liverpool"],
  ["9", "Manchester City", "manchester-city"],
  ["11", "Newcastle United", "newcastle-united"],
  ["13", "Everton FC", "everton"],
  ["14", "Manchester United", "manchester-united"],
  ["15", "Chelsea FC", "chelsea"],
  ["18", "AFC Bournemouth", "afc-bournemouth"],
  ["19", "Arsenal FC", "arsenal"],
  ["20", "Brighton & Hove Albion", "brighton-hove-albion"],
  ["22", "Aston Villa", "aston-villa"],
  ["51", "Crystal Palace", "crystal-palace"],
  ["52", "Sunderland AFC", "sunderland"],
  ["63", "Fulham FC", "fulham"],
  ["71", "Nottingham Forest", "nottingham-forest"],
  ["78", "Ipswich Town", "ipswich-town"],
  ["116", "Coventry City", "coventry-city"],
  ["117", "Hull City", "hull-city"],
  ["236", "Leeds United", "leeds-united"],
];

const teams: readonly TouchlineOfficialLeagueTableTeam[] = FIXTURE_CLUBS.map(([providerTeamId, name, slug]) => ({
  clubId: `static-club-${providerTeamId}`,
  providerTeamId,
  name,
  shortCode: null,
  slug,
  logoUrl: null,
  sourceUpdatedAt: "2026-08-09T00:00:00.000Z",
}));

const initialTable = resolveTouchlineOfficialLeagueTable({
  season: {
    id: "static-2026-27",
    providerSeasonId: "static-2026-27",
    name: "2026/27",
    sourceUpdatedAt: "2026-08-09T00:00:00.000Z",
  },
  teams,
  fixtures: [],
});

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ viewport?: string }>>;
}>;

export default async function OfficialLeagueTableInitialVisualQaPage({ searchParams }: VisualQaPageProps) {
  const isMobileViewportFixture = (await searchParams).viewport === "mobile";

  if (isMobileViewportFixture) {
    return (
      <main
        data-official-league-table-fixture="initial-static-mobile"
        style={{ minHeight: "100dvh", padding: 12, background: "#03070d" }}
      >
        <TouchlineOfficialLeagueTable
          table={initialTable}
          locale="en-GB"
          variant="directory"
          id="static-initial-official-league-table-mobile"
        />
      </main>
    );
  }

  return (
    <main
      data-official-league-table-fixture="initial-static"
      style={{
        minHeight: "100dvh",
        padding: "clamp(16px, 4vw, 56px)",
        background: "radial-gradient(circle at 50% 0%, rgba(181, 255, 75, .14), transparent 32%), linear-gradient(145deg, #03070d, #07120f 54%, #020406)",
      }}
    >
      <header style={{ width: "min(1080px, 100%)", margin: "0 auto", color: "#f8fff5" }}>
        <p style={{ margin: 0, color: "#dfff9b", fontSize: 11, fontWeight: 900, letterSpacing: ".13em" }}>
          ADMIN-GATED · STATIC LOCAL VISUAL QA
        </p>
        <h1 style={{ margin: "10px 0 0", fontSize: "clamp(30px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>
          Initial official league table
        </h1>
        <p style={{ maxWidth: 790, margin: "14px 0 0", color: "rgba(247, 251, 247, .72)", fontSize: 15, lineHeight: 1.6 }}>
          Local layout fixture only. It uses the same pure official-table resolver with 20 neutral clubs, zero final results and no live, provider, account or database data.
        </p>
      </header>

      <div style={{ width: "min(1080px, 100%)", margin: "0 auto" }}>
        <TouchlineOfficialLeagueTable
          table={initialTable}
          locale="en-GB"
          variant="directory"
          id="static-initial-official-league-table"
        />
      </div>

      <section
        aria-label="390 pixel mobile viewport fixture"
        style={{ width: "min(1080px, 100%)", margin: "32px auto 0", color: "#f8fff5" }}
      >
        <p style={{ margin: "0 0 12px", color: "#dfff9b", fontSize: 11, fontWeight: 900, letterSpacing: ".13em" }}>
          390PX MOBILE VIEWPORT
        </p>
        <iframe
          title="Initial official league table at 390 pixel viewport"
          src="/visual-qa/official-league-table-initial?viewport=mobile"
          style={{ width: 390, maxWidth: "100%", height: 780, display: "block", border: "1px solid rgba(223, 255, 155, .28)", borderRadius: 20, background: "#03070d" }}
        />
      </section>
    </main>
  );
}
