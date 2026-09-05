import ClubHubMatchdayTechnicalArea from "@/components/touchline/ClubHubMatchdayTechnicalArea";
import ClubHubOfficialLineup from "@/components/touchline/ClubHubOfficialLineup";
import ClubHubOutsideMatchRoster from "@/components/touchline/ClubHubOutsideMatchRoster";
import TouchlineOfficialLeagueTable from "@/components/touchline/TouchlineOfficialLeagueTable";
import type { TouchlineFantasyLineupMember } from "@/lib/football-data/types";
import {
  resolveTouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableTeam,
} from "@/lib/football-data/official-league-table";
import {
  buildTouchLineClubMatchdayPresentation,
} from "@/lib/touchlineArena/club-lineup";
import {
  findTouchLineClub,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · ClubHub profile contract visual QA",
  robots: { index: false, follow: false },
};

function requireStaticClub() {
  const found = findTouchLineClub("manchester-city");
  if (!found) throw new Error("TL_STATIC_CLUBHUB_QA_CLUB_UNAVAILABLE");
  return found;
}

const staticClub = requireStaticClub();

const roles = [
  "forward", "forward", "forward",
  "midfielder", "midfielder", "midfielder",
  "defender", "defender", "defender", "defender",
  "goalkeeper",
] as const;

const STATIC_PLAYERS = [
  "Alejandro Maximilian Longfield",
  "Bernardo Alexander Stone",
  "Cameron Dominic Wright",
  "Dario Fernando Silva",
  "Emilio Jonathan Parker",
  "Felix Christopher James",
  "Gabriel Anthony Williams",
  "Hugo Benjamin Thompson",
  "Isaac Leonardo Martins",
  "Jonas Theodore Smith",
  "Kai Sebastian Robinson",
  "Luca Nathaniel Cooper",
  "Mateo Alexander Young",
  "Nico Harrison Taylor",
  "Oliver Daniel Edwards",
  "Pablo William Hall",
  "Quentin Joseph Allen",
  "Rafael Michael Green",
  "Samuel David King",
  "Theo Arthur Scott",
  "Ulises Victor Baker",
  "Victor Henry Adams",
  "Wesley Andrew Turner",
] as const;

const staticCards: ClubOwnerSquadCard[] = STATIC_PLAYERS.map((name, index) => ({
  id: `static-player-${index + 1}`,
  name,
  shortName: name,
  role: roles[index % roles.length],
  position: roles[index % roles.length].toUpperCase(),
  clubName: staticClub.name,
  shirtNumber: index + 1,
  countryCode3: "ENG",
  marketValue: "Pending",
  marketValueSource: "unavailable",
  marketValueState: "pending",
  classificationState: "pending",
  touchlinePoints: 0,
}));

function lineupMember(index: number, kind: "starter" | "substitute"): TouchlineFantasyLineupMember {
  const card = staticCards[index];
  return {
    id: `static-lineup-${card.id}`,
    providerId: `static-lineup-${card.id}`,
    provider: "sportmonks",
    fixtureId: "static-fixture-2026-27-1",
    teamId: staticClub.teamId,
    teamName: staticClub.name,
    playerId: card.id,
    playerName: card.name,
    jerseyNumber: card.shirtNumber ?? undefined,
    position: card.position,
    isStarter: kind === "starter",
    isSubstitute: kind === "substitute",
    statistics: [],
  };
}

const staticLineup = [
  ...Array.from({ length: 11 }, (_, index) => lineupMember(index, "starter")),
  ...Array.from({ length: 9 }, (_, index) => lineupMember(index + 11, "substitute")),
];

const tableTeams: readonly TouchlineOfficialLeagueTableTeam[] = [
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
].map(([providerTeamId, name, slug]) => ({
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
  teams: tableTeams,
  fixtures: [],
});

type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ state?: string; viewport?: string; lang?: string }>>;
}>;

