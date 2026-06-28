import { notFound } from "next/navigation";
import {
  TouchlinePlayerAvatar,
  TouchlinePlayerCard,
  TouchlinePlayerGrid,
  type TouchlinePlayerCardModel,
} from "@/components/touchline-card-engine";
import { TouchlineLiveEntitySearchTest } from "@/components/touchline-live-entity-search-test";
import { normalizePlayer, type NormalizedPlayer } from "@/lib/player-normalization";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const qaFixtures = [
  {
    id: "qa-neymar",
    name: "Neymar",
    club: "Santos FC",
    position: "Midfield - Attacking Midfield",
    nationality: "Brazil",
    marketValue: 8_000_000,
    marketValueText: "EUR 8.00 m",
    currency: "EUR",
    syncStatus: "Local visual QA",
    source: "local visual QA fixture",
  },
  {
    id: "qa-rayane-messi",
    name: "Rayane Messi",
    club: "NEOM SC",
    position: "Attack - Left Winger",
    nationality: "France",
    marketValue: 2_800_000,
    marketValueText: "EUR 2.80 m",
    currency: "EUR",
    syncStatus: "Local visual QA",
    source: "local visual QA fixture",
  },
  {
    id: "qa-long-name",
    name: "Alejandro Fernandez",
    club: "Club Atletico River Plate",
    position: "Defence - Centre-Back",
    nationality: "Argentina",
    marketValue: 4_200_000,
    marketValueText: "EUR 4.20 m",
    currency: "EUR",
    syncStatus: "Local visual QA",
    source: "local visual QA fixture",
  },
  {
    id: "qa-cristiano",
    name: "Cristiano Ronaldo",
    club: "Al-Nassr FC",
    position: "Attack - Centre-Forward",
    nationality: "Portugal",
    marketValue: 15_000_000,
    marketValueText: "EUR 15.00 m",
    currency: "EUR",
    syncStatus: "Local visual QA",
    source: "local visual QA fixture",
  },
];

type SportmonksPreviewRow = {
  id: string;
  provider_player_id: string | null;
  name: string | null;
  display_name: string | null;
  photo_url: string | null;
  nationality: string | null;
  position: string | null;
  market_value: number | null;
  market_value_currency: string | null;
  source_updated_at: string | null;
  current_club:
    | { name: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }
    | { name: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }[]
    | null;
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function currentClubName(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.name ?? null;
}

function currentClubLogo(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.logo_url ?? null;
}

function currentLeagueName(currentClub: SportmonksPreviewRow["current_club"]) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.competition?.name ?? null;
}

function fallbackClub(player: SportmonksPreviewRow) {
  const providerId = String(player.provider_player_id ?? "");
  const name = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""}`);
  if (providerId === "184798" || name.includes("lionel messi")) return "Inter Miami CF";
  if (providerId === "186320" || name === "neymar") return "Santos FC";
  if (providerId === "37656179" || name.includes("lamine yamal")) return "Barcelona";
  if (providerId === "37592729" || name.includes("joao neves")) return "Paris Saint-Germain";
  if (providerId === "28931574" || name.includes("joao pedro")) return "Chelsea";
  if (providerId === "218295" || name.includes("weverton")) return "Pembroke";
  return null;
}

function fallbackShirtNumber(player: SportmonksPreviewRow) {
  const providerId = String(player.provider_player_id ?? "");
  const name = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""}`);
  if (providerId === "37656179" || name.includes("lamine yamal")) return "19";
  return null;
}

