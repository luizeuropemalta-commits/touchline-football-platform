/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { readdir } from "fs/promises";
import path from "path";
import type { CSSProperties } from "react";
import ClubTrophyCarousel from "@/components/touchline/ClubTrophyCarousel";
import ClubHubOfficialLineup from "@/components/touchline/ClubHubOfficialLineup";
import ClubHubSquadGrid from "@/components/touchline/ClubHubSquadGrid";
import type { TouchlineFantasyLineupMember, TouchlineFixture, TouchlineTeam } from "@/lib/football-data/types";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  findTouchLineClub,
  formatCompactEuro,
  rankClubOwnerCards,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import { inferArenaRole, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import {
  readPersistedSquadSnapshot,
  type PersistedSquadPlayer,
} from "@/lib/football-data/squad-snapshot-store";
import { readLiveScoreSnapshot } from "@/lib/football-data/live-score-snapshot";
import { readPublicFantasyFixtureSnapshots } from "@/lib/football-data/public-fantasy-snapshot";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { buildOfficialStandings } from "@/lib/football-data/official-standings";
import { selectPublicClubFixture } from "@/lib/football-data/public-fixture-selection";
import {
  parseMarketValueEur,
} from "@/lib/touchlineArena/card-rules";
import { buildTouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import { touchlineArenaHref } from "@/lib/touchlineArena/arena-navigation";
import {
  normalizeTouchLineLocale,
  touchLineT,
  type TouchLineLocale,
} from "@/lib/touchlineArena/i18n";
import { touchlineCountryCode3FromName } from "@/lib/touchlineArena/country-flags";
import { fetchTouchlineInternalJson } from "@/lib/server/safe-internal-fetch";

export const dynamic = "force-dynamic";

const TROPHY_FOLDER_BY_CLUB_CODE: Record<string, string> = {
  BOU: "afc-bournemouth",
  ARS: "arsenal",
  AVL: "aston-villa",
  BRE: "brentford",
  BHA: "brighton-and-hove-albion",
  CHE: "chelsea",
  COV: "coventry-city",
  CRY: "crystal-palace",
  EVE: "everton",
  FUL: "fulham",
  HUL: "hull-city",
  IPS: "ipswich-town",
  LEE: "leeds-united",
  LIV: "liverpool",
  MCI: "manchester-city",
  MUN: "manchester-united",
  NEW: "newcastle-united",
  NFO: "nottingham-forest",
  SUN: "sunderland",
  TOT: "tottenham-hotspur",
};

type ClubTrophyAsset = {
  id: string;
  label: string;
  count: number;
  imageUrl: string;
  tone: "gold" | "silver" | "blue" | "green";
};

type ClubHubPageProps = {
  params: Promise<{
    club: string;
  }>;
  searchParams: Promise<{
    lang?: string;
  }>;
};

type PremierSquadPlayer = {
  id: string;
  providerId?: string | null;
  name: string;
  shortName: string;
  role: string;
  position?: string | null;
  shirtNumber?: string | number | null;
  clubName: string;
  clubShortCode: string;
  marketValue?: string | null;
  marketValueSource?: ClubOwnerSquadCard["marketValueSource"];
  cardTier?: ClubOwnerSquadCard["cardTier"];
  cardPriceVersion?: string | null;
  countryCode3?: string | null;
};

type ClubMatchPreview = {
  fixtureId?: string;
  home: {
    name: string;
    shortCode: string;
    logoUrl?: string;
  };
  away: {
    name: string;
    shortCode: string;
    logoUrl?: string;
  };
  status: string;
  startsAt: string;
  source?: string;
};

type ClubMatchSnapshot = {
  preview: ClubMatchPreview;
  lineups: TouchlineFantasyLineupMember[];
  formation: string | null;
};

function trophyTone(label: string): ClubTrophyAsset["tone"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("champions") || normalized.includes("league champions") || normalized.includes("world")) return "gold";
  if (normalized.includes("fa cup") || normalized.includes("conference")) return "blue";
  if (normalized.includes("league cup") || normalized.includes("football league")) return "green";
  return "silver";
}

function parseTrophyFileName(fileName: string, folderSlug: string): ClubTrophyAsset {
  const baseName = fileName.replace(/\.png$/i, "");
  const match = baseName.match(/^(.*)\s-\s(\d+)$/);
  const label = (match?.[1] ?? baseName).replace(/\s*Trophy$/i, "").trim();
  const count = Number.parseInt(match?.[2] ?? "1", 10);

  return {
    id: `${folderSlug}-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    imageUrl: `/touchlineArena/clubs/${folderSlug}/trophies/${encodeURIComponent(fileName)}`,
    tone: trophyTone(label),
  };
}

async function loadClubTrophyAssets(club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  const folderSlug = TROPHY_FOLDER_BY_CLUB_CODE[club.shortCode] ?? club.slug;
  const trophyDir = path.join(process.cwd(), "public", "touchlineArena", "clubs", folderSlug, "trophies");

  try {
    const fileNames = await readdir(trophyDir);
    return fileNames
      .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
      .sort((first, second) => first.localeCompare(second))
      .map((fileName) => parseTrophyFileName(fileName, folderSlug))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
  } catch {
    return [];
  }
}

export function generateStaticParams() {
  return TOUCHLINE_ENGLAND_CLUBS.map((club) => ({ club: club.slug }));
}

function squadApiPlayerToCard(player: PremierSquadPlayer, clubName: string): ClubOwnerSquadCard {
  return {
    id: player.providerId || player.id,
    name: player.name,
    shortName: player.shortName || player.name,
    role: player.role || "midfielder",
    position: player.position || player.role || "MID",
    clubName,
    shirtNumber: normalizeOfficialShirtNumber(player.shirtNumber),
    countryCode3: player.countryCode3 || "N/A",
    marketValue: player.marketValue || "Pending",
    marketValueSource: player.marketValueSource || "unavailable",
    cardTier: player.cardTier,
    cardPriceVersion: player.cardPriceVersion || undefined,
    touchlinePoints: 0,
  };
}

function persistedSquadPlayerToCard(player: PersistedSquadPlayer, clubName: string): ClubOwnerSquadCard {
  const marketValue = parseMarketValueEur(player.marketValue);

  return {
    id: player.providerId,
    name: player.displayName || player.name,
    shortName: player.displayName || player.name,
    role: inferArenaRole(player.position || undefined),
    position: player.position || "MID",
    clubName,
    shirtNumber: normalizeOfficialShirtNumber(player.jerseyNumber),
    countryCode3: touchlineCountryCode3FromName(player.nationality) || "N/A",
    marketValue: marketValue ? `€${Math.round(marketValue / 1_000_000)}M` : "Pending",
    marketValueSource: marketValue ? "verified-cache" : "unavailable",
    touchlinePoints: 0,
  };
}

async function loadPersistedClubSquadCards(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
) {
  try {
    const snapshot = await readPersistedSquadSnapshot(club.teamId);
    if (!snapshot?.players.length) return null;

    const cards = snapshot.players.map((player) => persistedSquadPlayerToCard(player, club.name));
    return {
      cards,
      status: `${cards.length} TouchLine cards`,
      source: touchLineT(locale, "dataCache"),
      state: "ready" as const,
    };
  } catch {
    return null;
  }
}

async function loadClubSquadCards(club: NonNullable<ReturnType<typeof findTouchLineClub>>, locale: TouchLineLocale) {
  try {
    const params = new URLSearchParams({
      teamId: club.teamId,
      clubName: club.name,
      clubShortCode: club.shortCode,
      clubLogoUrl: club.logoUrl ?? "",
    });
    const result = await fetchTouchlineInternalJson<
      | { ok: true; players: PremierSquadPlayer[]; status?: string; cached?: boolean; fetchedAt?: string }
      | { ok: false; error?: string; status?: string }
    >(`/api/football-data/premier-squad?${params.toString()}`);

    if (result.state !== "ready" || result.data.ok === false) throw new Error("Squad unavailable");
    const payload = result.data;

    return {
      cards: payload.players.map((player) => squadApiPlayerToCard(player, club.name)),
      status: payload.status ?? `${payload.players.length} TouchLine cards`,
      source: payload.cached ? touchLineT(locale, "dataCache") : touchLineT(locale, "liveData"),
      state: "ready" as const,
    };
  } catch {
    const persistedFallback = await loadPersistedClubSquadCards(club, locale);
    if (persistedFallback) return persistedFallback;

    return {
      cards: [] as ClubOwnerSquadCard[],
      status: locale === "pt-BR" ? "Elenco temporariamente indisponível" : "Squad temporarily unavailable",
      source: locale === "pt-BR" ? "Fonte indisponível" : "Source unavailable",
      state: "unavailable" as const,
    };
  }
}

function previewTeamFromClub(club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  return {
    name: club.name,
    shortCode: club.shortCode,
    logoUrl: club.logoUrl,
  };
}

function previewTeamFromFixtureTeam(team: TouchlineTeam | undefined, fallback: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  const matchedClub = findTouchLineClub(team?.name) ?? findTouchLineClub(team?.shortCode) ?? fallback;
  return {
    name: team?.name ?? matchedClub.name,
    shortCode: team?.shortCode ?? matchedClub.shortCode,
    logoUrl: matchedClub.logoUrl ?? team?.logoUrl,
  };
}

function fixtureHasClub(fixture: TouchlineFixture, club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  return [fixture.homeTeam?.providerId, fixture.awayTeam?.providerId, fixture.homeTeam?.name, fixture.awayTeam?.name, fixture.homeTeam?.shortCode, fixture.awayTeam?.shortCode]
    .filter(Boolean)
    .some((value) => {
      const matched = findTouchLineClub(String(value));
      return matched?.teamId === club.teamId;
    });
}

function fallbackClubMatch(club: NonNullable<ReturnType<typeof findTouchLineClub>>, locale: TouchLineLocale): ClubMatchPreview {
  return {
    home: previewTeamFromClub(club),
    away: {
      name: touchLineT(locale, "opponentToBeConfirmed"),
      shortCode: touchLineT(locale, "opponentToBeConfirmed"),
      logoUrl: undefined,
    },
    status: touchLineT(locale, "opponentToBeConfirmed"),
    startsAt: touchLineT(locale, "kickoffPending"),
  };
}

function feedTeamBelongsToClub(teamId: string | undefined, teamName: string | undefined, club: NonNullable<ReturnType<typeof findTouchLineClub>>) {
  if (teamId && String(teamId) === club.teamId) return true;
  return findTouchLineClub(teamName)?.teamId === club.teamId;
}

function localizedFixtureStatus(value: string, locale: TouchLineLocale) {
  if (locale !== "pt-BR") return value;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (["not started", "scheduled", "upcoming", "ns"].includes(normalized)) return "Agendada";
  if (["live", "inplay", "in play"].includes(normalized)) return "Ao vivo";
  if (["finished", "ft", "full time"].includes(normalized)) return "Encerrada";
  if (normalized === "postponed") return "Adiada";
  if (["cancelled", "canceled"].includes(normalized)) return "Cancelada";
  return value;
}

async function loadClubMatchSnapshot(
  club: NonNullable<ReturnType<typeof findTouchLineClub>>,
  locale: TouchLineLocale,
): Promise<ClubMatchSnapshot> {
  const empty = {
    preview: fallbackClubMatch(club, locale),
    lineups: [] as TouchlineFantasyLineupMember[],
    formation: null as string | null,
  };

  try {
    const [liveSnapshot, persistedFeeds, scheduledFixtures] = await Promise.all([
      Promise.resolve(readLiveScoreSnapshot()),
      readPublicFantasyFixtureSnapshots({ provider: "sportmonks" }),
      readPublicCompetitionFixtures({ provider: "sportmonks", competitionProviderId: "8" }),
    ]);
    const persistedFixtures = persistedFeeds.map((feed) => feed.fixture);
    const fixture = selectPublicClubFixture(
      [...(liveSnapshot?.fixtures ?? []), ...persistedFixtures, ...scheduledFixtures],
      (candidate) => fixtureHasClub(candidate, club),
    );
    if (!fixture) return empty;

    const persistedFeed = persistedFeeds.find((feed) => feed.fixture.providerId === fixture.providerId);
    const formation = persistedFeed?.formations.find((item) => feedTeamBelongsToClub(item.teamId, item.teamName, club))?.formation ?? null;
    return {
      preview: {
        fixtureId: fixture.providerId,
        home: previewTeamFromFixtureTeam(fixture.homeTeam, club),
        away: previewTeamFromFixtureTeam(fixture.awayTeam, club),
        status: fixture.status ?? "TouchLine England",
        startsAt: fixture.startsAt
          ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(fixture.startsAt))
          : touchLineT(locale, "kickoffPending"),
        source: touchLineT(locale, "dataCache"),
      },
      lineups: persistedFeed?.lineups ?? [],
      formation,
    };
  } catch {
    return empty;
  }
}

export default async function ClubHubPage({ params, searchParams }: ClubHubPageProps) {
  const { club: clubParam } = await params;
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const t = (key: Parameters<typeof touchLineT>[1]) => touchLineT(locale, key);
  const localeQuery = `lang=${encodeURIComponent(locale)}`;
  const cardLabels = {
    nationality: t("nationalityShort"),
    points: t("points"),
    totalPoints: t("touchlinePoints"),
    cardPrice: locale === "pt-BR" ? "Preço do card" : "Card price",
    currentClub: locale === "pt-BR" ? "Clube atual" : "Current Club",
  };
  const club = findTouchLineClub(clubParam);
  if (!club) notFound();

  const [squadLoad, matchSnapshot, clubHonours, officialFixtures] = await Promise.all([
    loadClubSquadCards(club, locale),
    loadClubMatchSnapshot(club, locale),
    loadClubTrophyAssets(club),
    readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }),
  ]);
  const matchPreview = matchSnapshot.preview;
  const clubCards = squadLoad.cards.sort(rankClubOwnerCards);
  const squadUnavailable = squadLoad.state === "unavailable";
  const squadRecoveryCopy = locale === "pt-BR"
    ? { title: "Não foi possível carregar o elenco agora.", action: "Tentar novamente" }
    : { title: "The squad could not be loaded right now.", action: "Try again" };
  const clubLineup = buildTouchLineClubLineup({
    club,
    squadCards: clubCards,
    officialLineup: matchSnapshot.lineups,
    formation: matchSnapshot.formation,
  });
  const clubValue = clubCards.reduce((sum, card) => sum + parseMarketValueEur(card.marketValue), 0);
  const hasCompleteClubValue = clubCards.length > 0 && clubCards.every((card) => parseMarketValueEur(card.marketValue) > 0);
  const touchLinePoints = clubCards.reduce((sum, card) => sum + card.touchlinePoints, 0);
  const squadStatus = locale === "pt-BR" ? `${clubCards.length} cards TouchLine` : squadLoad.status;
  const leagueTable = buildOfficialStandings({
    teams: TOUCHLINE_ENGLAND_CLUBS.map((entry) => ({
      providerTeamId: entry.teamId,
      name: entry.name,
      value: entry,
    })),
    fixtures: officialFixtures,
  });

  return (
    <main className="club-hub" style={{ "--club-accent": club.accent, "--club-secondary": club.secondaryAccent } as CSSProperties}>
      <a className="club-hub-back" href={touchlineArenaHref(locale)}>{t("backToArena")}</a>
      <section className="club-hub-shell">
        <header className="club-hub-hero">
          <div className="club-hub-identity">
            <div className="club-hub-logo-stack">
              <div className="club-hub-logo" aria-label={`${club.name} logo`}>
                {club.logoUrl ? <img src={club.logoUrl} alt="" draggable={false} /> : <span>{club.shortCode}</span>}
              </div>
              <div className="club-hub-actions">
                {club.shopUrl ? <a href={club.shopUrl} target="_blank" rel="noreferrer">{t("officialShop")}</a> : null}
                <a href={`/market-transfer?${localeQuery}`}>{t("transfer")}</a>
              </div>
            </div>
            <div className="club-hub-title-block">
              <span>TouchLine {t("clubHub")}</span>
              <h1>{club.name}</h1>
              <p>{t("clubHubDescription")}</p>
              {clubHonours.length ? (
                <div className="club-hub-honours" aria-label={`${club.name} trophy cabinet`}>
                  <span>{t("clubHonours")}</span>
                  <ClubTrophyCarousel
                    ariaLabel={`${club.name} trophy carousel`}
                    honours={clubHonours}
                    previousLabel={t("previousTrophy")}
                    nextLabel={t("nextTrophy")}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="club-hub-metrics" aria-label={`${club.name} TouchLine metrics`}>
          <article><span>{t("touchlineCards")}</span><strong>{clubCards.length}</strong></article>
          <article><span>{t("clubValue")}</span><strong>{hasCompleteClubValue ? formatCompactEuro(clubValue) : t("marketValuePending")}</strong></article>
          <article><span>{t("touchlinePoints")}</span><strong>{touchLinePoints}</strong></article>
          <article><span>{t("squadSource")}</span><strong>{squadLoad.source}</strong></article>
        </section>

        <ClubHubOfficialLineup
          clubName={club.name}
          lineup={clubLineup}
          locale={locale}
          labels={cardLabels}
        />

        <section className="club-hub-league-table" aria-label="TouchLine England table">
          <div className="club-hub-section-head">
            <div><span>{locale === "pt-BR" ? "Tabela TouchLine England" : "TouchLine England Table"}</span><strong>{t("clubTable")}</strong></div>
            <div className="club-hub-section-actions">
              <a href={`/touchline-tables?${localeQuery}`}>{t("fullTables")}</a>
              <small>{t("officialTableDescription")}</small>
            </div>
          </div>
          {leagueTable.completedFixtures ? <div className="club-hub-table-list" role="region" tabIndex={0} aria-label={locale === "pt-BR" ? "Tabela rolável da TouchLine England" : "Scrollable TouchLine England table"}>
            {leagueTable.rows.map((row, index) => (
              <a
                key={row.team.teamId}
                href={`/touchline-clubs/${row.team.slug}?${localeQuery}`}
                className={`club-hub-table-row ${row.team.teamId === club.teamId ? "is-current" : ""}`}
              >
                <span>{index + 1}</span>
                {row.team.logoUrl ? <img src={row.team.logoUrl} alt="" draggable={false} /> : <i>{row.team.shortCode}</i>}
                <strong>{row.team.name}</strong>
                <small>{t("playedShort")} {row.played}</small>
                <small>{t("winsShort")} {row.won}</small>
                <small>{t("drawsShort")} {row.drawn}</small>
                <small>{t("lossesShort")} {row.lost}</small>
                <small>{t("goalsForShort")} {row.goalsFor}</small>
                <small>{t("goalsAgainstShort")} {row.goalsAgainst}</small>
                <small>{t("goalDifferenceShort")} {row.goalDifference}</small>
                <b>{t("pointsShort")} {row.points}</b>
                <small className="club-hub-table-form" aria-label={`${t("formShort")}: ${row.form.join(" ")}`}>{row.form.join(" · ") || "—"}</small>
              </a>
            ))}
          </div> : <div className="club-hub-table-empty" role="status"><strong>{t("officialTablePending")}</strong><p>{t("officialTablePendingDescription")}</p></div>}
        </section>

        <section className="club-hub-board">
          <article className="club-hub-fixture">
            <span>{t("nextMatch")}</span>
            <div className="club-hub-fixture-row">
              <div>
                {matchPreview.home.logoUrl ? <img src={matchPreview.home.logoUrl} alt="" draggable={false} /> : null}
                <strong>{matchPreview.home.shortCode}</strong>
              </div>
              <b>VS</b>
              <div className={!matchPreview.away.logoUrl ? "club-hub-fixture-team-pending" : undefined}>
                {matchPreview.away.logoUrl ? <img src={matchPreview.away.logoUrl} alt="" draggable={false} /> : null}
                <strong>{matchPreview.away.shortCode}</strong>
              </div>
            </div>
            <p>{matchPreview.home.name} vs {matchPreview.away.name}</p>
            <small>{[localizedFixtureStatus(matchPreview.status, locale), matchPreview.startsAt, matchPreview.source].filter(Boolean).join(" / ")}</small>
          </article>
          <article><span>{t("clubStore")}</span><strong>{t("officialShopTraffic")}</strong><p>{t("clubStoreDescription")}</p></article>
          <article><span>{t("partnerSlots")}</span><strong>{club.sponsorSlots} {t("spaces")}</strong><p>{t("partnerDescription")}</p></article>
        </section>

        <section className="club-hub-cards" aria-label={`${club.name} player cards`}>
          <div className="club-hub-section-head">
            <div>
              <span>{locale === "pt-BR" ? "Elenco completo" : "Full squad"}</span>
              <strong>{club.name}</strong>
            </div>
            <div className="club-hub-section-actions">
              <a href={`/touchline-player-card-rankings?${localeQuery}`}>{t("playerCardsRanking")}</a>
              <small>{squadStatus}. {t("playerOrderDescription")}</small>
            </div>
          </div>
          {clubCards.length ? (
            <ClubHubSquadGrid
              cards={clubCards}
              clubId={club.teamId}
              locale={locale}
              labels={cardLabels}
              openProfileLabel={t("openSelectedPlayerProfile")}
            />
          ) : (
            <div className="club-hub-empty" role={squadUnavailable ? "status" : undefined}>
              <strong>{squadUnavailable ? squadRecoveryCopy.title : t("cardsPending")}</strong>
              {squadUnavailable ? <a href={`/touchline-clubs/${club.slug}?${localeQuery}`}>{squadRecoveryCopy.action}</a> : null}
            </div>
          )}
        </section>
      </section>

      <style>{`
        .club-hub {
          min-height: 100dvh;
          color: #f8fff5;
          background:
            radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--club-accent) 28%, transparent), transparent 26%),
            radial-gradient(circle at 84% 14%, color-mix(in srgb, var(--club-secondary) 18%, transparent), transparent 22%),
            linear-gradient(135deg, #020707 0%, #06110d 44%, #030503 100%);
          padding: 42px 5vw 64px;
        }
        .club-hub-back,
        .club-hub-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border: 1px solid rgba(177,255,77,.42);
          border-radius: 999px;
          padding: 0 22px;
          color: #dfff9b;
          text-decoration: none;
                    font-size: 11px;
          font-weight: 950;          background: rgba(8,15,12,.68);
        }
        .club-hub-shell {
          width: min(1540px, 100%);
          min-width: 0;
          max-width: 100%;
          margin: 38px auto 0;
          display: grid;
          gap: 18px;
        }
        .club-hub-shell > * {
          min-width: 0;
          max-width: 100%;
        }
        .club-hub-hero,
        .club-hub-metrics,
        .club-hub-board,
        .club-hub-cards {
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(4,12,9,.76), rgba(12,28,18,.62));
          box-shadow: 0 30px 90px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
        }
        .club-hub-cards { order: 1; }
        .club-hub-league-table,
        .club-hub-board { order: 2; }
        .club-hub-hero {
          min-height: 300px;
          padding: clamp(24px, 4vw, 52px);
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          overflow: hidden;
          position: relative;
          border-color: color-mix(in srgb, var(--club-accent) 34%, rgba(255,255,255,.12));
          background:
            radial-gradient(ellipse at 16% 48%, color-mix(in srgb, var(--club-accent) 52%, transparent) 0%, color-mix(in srgb, var(--club-accent) 22%, transparent) 30%, transparent 57%),
            radial-gradient(ellipse at 76% 22%, color-mix(in srgb, var(--club-secondary) 24%, transparent), transparent 48%),
            linear-gradient(105deg, color-mix(in srgb, var(--club-accent) 14%, #020a0b) 0%, rgba(3,13,12,.86) 48%, color-mix(in srgb, var(--club-secondary) 12%, #03100d) 100%);
          box-shadow: 0 28px 78px color-mix(in srgb, var(--club-accent) 15%, rgba(0,0,0,.42));
        }
        .club-hub-hero::after {
          display: none;
        }
        .club-hub-identity,
        .club-hub-actions {
          position: relative;
          z-index: 1;
        }
        .club-hub-identity {
          display: flex;
          align-items: center;
          gap: clamp(34px, 5vw, 78px);
          flex: 1;
          min-width: 0;
        }
        .club-hub-title-block {
          min-width: 0;
          flex: 1;
        }
        .club-hub-logo {
          width: clamp(190px, 22vw, 330px);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 0;
          background: transparent;
        }
        .club-hub-logo-stack {
          display: grid;
          justify-items: center;
          gap: 16px;
          flex: 0 0 auto;
        }
        .club-hub-logo img {
          width: 96%;
          height: 96%;
          object-fit: contain;
          background: transparent;
          border: 0;
          box-shadow: none;
          filter: none;
        }
        .club-hub-honours {
          width: min(760px, 100%);
          margin-top: 26px;
          padding: 0;
          background: transparent;
          overflow: hidden;
        }
        .club-hub-honour-row {
          display: block;
          position: relative;
          margin-top: 10px;
          min-height: 164px;
          padding: 2px 0 10px;
          overflow: hidden;
          overscroll-behavior-x: contain;
        }
        .club-hub-honour-viewport {
          width: 100%;
          min-height: inherit;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 8%, #000 92%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 8%, #000 92%, transparent 100%);
        }
        .club-hub-honour-row.is-static .club-hub-honour-viewport {
          -webkit-mask-image: none;
          mask-image: none;
        }
        .club-hub-honour-track {
          display: flex;
          width: max-content;
          gap: 0;
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
          will-change: transform;
        }
        .club-hub-honour-row.is-static .club-hub-honour-track {
          width: 100%;
          justify-content: flex-start;
          will-change: auto;
        }
        .club-hub-honour-row.is-static .club-hub-honour-set {
          flex-wrap: wrap;
        }
        .club-hub-honour-set {
          display: flex;
          gap: 12px;
          flex: 0 0 auto;
          padding-inline: 12px;
        }
        .club-hub-honour-arrow {
          position: absolute;
          z-index: 3;
          top: 50%;
          width: 52px;
          height: 58px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          padding: 0;
          color: rgba(255,255,255,.92);
          background: transparent;
          box-shadow: none;
          filter: none;
          cursor: pointer;
        }
        .club-hub-honour-arrow::before {
          content: "";
          position: absolute;
          inset: 8px 0;
          background:
            linear-gradient(145deg, rgba(255,255,255,.13), rgba(255,255,255,.035)),
            color-mix(in srgb, var(--club-accent) 16%, rgba(3,10,14,.76));
          clip-path: polygon(100% 14%, 48% 14%, 0 50%, 48% 86%, 100% 86%, 62% 50%);
          opacity: .92;
          transition: background .16s ease, opacity .16s ease;
        }
        .club-hub-honour-arrow.is-next::before {
          transform: scaleX(-1);
        }
        .club-hub-honour-arrow:hover,
        .club-hub-honour-arrow:focus-visible {
          color: color-mix(in srgb, var(--club-accent) 54%, #fff);
          outline: 0;
        }
        .club-hub-honour-arrow:hover::before,
        .club-hub-honour-arrow:focus-visible::before {
          background:
            linear-gradient(145deg, rgba(255,255,255,.2), rgba(255,255,255,.06)),
            color-mix(in srgb, var(--club-accent) 28%, rgba(3,10,14,.72));
          opacity: 1;
        }
        .club-hub-honour-arrow.is-previous {
          left: 2px;
        }
        .club-hub-honour-arrow.is-next {
          right: 2px;
        }
        .club-hub-honour {
          flex: 0 0 98px;
          min-width: 98px;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 8px;
          padding: 10px 7px 9px;
          display: grid;
          place-items: center;
          gap: 4px;
          text-align: center;
          background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.2));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 14px 28px rgba(0,0,0,.22);
        }
        .club-hub-honour-avatar {
          width: 58px;
          height: 62px;
          position: relative;
          display: grid;
          place-items: center;
        }
        .club-hub-honour-avatar img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 10px 16px rgba(0,0,0,.48));
        }
        .club-hub-honour strong {
          font-size: 20px;
          line-height: 1;
        }
        .club-hub-honour small {
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          color: rgba(255,255,255,.64);
          font-size: 9px;
          line-height: 1.15;
          font-weight: 950;                  }
        .club-hub-identity span,
        .club-hub-board span,
        .club-hub-section-head span,
        .club-hub-metrics span {
          color: #b6ff4d;
                    font-size: 11px;
          font-weight: 950;        }
        .club-hub-identity h1 {
          margin: 12px 0 14px;
          font-size: clamp(42px, 5.4vw, 86px);
          line-height: .94;        }
        .club-hub-identity p,
        .club-hub-board p,
        .club-hub-section-head small,
        .club-hub-feature-list small {
          max-width: 650px;
          margin: 0;
          color: rgba(255,255,255,.68);
          font-size: 14px;
          line-height: 1.7;
          font-weight: 800;
        }
        .club-hub-actions {
          display: grid;
          gap: 10px;
          width: min(250px, 100%);
        }
        .club-hub-metrics,
        .club-hub-board {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1px;
          overflow: hidden;
        }
        .club-hub-board {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .club-hub-metrics article,
        .club-hub-board article {
          padding: 22px;
          background: rgba(0,0,0,.24);
        }
        .club-hub-metrics strong {
          display: block;
          margin-top: 10px;
          font-size: clamp(28px, 3vw, 44px);
          line-height: 1;
        }
        .club-hub-league-table {
          padding: 24px;
          background:
            radial-gradient(circle at 12% 20%, color-mix(in srgb, var(--club-accent) 20%, transparent), transparent 32%),
            rgba(0,0,0,.2);
        }
        .club-hub-table-list {
          display: grid;
          gap: 8px;
          padding-top: 18px;
        }
        .club-hub-table-row {
          display: grid;
          grid-template-columns: 38px 42px minmax(150px, 1fr) repeat(7, 48px) 58px minmax(70px, .8fr);
          align-items: center;
          gap: 10px;
          min-height: 58px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(0,0,0,.24));
          color: #f8fff5;
          padding: 8px 12px;
          text-decoration: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }
        .club-hub-table-row.is-current {
          border-color: rgba(181,255,75,.45);
          background:
            linear-gradient(135deg, rgba(181,255,75,.16), rgba(0,0,0,.26)),
            color-mix(in srgb, var(--club-accent) 14%, transparent);
        }
        .club-hub-table-row span,
        .club-hub-table-row b {
          color: #dfff9b;
          font-weight: 1000;
          text-align: center;
        }
        .club-hub-table-row img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 8px 14px rgba(0,0,0,.42));
        }
        .club-hub-table-row i {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          color: #dfff9b;
          font-size: 9px;
          font-style: normal;
          font-weight: 1000;
        }
        .club-hub-table-row strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 15px;
                  }
        .club-hub-table-row small {
          color: rgba(255,255,255,.62);
          font-size: 10px;
          font-weight: 950;
          text-align: center;
          white-space: nowrap;
        }
        .club-hub-table-form { color: #dfff9b !important; letter-spacing: .04em; }
        .club-hub-table-empty {
          display: grid;
          gap: 7px;
          margin-top: 18px;
          border: 1px dashed rgba(181,255,75,.28);
          border-radius: 8px;
          padding: 20px;
          background: rgba(0,0,0,.18);
        }
        .club-hub-table-empty strong { color: #dfff9b; font-size: 14px; }
        .club-hub-table-empty p { margin: 0; color: rgba(255,255,255,.66); font-size: 12px; line-height: 1.5; }
        .club-hub-board strong {
          display: block;
          margin: 12px 0;
          font-size: 24px;
                  }
        .club-hub-fixture {
          display: grid;
          gap: 12px;
        }
        .club-hub-fixture-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          gap: 18px;
          align-items: center;
        }
        .club-hub-fixture-row div {
          min-height: 118px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          border: 0;
          background: transparent;
          box-shadow: none;
          outline: 0;
        }
        .club-hub-fixture-row img {
          width: min(112px, 100%);
          height: 92px;
          object-fit: contain;
          background: transparent;
          border: 0;
          box-shadow: none;
          filter: none;
        }
        .club-hub-fixture-row strong {
          margin: 10px 0 0;
          font-size: 16px;
        }
        .club-hub-fixture-team-pending strong {
          max-width: 150px;
          margin: 0;
          color: rgba(255,255,255,.78);
          line-height: 1.25;
          text-align: center;
          white-space: normal;
        }
        .club-hub-fixture-row b {
          color: #dfff9b;
          font-size: 15px;
          font-weight: 1000;          opacity: .86;
        }
        .club-hub-fixture small {
          color: rgba(255,255,255,.56);
          font-size: 10px;
          font-weight: 900;                  }
        .club-hub-cards {
          padding: 24px;
        }
        .club-hub-section-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 24px;
          padding-bottom: 18px;
          border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .club-hub-section-head strong {
          display: block;
          margin-top: 8px;
          font-size: clamp(28px, 3.2vw, 52px);
          line-height: 1;
                  }
        .club-hub-section-actions {
          display: grid;
          justify-items: end;
          gap: 10px;
        }
        .club-hub-section-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(181,255,75,.4);
          background: linear-gradient(135deg, rgba(181,255,75,.18), rgba(0,0,0,.26));
          color: #efff9b;
          padding: 0 16px;
          text-decoration: none;
                    white-space: nowrap;
          font-size: 9px;
          font-weight: 1000;        }
        .club-hub-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(218px, 1fr));
          gap: 14px;
          padding-top: 22px;
        }
        .club-hub-progressive-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 18px;
          border-top: 1px solid rgba(255,255,255,.1);
          padding-top: 18px;
        }
        .club-hub-progressive-controls span {
          color: rgba(255,255,255,.62);
          font-size: 11px;
          font-weight: 850;
        }
        .club-hub-progressive-controls button {
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.48);
          border-radius: 999px;
          padding: 0 18px;
          color: #efffbd;
          background: rgba(181,255,75,.1);
          font: inherit;
          font-size: 10px;
          font-weight: 950;
          cursor: pointer;
        }
        .club-hub-progressive-controls button:hover,
        .club-hub-progressive-controls button:focus-visible {
          border-color: #c5ff6d;
          background: rgba(181,255,75,.2);
          outline: none;
        }
        .club-hub-card {
          position: relative;
          min-height: 360px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          padding: 14px;
          display: grid;
          align-content: start;
          justify-items: center;
          background: linear-gradient(150deg, rgba(255,255,255,.08), rgba(0,0,0,.3));
          overflow: visible;
        }
        .club-hub-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--club-accent) 22%, transparent), transparent 36%);
          border-radius: inherit;
          pointer-events: none;
        }
        .club-hub-rank {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 2;
          border: 1px solid rgba(177,255,77,.35);
          border-radius: 999px;
          padding: 6px 10px;
          color: #dfff9b;
          background: rgba(0,0,0,.44);
          font-size: 11px;
          font-weight: 950;
        }
        .club-hub-rendered-card {
          width: min(100%, 180px) !important;
          position: relative;
          z-index: 1;
        }
        .club-hub-card-meta {
          position: relative;
          z-index: 1;
          width: 100%;
          display: grid;
          justify-items: center;
          gap: 6px;
          margin-top: 10px;
          text-align: center;
        }
        .club-hub-card-meta a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          padding-inline: 12px;
          color: #dfff9b;
          text-decoration: none;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .club-hub-card-meta a:hover,
        .club-hub-card-meta a:focus-visible {
          color: #dfff9b;
          outline: 0;
          text-shadow: 0 0 14px rgba(163,255,18,.42);
        }
        .club-hub-card-meta small {
          display: block;
          color: rgba(255,255,255,.62);
          font-weight: 800;
          font-size: 11px;
          line-height: 1.35;
        }
        .club-hub-feature-list {
          display: grid;
          gap: 10px;
          padding-top: 20px;
        }
        .club-hub-feature-list article {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          padding: 14px;
          background: rgba(0,0,0,.24);
        }
        .club-hub-feature-list span {
          color: #b6ff4d;
          font-size: 13px;
          font-weight: 950;
        }
        .club-hub-feature-list strong {
          font-size: 18px;
                  }
        .club-hub-empty {
          margin-top: 22px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          padding: 26px;
          color: rgba(255,255,255,.72);
          font-weight: 900;
        }
        .club-hub-empty strong {
          display: block;
          max-width: 48ch;
        }
        .club-hub-empty a {
          display: inline-flex;
          margin-top: 13px;
          min-height: 38px;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--club-accent) 58%, rgba(255,255,255,.28));
          border-radius: 999px;
          padding: 0 16px;
          color: #f8fff5;
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
        }
        @media (max-width: 980px) {
          .club-hub { padding: 22px 14px 42px; }
          .club-hub-hero,
          .club-hub-identity,
          .club-hub-section-head { align-items: stretch; flex-direction: column; }
          .club-hub-section-actions { justify-items: start; }
          .club-hub-section-actions small { text-align: left; }
          .club-hub-honours {
            width: 100%;
          }
          .club-hub-logo-stack {
            justify-items: center;
          }
          .club-hub-logo {
            width: min(260px, 70vw);
          }
          .club-hub-honour-row {
            margin-inline: -4px;
          }
          .club-hub-metrics,
          .club-hub-board { grid-template-columns: 1fr; }
          .club-hub-league-table { padding: 18px; }
          .club-hub-table-list {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            overflow-x: auto;
            padding-bottom: 6px;
            scrollbar-width: thin;
            scrollbar-color: color-mix(in srgb, var(--club-accent) 70%, #b5ff4b) rgba(255,255,255,.06);
            -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
            mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
          }
          .club-hub-table-list:focus,
          .club-hub-table-list:hover {
            -webkit-mask-image: none;
            mask-image: none;
            outline: none;
          }
          .club-hub-table-row {
            min-width: 920px;
          }
          .club-hub-feature-list article { grid-template-columns: 42px minmax(0, 1fr); }
          .club-hub-feature-list small { grid-column: 2; }
        }
        @media (max-width: 720px) {
          .club-hub { padding: 18px 10px 36px; }
          .club-hub-shell {
            margin-top: 24px;
            gap: 12px;
          }
          .club-hub-hero {
            min-height: 0;
            padding: 22px 16px;
          }
          .club-hub-identity { gap: 20px; }
          .club-hub-logo-stack { width: 100%; }
          .club-hub-logo { width: min(190px, 58vw); }
          .club-hub-actions {
            width: 100%;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-hub-actions a {
            min-width: 0;
            min-height: 44px;
            padding: 0 10px;
            text-align: center;
          }
          .club-hub-identity h1 {
            margin-top: 10px;
            font-size: clamp(38px, 13vw, 56px);
          }
          .club-hub-identity p,
          .club-hub-board p,
          .club-hub-section-head small,
          .club-hub-feature-list small {
            font-size: 11px;
            line-height: 1.55;
          }
          .club-hub-metrics article,
          .club-hub-board article { padding: 17px; }
          .club-hub-league-table,
          .club-hub-cards {
            min-width: 0;
            overflow: hidden;
            padding: 16px;
          }
          .club-hub-section-head { gap: 15px; }
          .club-hub-section-head strong { font-size: 30px; }
          .club-hub-card-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .club-hub-progressive-controls {
            align-items: stretch;
            flex-direction: column;
          }
          .club-hub-rendered-card { width: min(100%, 190px) !important; }
          .club-hub-fixture-row { gap: 8px; }
          .club-hub-fixture-row img { height: 72px; }
        }
        @media (orientation: landscape) and (max-width: 1100px) and (max-height: 520px) {
          .club-hub {
            padding: 12px 14px 28px;
          }
          .club-hub-back {
            display: inline-flex;
            min-height: 44px;
            align-items: center;
            padding-inline: 16px;
          }
          .club-hub-shell {
            margin-top: 14px;
            gap: 12px;
          }
          .club-hub-hero,
          .club-hub-identity,
          .club-hub-section-head {
            align-items: center;
            flex-direction: row;
          }
          .club-hub-hero {
            min-height: 0;
            padding: 16px 20px;
          }
          .club-hub-identity {
            gap: 24px;
          }
          .club-hub-logo-stack {
            width: 180px;
            gap: 8px;
          }
          .club-hub-logo {
            width: 136px;
          }
          .club-hub-actions {
            width: 180px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .club-hub-actions a {
            min-width: 0;
            min-height: 44px;
            padding-inline: 8px;
            text-align: center;
          }
          .club-hub-identity h1 {
            margin: 7px 0 9px;
            font-size: clamp(38px, 6vw, 52px);
          }
          .club-hub-identity p {
            max-width: 520px;
            font-size: 10px;
            line-height: 1.45;
          }
          .club-hub-metrics {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .club-hub-board {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .club-hub-metrics article,
          .club-hub-board article {
            padding: 14px;
          }
          .club-hub-metrics strong {
            margin-top: 7px;
            font-size: clamp(22px, 3vw, 30px);
          }
          .club-hub-section-head {
            gap: 18px;
          }
          .club-hub-section-head strong {
            font-size: 28px;
          }
          .club-hub-section-actions {
            justify-items: end;
          }
          .club-hub-section-actions small {
            text-align: right;
          }
        }
      `}</style>
    </main>
  );
}