export default async function ClubHubProfileContractVisualQaPage({ searchParams }: VisualQaPageProps) {
  const { state, viewport, lang } = await searchParams;
  const pending = state === "pending";
  const presentation = buildTouchLineClubMatchdayPresentation({
    club: staticClub,
    squadCards: staticCards,
    officialLineup: staticLineup,
    formation: "4-3-3",
    fixtureId: "static-fixture-2026-27-1",
    officialCoach: pending
      ? null
      : { fixtureId: "static-fixture-2026-27-1", teamId: staticClub.teamId, name: "Static Official Coach" },
  });
  const locale = resolveTouchlineVisualQaLocale(lang);
  const ptBr = locale === "pt-BR";
  const copy = ptBr
    ? {
      title: "Contrato visual do perfil ClubHub",
      description: "Apenas fixture local: uma ficha estática de 11 + 9, um estado pendente separado, elenco simples fora do jogo e a tabela oficial inicial com 20 clubes. Não usa conta, requisição externa, banco de dados ou dados econômicos.",
      coach: "Treinador oficial estático",
      playerContent: "O conteúdo de cards TouchLine começa abaixo da tabela oficial.",
      mobileSheet: "390PX MOBILE · FICHA DE JOGO PENDENTE",
      mobileTitle: "Ficha pendente do perfil ClubHub em viewport de 390 pixels",
      labels: { nationality: "Nacionalidade", points: "Pontos", totalPoints: "Pontos TouchLine", cardPrice: "Preço do card", currentClub: "Clube atual" },
    }
    : {
      title: "ClubHub profile contract",
      description: "Local fixture only: a static 11 + 9 team sheet, a separate pending state, plain out-of-matchday roster and the initial 20-club official table. It has no account, external request, database or economic data.",
      coach: "Static Official Coach",
      playerContent: "TouchLine player-card content begins below the official table.",
      mobileSheet: "390PX MOBILE · PENDING MATCHDAY SHEET",
      mobileTitle: "ClubHub profile pending matchday sheet at 390 pixel viewport",
      labels: { nationality: "Nationality", points: "Points", totalPoints: "TouchLine points", cardPrice: "Card price", currentClub: "Current club" },
    };
  const localizedPresentation = pending
    ? presentation
    : {
      ...presentation,
      technical: {
        ...presentation.technical,
        coach: presentation.technical.coach
          ? { ...presentation.technical.coach, name: copy.coach }
          : null,
      },
    };
  const displayed = new Set(presentation.displayedPlayerIds);
  const outsideMatchdayCards = staticCards.filter((card) => !displayed.has(card.id));
  const mobile = viewport === "mobile";

  return (
    <main
      data-clubhub-profile-fixture={pending ? "pending-static" : "confirmed-static"}
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        padding: mobile ? 12 : "clamp(16px, 4vw, 56px)",
        background: "radial-gradient(circle at 50% 0%, rgba(97, 220, 255, .14), transparent 30%), linear-gradient(145deg, #03070d, #07120f 54%, #020406)",
      }}
    >
      {!mobile ? (
        <header style={{ width: "min(1180px, 100%)", margin: "0 auto 22px", color: "#f8fff5" }}>
          <p style={{ margin: 0, color: "#93ddff", fontSize: 11, fontWeight: 900, letterSpacing: ".13em" }}>
            ADMIN-GATED · STATIC LOCAL VISUAL QA
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: "clamp(30px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>
            {copy.title}
          </h1>
          <p style={{ maxWidth: 790, margin: "14px 0 0", color: "rgba(247, 251, 247, .72)", fontSize: 15, lineHeight: 1.6 }}>
            {copy.description}
          </p>
        </header>
      ) : null}

      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
        <ClubHubOfficialLineup
          clubName={staticClub.name}
          lineup={localizedPresentation.lineup}
          locale={locale}
          staticVisualQa
          labels={copy.labels}
        />
        <ClubHubMatchdayTechnicalArea
          clubName={staticClub.name}
          technical={localizedPresentation.technical}
          locale={locale}
          coachCard={null}
          labels={copy.labels}
        />
        <ClubHubOutsideMatchRoster
          clubName={staticClub.name}
          cards={outsideMatchdayCards}
          locale={locale}
          labels={copy.labels}
        />
        <TouchlineOfficialLeagueTable
          table={initialTable}
          locale={locale}
          variant="profile"
          currentTeamId={staticClub.teamId}
        />
        <section style={{ border: "1px solid rgba(181,255,75,.22)", borderRadius: 12, padding: 18, color: "#f8fff5", background: "rgba(4,12,9,.68)" }}>
          <strong>{copy.playerContent}</strong>
        </section>
      </div>

      {!mobile ? (
        <section aria-label="390 pixel mobile pending fixture" style={{ width: "min(1180px, 100%)", margin: "32px auto 0", color: "#f8fff5" }}>
          <p style={{ margin: "0 0 12px", color: "#93ddff", fontSize: 11, fontWeight: 900, letterSpacing: ".13em" }}>
            {copy.mobileSheet}
          </p>
          <iframe
            title={copy.mobileTitle}
            src={`/visual-qa/clubhub-profile-contract?state=pending&viewport=mobile&lang=${locale}`}
            style={{ width: 390, maxWidth: "100%", height: 900, display: "block", border: "1px solid rgba(147,221,255,.28)", borderRadius: 20, background: "#03070d" }}
          />
        </section>
      ) : null}
    </main>
  );
}