function toSportmonksCardPlayer(player: SportmonksPreviewRow): TouchlinePlayerCardModel {
  return {
    id: player.id,
    name: clean(player.display_name) ?? clean(player.name) ?? "Unknown Player",
    photoUrl: player.photo_url,
    avatarUrl: player.photo_url,
    sourceImageUrl: player.photo_url,
    sourceImageProvider: "sportmonks",
    sourceImageLicenseStatus: "source_tracked",
    sourceImageFetchedAt: player.source_updated_at,
    avatarRenderStatus: player.photo_url ? "rendered" : "fallback",
    avatarRenderVersion: "runtime-css-v1",
    avatarRenderType: player.photo_url ? "touchline_branded_render" : "touchline_initials_fallback",
    nationality: clean(player.nationality),
    position: clean(player.position),
    currentClub: currentClubName(player.current_club) ?? fallbackClub(player),
    clubBadgeUrl: currentClubLogo(player.current_club),
    league: currentLeagueName(player.current_club),
    shirtNumber: fallbackShirtNumber(player),
    officialMarketValue: player.market_value,
    marketValue: player.market_value,
    currency: player.market_value_currency ?? "EUR",
    context: "search",
    syncStatus: "Sportmonks registered",
    statusLabel: "Sportmonks registered",
    lastUpdated: player.source_updated_at,
  };
}

async function findSportmonksPlayer(playerName: string) {
  if (!playerName.trim()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const needle = normalizeSearch(playerName);
  const { data } = await admin
    .from("football_players")
    .select("id,provider_player_id,name,display_name,photo_url,nationality,position,market_value,market_value_currency,source_updated_at,current_club:current_club_id(name,logo_url,competition:competition_id(name,logo_url))")
    .eq("provider", "sportmonks")
    .order("market_value", { ascending: false, nullsFirst: false })
    .limit(100);

  const row = ((data || []) as SportmonksPreviewRow[]).find((player) => {
    const haystack = normalizeSearch(`${player.display_name ?? ""} ${player.name ?? ""} ${player.provider_player_id ?? ""} ${currentClubName(player.current_club) ?? ""}`);
    return haystack.includes(needle);
  });

  return row ? toSportmonksCardPlayer(row) : null;
}

function toCardPlayer(player: NormalizedPlayer, context?: TouchlinePlayerCardModel["context"]): TouchlinePlayerCardModel {
  return {
    id: player.id,
    name: player.displayName,
    photoUrl: player.photoUrl,
    avatarUrl: player.avatarUrl,
    nationality: player.nationality,
    position: player.position,
    currentClub: player.club,
    officialMarketValue: player.marketValue,
    officialMarketValueLabel: player.marketValueText,
    marketValue: player.marketValue,
    currency: player.currency,
    context,
    syncStatus: player.syncStatus,
    statusLabel: player.syncStatus,
  };
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-10">
      <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-200/70">{eyebrow}</p>
      <h2 className="font-display mt-2 text-2xl uppercase italic text-white sm:text-4xl">{title}</h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function ServerSearchPreview({ query, player }: { query: string; player: TouchlinePlayerCardModel | null }) {
  return (
    <section className="border-t border-[#f6c84c]/25 py-8">
      <p className="text-[9px] font-black uppercase tracking-[.22em] text-[#f6c84c]">Live search</p>
      <h2 className="font-display mt-2 text-2xl uppercase italic text-white sm:text-4xl">Buscar atleta e ver avatar no card</h2>
      <form action="/visual-qa/touchline-cards" className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
        <input
          name="playerName"
          defaultValue={query}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/65 px-4 text-sm font-bold text-white outline-none focus:border-[#f6c84c]/50"
          placeholder="Digite o nome do atleta, ex: Lamine Yamal"
        />
        <button className="h-12 rounded-2xl border border-[#a3ff12]/30 bg-[#a3ff12]/10 px-5 text-[10px] font-black uppercase tracking-[.12em] text-[#d8ff8a]">
          Baixar
        </button>
      </form>
      {player ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,430px)_1fr]">
          <TouchlinePlayerCard player={player} variant="showcase" />
          <div className="self-start rounded-3xl border border-white/10 bg-black/35 p-4">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-100/70">Touchline Rendered Avatar</p>
            <div className="mt-4 flex items-center gap-3">
              <TouchlinePlayerAvatar player={player} size="lg" />
              <div>
                <p className="text-lg font-black uppercase italic text-white">{player.name}</p>
                <p className="mt-1 text-xs text-white/50">Foto Sportmonks transformada em Touchline Branded Avatar.</p>
              </div>
            </div>
          </div>
        </div>
      ) : query ? (
        <p className="mt-5 text-sm text-amber-100/70">Atleta ainda não encontrado nos registros locais. Use o teste client abaixo para importar pelo Sportmonks.</p>
      ) : null}
    </section>
  );
}

export default async function TouchlineCardsVisualQaPage({
  searchParams,
}: {
  searchParams?: Promise<{ playerName?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const query = params?.playerName?.trim() ?? "";
  const searchedPlayer = await findSportmonksPlayer(query);

  const normalizedPlayers = qaFixtures.map((player) => normalizePlayer(player));
  const [primary, fantasy, longName, clubPlayer] = normalizedPlayers;
  const approvedCard = toCardPlayer(primary, "profile");
  const fantasyCard = {
    ...toCardPlayer(fantasy, "dashboard"),
    fantasyAsset: true,
    statusLabel: "Fantasy Asset",
  };
  const portfolioPlayers = normalizedPlayers.map((player) => toCardPlayer(player, "profile"));
  const searchPlayers = normalizedPlayers.map((player) => toCardPlayer(player, "search"));
  const clubNetworkPlayer = toCardPlayer(clubPlayer, "club");

  return (
    <main className="min-h-screen bg-[#05090d] px-4 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="pb-8">
          <p className="text-[9px] font-black uppercase tracking-[.24em] text-[#a3ff12]">Local visual QA only</p>
          <h1 className="font-display mt-3 text-4xl uppercase italic text-white sm:text-6xl">
            Touchline Card Contexts
          </h1>
          <p className="mt-4 max-w-2xl text-xs leading-6 text-slate-500">
            Development-only route using local visual QA fixture data through player normalization and the official Touchline card system.
          </p>
        </header>

        <ServerSearchPreview query={query} player={searchedPlayer} />

        <Section eyebrow="Live entity engine" title="Touchline Live Entity Search Test">
          <TouchlineLiveEntitySearchTest />
        </Section>

        <Section eyebrow="Approved Card Preview" title="Official Touchline Card">
          <div className="max-w-[468px]">
            <TouchlinePlayerCard player={approvedCard} variant="showcase" />
          </div>
        </Section>

        <Section eyebrow="Fantasy Context" title="Touchline Fantasy Squad Assets">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,468px)_1fr]">
            <TouchlinePlayerCard player={fantasyCard} variant="showcase" />
            <div className="self-start">
              <TouchlinePlayerCard player={fantasyCard} variant="list" />
            </div>
          </div>
        </Section>

        <Section eyebrow="Player Portfolio Context" title="Portfolio Player Grid">
          <TouchlinePlayerGrid players={portfolioPlayers} variant="compact" />
        </Section>

        <Section eyebrow="Football Search Context" title="Search Player Results">
          <div className="grid gap-3 lg:grid-cols-2">
            {searchPlayers.map((player) => (
              <TouchlinePlayerCard key={player.id} player={player} variant="list" />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {searchPlayers.slice(0, 3).map((player) => (
              <div key={`${player.id}-avatar`} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[.04] p-3">
                <TouchlinePlayerAvatar player={player} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase italic text-white">{player.name}</p>
                  <p className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    TouchlinePlayerAvatar QA
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Club Network Context" title="Club Player Section">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,468px)_1fr]">
            <TouchlinePlayerCard player={clubNetworkPlayer} variant="showcase" />
            <TouchlinePlayerGrid players={[clubNetworkPlayer, toCardPlayer(longName, "club")]} variant="list" />
          </div>
        </Section>
      </div>
    </main>
  );
}
