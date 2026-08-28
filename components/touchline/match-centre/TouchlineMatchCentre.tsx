"use client";

/* The provider owns crest URLs; this preserves the canonical source without a remote-image allowlist. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, Clock3, Crown, Goal, Landmark, Radio, ShieldCheck, Sparkles, Trophy, UsersRound } from "lucide-react";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import type { TouchlinePublicFixture, TouchlinePublicVenue } from "@/lib/football-data/public-fixture";
import type {
  TouchlinePublicFantasyEvent,
  TouchlinePublicFantasyFixtureMatchDetail,
  TouchlinePublicFantasyLineupMember,
  TouchlinePublicFixturePlayerStatistics,
} from "@/lib/football-data/public-fantasy-fixture";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { touchlineLiveCoachForTeam } from "@/lib/touchlineArena/live-coaches";
import {
  isTouchlineLiveReadMetadata,
  mergeTouchlineLiveFixtures,
  selectTouchlineMatchCentreSchedule,
  selectTouchlineMatchCentreFixture,
  touchlineFixtureRailDateLabel,
  touchlineFixtureStatusLabel,
  touchlineMatchCentreDisplayState,
  touchlineFixtureState,
  type TouchlineLiveReadMetadata,
} from "@/lib/touchlineArena/match-centre";

import styles from "./touchline-match-centre.module.css";

type Props = {
  initialFixtures: TouchlinePublicFixture[];
  initialFixtureId?: string | null;
  initialMatchDetail?: TouchlinePublicFantasyFixtureMatchDetail | null;
  canReadMatchDetail?: boolean;
  initialLocale?: TouchLineLocale | null;
  initialNow: number;
  initialReadMetadata?: TouchlineLiveReadMetadata | null;
  initialTimeZone: string;
};

type FixtureSection = "current" | "results";

const copy = {
  "pt-BR": {
    title: "Central da partida", live: "AO VIVO", today: "HOJE", upcoming: "PRÓXIMOS", finished: "ARQUIVO", currentFixtures: "Confrontos desta semana", recentResults: "Últimos resultados", matchweek: "Rodada", roundPending: "Rodada aguardando confirmação TouchLine", competition: "TouchLine England", league: "Liga TouchLine England", england: "Inglaterra", select: "Confrontos", alertsSoon: "Alertas de partida em breve", selectedFixture: "Partida selecionada", noFixtures: "Agenda em atualização", noFixturesCopy: "A programação oficial será exibida assim que a competição publicar fixtures canônicos.", venue: "Estádio", venuePending: "Aguardando confirmação TouchLine do estádio", capacity: "Capacidade", homeOf: "Casa do", photo: "Foto", countdown: "Início em", detail: "Dados da partida", dataPending: "Eventos, escalações e estatísticas aparecem assim que forem verificados pela TouchLine.", recent: "Linha do tempo oficial", form: "Escalações verificadas", players: "Ratings da partida", archive: "Arquivo TouchLine", provider: "TouchLine Verified", timezone: "Horário local", versus: "VS", completed: "ENCERRADO", liveNow: "AO VIVO", next: "PRÓXIMO", official: "TouchLine Data", watch: "Acompanhar partida", liveDataUpdating: "Dados ao vivo em atualização", liveDataUpdatingCopy: "Exibindo o último snapshot verificado; o placar pode estar atrasado.", partialScheduleCopy: "A programação persistida está disponível, mas placares ao vivo aguardam um snapshot verificado.", lastVerified: "ÚLTIMO VERIFICADO", lastVerifiedAt: "Última verificação", events: "eventos oficiais", scoring: "ratings oficiais", lineupAvailable: "Escalação disponível", starters: "Titulares", bench: "Reservas", minutes: "MIN", rating: "NOTA", noScoring: "Sem rating oficial", assist: "Assistência", substitutedFor: "entrou por", dataUnavailable: "—", highlights: "Destaques da partida", bestCoach: "Treinador vencedor", bestCards: "Melhores cards da partida", winnerVerified: "Vitória confirmada", calculating: "Em apuração", ratingVerified: "Rating verificado",
  },
  "en-GB": {
    title: "Match Centre", live: "LIVE NOW", today: "TODAY", upcoming: "UPCOMING", finished: "ARCHIVE", currentFixtures: "This week's fixtures", recentResults: "Latest results", matchweek: "Matchweek", roundPending: "Matchweek awaiting TouchLine confirmation", competition: "TouchLine England", league: "TouchLine England League", england: "England", select: "Fixtures", alertsSoon: "Match alerts coming soon", selectedFixture: "Selected fixture", noFixtures: "Schedule updating", noFixturesCopy: "Official fixtures will appear as soon as the competition publishes the canonical schedule.", venue: "Stadium", venuePending: "Awaiting TouchLine venue verification", capacity: "Capacity", homeOf: "Home of", photo: "Photo", countdown: "Kick-off in", detail: "Match data", dataPending: "Events, line-ups and statistics appear as soon as TouchLine verifies them.", recent: "Official timeline", form: "Verified line-ups", players: "Match ratings", archive: "TouchLine archive", provider: "TouchLine Verified", timezone: "Local time", versus: "VS", completed: "FULL TIME", liveNow: "LIVE", next: "NEXT", official: "TouchLine Data", watch: "Open match", liveDataUpdating: "Live data updating", liveDataUpdatingCopy: "Showing the last verified snapshot; the score may be delayed.", partialScheduleCopy: "The persisted schedule is available, but live scores are awaiting a verified snapshot.", lastVerified: "LAST VERIFIED", lastVerifiedAt: "Last verification", events: "official events", scoring: "official ratings", lineupAvailable: "Line-up available", starters: "Starters", bench: "Bench", minutes: "MIN", rating: "RATING", noScoring: "No official rating", assist: "Assist", substitutedFor: "for", dataUnavailable: "—", highlights: "Match Highlights", bestCoach: "Winning Coach", bestCards: "Top Match Cards", winnerVerified: "Verified win", calculating: "Calculating", ratingVerified: "Verified rating",
  },
} as const;

function fixtureLabel(fixture: TouchlinePublicFixture) {
  return fixture.name || `${fixture.homeTeam?.name ?? "Home"} vs ${fixture.awayTeam?.name ?? "Away"}`;
}

function fixtureDate(
  fixture: Pick<TouchlinePublicFixture, "startsAt">,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  if (!fixture.startsAt || Number.isNaN(Date.parse(fixture.startsAt))) return "—";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(fixture.startsAt));
}

function score(fixture: TouchlinePublicFixture) {
  if (Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore)) return `${fixture.homeScore} — ${fixture.awayScore}`;
  return "VS";
}

function fixtureScorePair(fixture: TouchlinePublicFixture) {
  if (Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore)) {
    return { home: String(fixture.homeScore), away: String(fixture.awayScore) };
  }
  return null;
}

function fixtureRailStatus(
  fixture: TouchlinePublicFixture,
  language: keyof typeof copy,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
) {
  const state = touchlineMatchCentreDisplayState(fixture, metadata, now);
  if (state === "stale") return copy[language].lastVerified;
  if (state === "live") return fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′ · ${copy[language].liveNow}`
    : copy[language].liveNow;
  if (state === "finished") return copy[language].completed;
  return null;
}

function status(
  fixture: TouchlinePublicFixture,
  language: keyof typeof copy,
  timeZone: string,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
) {
  const state = touchlineMatchCentreDisplayState(fixture, metadata, now);
  if (state === "stale") return copy[language].lastVerified;
  if (state === "live") return fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′ · ${touchlineFixtureStatusLabel(fixture.livePeriod, language) || copy[language].liveNow}`
    : copy[language].liveNow;
  if (state === "finished") return copy[language].completed;
  return fixtureDate(fixture, language, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function Countdown({ startsAt, language, initialNow }: { startsAt?: string; language: keyof typeof copy; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const target = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (!Number.isFinite(target)) return null;
  const difference = Math.max(0, target - now);
  const minutes = Math.floor(difference / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  return <strong className={styles.countdown}>{copy[language].countdown} · {days ? `${days}d ` : ""}{String(hours).padStart(2, "0")}h {String(remainingMinutes).padStart(2, "0")}m</strong>;
}

function TeamMark({ fixture, side }: { fixture: TouchlinePublicFixture; side: "home" | "away" }) {
  const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
  const canonicalClub = findTouchLineClub(team?.providerId) ?? findTouchLineClub(team?.name) ?? findTouchLineClub(team?.shortCode);
  const logoUrl = canonicalClub?.logoUrl ?? team?.logoUrl;
  return <span className={styles.teamMark}>{logoUrl ? <img src={logoUrl} alt="" /> : <span>{team?.name?.slice(0, 2).toUpperCase() ?? "TL"}</span>}</span>;
}

function VenueArtwork({ venue }: { venue: TouchlinePublicVenue }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageAvailable = failedImageUrl !== venue.imageUrl;

  return <div className={styles.venueVisual} data-fallback={imageAvailable ? "false" : "true"} aria-hidden="true">
    {imageAvailable
      ? <img src={venue.imageUrl} alt="" width={960} height={960} decoding="async" onError={() => setFailedImageUrl(venue.imageUrl)} />
      : <Landmark size={34} strokeWidth={1.35} />}
  </div>;
}

function verificationLabel(metadata: TouchlineLiveReadMetadata, language: keyof typeof copy, timeZone: string) {
  if (!metadata.fetchedAt || Number.isNaN(Date.parse(metadata.fetchedAt))) return null;
  return `${copy[language].lastVerifiedAt} · ${new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(metadata.fetchedAt))}`;
}

function eventMoment(event: TouchlinePublicFantasyEvent) {
  if (event.minute === undefined) return "—";
  return `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ""}′`;
}

function teamName(detail: TouchlinePublicFantasyFixtureMatchDetail, teamId?: string) {
  const homeTeam = detail.fixture.homeTeam;
  const awayTeam = detail.fixture.awayTeam;
  if (homeTeam && homeTeam.id === teamId) return homeTeam.name;
  if (awayTeam && awayTeam.id === teamId) return awayTeam.name;
  return "TouchLine";
}

function lineupPlayerRows(
  members: readonly TouchlinePublicFantasyLineupMember[],
  statistics: readonly TouchlinePublicFixturePlayerStatistics[],
) {
  const statisticsByPlayer = new Map(statistics.map((row) => [row.playerId, row]));
  return members.map((member) => ({ member, statistic: member.playerId ? statisticsByPlayer.get(member.playerId) : undefined }));
}

function winningTeamId(fixture: TouchlinePublicFixture) {
  if (!Number.isFinite(fixture.homeScore) || !Number.isFinite(fixture.awayScore) || fixture.homeScore === fixture.awayScore) return null;
  const winner = fixture.homeScore! > fixture.awayScore! ? fixture.homeTeam : fixture.awayTeam;
  return winner?.providerId ?? winner?.id ?? null;
}

function topRatedPlayers(detail: TouchlinePublicFantasyFixtureMatchDetail) {
  return detail.playerStatistics
    .filter((row) => Number.isFinite(row.rating) && (row.appearanceStatus === "started" || row.appearanceStatus === "substitute"))
    .sort((left, right) => (right.rating ?? Number.NEGATIVE_INFINITY) - (left.rating ?? Number.NEGATIVE_INFINITY)
      || left.playerName.localeCompare(right.playerName))
    .slice(0, 3);
}

function MatchTeamSheet({
  detail,
  teamId,
  language,
}: {
  detail: TouchlinePublicFantasyFixtureMatchDetail;
  teamId?: string;
  language: keyof typeof copy;
}) {
  const members = lineupPlayerRows(
    detail.lineups.filter((member) => member.teamId === teamId),
    detail.playerStatistics,
  );
  const starters = members.filter(({ member }) => member.isStarter);
  const substitutes = members.filter(({ member }) => !member.isStarter);
  const renderRows = (rows: typeof members) => rows.map(({ member, statistic }) => <li key={member.id}>
    <span className={styles.shirtNumber}>{member.jerseyNumber ?? "—"}</span>
    <span className={styles.playerIdentity}><strong>{member.playerName}</strong><small>{member.position ?? "—"}</small></span>
    <span><small>{copy[language].minutes}</small><b>{statistic?.minutes ?? "—"}</b></span>
    <span><small>{copy[language].rating}</small><b>{statistic?.rating ?? "—"}</b></span>
  </li>);
  return <article className={styles.teamSheet}>
    <header><TeamMark fixture={{ ...detail.fixture, providerId: detail.fixture.id, provider: "sportmonks", source: { provider: "sportmonks", providerId: detail.fixture.id, lastSyncedAt: detail.capturedAt } } as TouchlinePublicFixture} side={detail.fixture.homeTeam?.id === teamId ? "home" : "away"} /><strong>{teamName(detail, teamId)}</strong></header>
    <h4>{copy[language].starters} · {starters.length}</h4><ol>{renderRows(starters)}</ol>
    <h4>{copy[language].bench} · {substitutes.length}</h4><ol>{renderRows(substitutes)}</ol>
  </article>;
}

export default function TouchlineMatchCentre({
  initialFixtures,
  initialFixtureId,
  initialMatchDetail = null,
  canReadMatchDetail = false,
  initialLocale,
  initialNow,
  initialReadMetadata = null,
  initialTimeZone,
}: Props) {
  const language: keyof typeof copy = initialLocale === "pt-BR" ? "pt-BR" : "en-GB";
  const [fixtures, setFixtures] = useState(initialFixtures);
  const [selectedId, setSelectedId] = useState(initialFixtureId ?? null);
  const [readMetadata, setReadMetadata] = useState<TouchlineLiveReadMetadata | null>(initialReadMetadata);
  const [matchDetail, setMatchDetail] = useState<TouchlinePublicFantasyFixtureMatchDetail | null>(initialMatchDetail);
  const [now, setNow] = useState(initialNow);
  const dictionary = copy[language];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canReadMatchDetail) return;
    const schedule = selectTouchlineMatchCentreSchedule(fixtures, now);
    const visibleFixtures = [...schedule.currentFixtures, ...schedule.recentResults];
    const selected = selectTouchlineMatchCentreFixture(visibleFixtures, selectedId, now);
    const fixtureId = selected?.providerId;
    if (!fixtureId || matchDetail?.fixture.id === fixtureId) return;
    const requestedFixtureId = fixtureId;
    const controller = new AbortController();
    async function loadDetail() {
      try {
        const response = await fetch(`/api/football-data/fantasy/fixture?fixtureId=${encodeURIComponent(requestedFixtureId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json() as { ok?: boolean; data?: TouchlinePublicFantasyFixtureMatchDetail };
        const detail = payload.data;
        if (response.ok && payload.ok && detail?.fixture.id === requestedFixtureId) setMatchDetail(detail);
        else setMatchDetail(null);
      } catch {
        if (!controller.signal.aborted) setMatchDetail(null);
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [canReadMatchDetail, fixtures, matchDetail?.fixture.id, now, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/football-data/fantasy/livescores?snapshot=1", { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { ok?: boolean; data?: TouchlinePublicFixture[]; state?: unknown; degraded?: unknown; fetchedAt?: unknown };
        const metadataCandidate = {
          state: payload.state,
          degraded: payload.degraded,
          ...(payload.fetchedAt === undefined ? {} : { fetchedAt: payload.fetchedAt }),
        };
        const metadata = isTouchlineLiveReadMetadata(metadataCandidate) ? metadataCandidate : null;
        const liveSnapshot = Array.isArray(payload.data) ? payload.data : null;
        if (payload.ok && liveSnapshot && metadata) {
          setFixtures((current) => mergeTouchlineLiveFixtures(current, liveSnapshot));
          setReadMetadata(metadata);
        }
      } catch {
        // The server-rendered canonical schedule remains useful during a transient outage.
      }
    }
    void load();
    const timer = window.setInterval(load, 45_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const schedule = useMemo(() => selectTouchlineMatchCentreSchedule(fixtures, now), [fixtures, now]);
  const visibleFixtures = useMemo(
    () => [...schedule.currentFixtures, ...schedule.recentResults],
    [schedule.currentFixtures, schedule.recentResults],
  );
  const selected = useMemo(() => selectTouchlineMatchCentreFixture(visibleFixtures, selectedId, now), [now, selectedId, visibleFixtures]);
  const verifiedDetail = matchDetail?.fixture.id === selected?.providerId ? matchDetail : null;
  const bestCards = useMemo(() => verifiedDetail ? topRatedPlayers(verifiedDetail) : [], [verifiedDetail]);
  const bestCoach = useMemo(() => {
    if (!selected || touchlineFixtureState(selected, now) !== "finished") return null;
    return touchlineLiveCoachForTeam(winningTeamId(selected));
  }, [now, selected]);
  const fixtureSections: Array<{ id: FixtureSection; label: string; fixtures: TouchlinePublicFixture[] }> = [
    { id: "current", label: dictionary.currentFixtures, fixtures: schedule.currentFixtures },
    { id: "results", label: dictionary.recentResults, fixtures: schedule.recentResults },
  ];

  function selectFixture(fixture: TouchlinePublicFixture) {
    setSelectedId(fixture.id);
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", fixture.id);
    window.history.replaceState({}, "", url);
    if (window.matchMedia("(max-width: 850px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("touchline-match-panel")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <main className={styles.shell} data-testid="touchline-match-centre">
      <header className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.brandMark}><img src="/touchlineArena/brand/tl-shield-lime.svg" alt="" /></span>
          <span className={styles.brandWordmark}><b>TOUCHLINE</b><small>ENGLAND</small></span>
        </span>
        <div className={styles.headerTitle}><span>{dictionary.official}</span><h1 className={styles.title}>{dictionary.title}</h1></div>
        <div className={styles.headerSignal}>
          <span className={styles.signalPulse} aria-hidden="true" />
          <span><small>{dictionary.currentFixtures}</small><strong>{schedule.currentFixtures.length}/10</strong></span>
        </div>
      </header>
      <TouchlineGlobalNavigation locale={language} currentRoute="live" surface="public" />
      <p className={styles.selectionAnnouncement} role="status" aria-live="polite" aria-atomic="true">
        {selected ? `${dictionary.selectedFixture}: ${fixtureLabel(selected)} · ${status(selected, language, initialTimeZone, readMetadata, now)}` : dictionary.noFixtures}
      </p>

      {readMetadata?.degraded ? <aside className={styles.freshnessNotice} role="status" aria-live="polite" aria-atomic="true" data-state={readMetadata.state}>
        <Clock3 size={17} aria-hidden="true" />
        <span>
          <strong>{dictionary.liveDataUpdating}</strong>
          <small>{readMetadata.state === "partial-persisted-schedule" ? dictionary.partialScheduleCopy : dictionary.liveDataUpdatingCopy}</small>
          {verificationLabel(readMetadata, language, initialTimeZone) ? <em>{verificationLabel(readMetadata, language, initialTimeZone)}</em> : null}
        </span>
      </aside> : null}

      <section className={styles.layout}>
        <aside className={styles.fixtureRail} aria-label={dictionary.select}>
          <div className={styles.railHeading}>
            <span className={styles.englandFlag} aria-label={dictionary.england} role="img" />
            <span className={styles.railLeague}><small>{dictionary.competition}</small><strong>{dictionary.league}</strong></span>
            <span className={styles.fixtureCount} aria-label={`${schedule.currentFixtures.length} + ${schedule.recentResults.length}`}><Radio size={14} aria-hidden="true" />{schedule.currentFixtures.length} + {schedule.recentResults.length}</span>
          </div>
          <div
            className={styles.fixtureScroller}
            tabIndex={0}
            aria-label={`${dictionary.select}: ${schedule.currentFixtures.length} + ${schedule.recentResults.length}`}
          >
            {fixtureSections.map((section) => {
              const railFixtures = section.fixtures;
              const isResultSection = section.id === "results";
              return railFixtures.length ? <section key={section.id} className={styles.fixtureGroup} data-section={section.id}>
              <h2><span>{section.label}</span><b>{railFixtures.length}</b></h2>
              <div className={styles.fixtureList}>{railFixtures.map((fixture) => {
                const isSelected = selected?.id === fixture.id;
                const fixtureScores = fixtureScorePair(fixture);
                const railStatus = fixtureRailStatus(fixture, language, readMetadata, now);
                return <button key={fixture.id} type="button" aria-controls={selected ? "touchline-match-panel" : undefined} aria-pressed={isSelected} onClick={() => selectFixture(fixture)} className={isSelected ? styles.selectedFixture : styles.fixture}>
                  <span className={styles.fixtureStack}>
                    <span className={styles.fixtureCentre}>
                      <time
                        dateTime={fixture.startsAt}
                        aria-label={fixtureDate(fixture, language, initialTimeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                      >
                        <span className={styles.fixtureDay}>{touchlineFixtureRailDateLabel(fixture, language, initialTimeZone, now)}</span>
                        <span className={styles.fixtureKickoff}>{fixtureDate(fixture, language, initialTimeZone, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </time>
                      {railStatus ? <small className={touchlineMatchCentreDisplayState(fixture, readMetadata, now) === "live" ? styles.liveStatus : ""}>{railStatus}</small> : null}
                    </span>
                    <span className={styles.fixtureTeams}>
                      <span className={styles.fixtureTeam}><TeamMark fixture={fixture} side="home" /><b>{fixture.homeTeam?.name ?? "Home"}</b></span>
                      <span className={styles.fixtureTeam}><TeamMark fixture={fixture} side="away" /><b>{fixture.awayTeam?.name ?? "Away"}</b></span>
                    </span>
                  </span>
                  {fixtureScores ? <span className={styles.fixtureScore} aria-label={`${fixtureScores.home} ${dictionary.versus} ${fixtureScores.away}`}>
                    <strong>{fixtureScores.home}</strong><i aria-hidden="true" /><strong>{fixtureScores.away}</strong>
                  </span> : null}
                  <span
                    className={styles.fixtureAlert}
                    role="img"
                    title={isResultSection ? dictionary.completed : dictionary.alertsSoon}
                    aria-label={isResultSection ? dictionary.completed : dictionary.alertsSoon}
                  >{isResultSection ? <Trophy size={13} aria-hidden="true" /> : <BellRing size={13} aria-hidden="true" />}</span>
                </button>;
              })}</div>
              </section> : null;
            })}
            {!visibleFixtures.length ? <div className={styles.emptyRail}><CalendarDays size={22} /><strong>{dictionary.noFixtures}</strong></div> : null}
          </div>
        </aside>

        {selected ? <section id="touchline-match-panel" className={styles.matchPanel} aria-label={fixtureLabel(selected)}>
          <div className={styles.matchMeta}><span><Trophy size={14} /> {dictionary.competition}</span><span>{selected.roundName ? `${dictionary.matchweek} · ${selected.roundName}` : dictionary.roundPending}</span><span><Clock3 size={14} /> {dictionary.timezone}</span></div>
          <div className={styles.hero} data-state={touchlineMatchCentreDisplayState(selected, readMetadata, now)}>
            <span className={styles.statusPill}>{status(selected, language, initialTimeZone, readMetadata, now)}</span>
            <div className={styles.heroTeams}>
              <div><TeamMark fixture={selected} side="home" /><strong>{selected.homeTeam?.name ?? "Home"}</strong></div>
              <b className={styles.score}>{score(selected)}</b>
              <div><TeamMark fixture={selected} side="away" /><strong>{selected.awayTeam?.name ?? "Away"}</strong></div>
            </div>
            <time className={styles.heroKickoff} dateTime={selected.startsAt}>
              <span><CalendarDays size={14} aria-hidden="true" />{fixtureDate(selected, language, initialTimeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <strong><Clock3 size={15} aria-hidden="true" />{fixtureDate(selected, language, initialTimeZone, { hour: "2-digit", minute: "2-digit", hour12: false })}</strong>
            </time>
            {touchlineFixtureState(selected, now) === "upcoming" ? <Countdown startsAt={selected.startsAt} language={language} initialNow={now} /> : <strong className={styles.countdown}>{touchlineMatchCentreDisplayState(selected, readMetadata, now) === "stale" ? dictionary.liveDataUpdating : selected.status ?? dictionary.provider}</strong>}
          </div>

          <div className={styles.infoGrid}>
            {selected.venue ? <article className={styles.venueCard}>
              <VenueArtwork venue={selected.venue} />
              <div className={styles.venueCopy}>
                <span>{dictionary.venue}</span>
                <strong>{selected.venue.name}</strong>
                <small>{selected.venue.capacity ? `${dictionary.capacity} ${new Intl.NumberFormat(language).format(selected.venue.capacity)} · ` : ""}{dictionary.homeOf} {selected.venue.homeClubName}</small>
                {selected.venue.photoCredit ? <em>{dictionary.photo}: <a href={selected.venue.photoCredit.sourceUrl} target="_blank" rel="noreferrer">{selected.venue.photoCredit.label}</a> · <a href={selected.venue.photoCredit.licenseUrl} target="_blank" rel="noreferrer">{selected.venue.photoCredit.licenseLabel}</a></em> : null}
              </div>
            </article> : <article><span>{dictionary.venue}</span><strong>{dictionary.venuePending}</strong><small>{dictionary.official}</small></article>}
            <article><span>{dictionary.detail}</span><strong>{touchlineMatchCentreDisplayState(selected, readMetadata, now) === "stale" ? dictionary.lastVerified : touchlineFixtureState(selected, now) === "live" ? dictionary.liveNow : touchlineFixtureState(selected, now) === "finished" ? dictionary.completed : dictionary.watch}</strong><small>{dictionary.dataPending}</small></article>
            <article><span>{dictionary.archive}</span><strong>{fixtureLabel(selected)}</strong><small>{selected.verifiedAt ? `${dictionary.provider} · ${fixtureDate({ startsAt: selected.verifiedAt }, language, initialTimeZone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : dictionary.provider}</small></article>
          </div>

          {verifiedDetail ? <section className={styles.verifiedMatchData} data-testid="touchline-verified-match-data">
            <header className={styles.verifiedHeading}>
              <div><ShieldCheck size={18} /><span>{dictionary.provider}</span><strong>{verifiedDetail.events.length} {dictionary.events} · {verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length} {dictionary.scoring}</strong></div>
              {verifiedDetail.lineupAvailableAt ? <time dateTime={verifiedDetail.lineupAvailableAt}><UsersRound size={15} /> {dictionary.lineupAvailable} · {fixtureDate({ startsAt: verifiedDetail.lineupAvailableAt }, language, initialTimeZone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time> : null}
            </header>
            <section className={styles.highlightDeck} aria-label={dictionary.highlights}>
              <header><Sparkles size={16} aria-hidden="true" /><span>{dictionary.highlights}</span></header>
              <article className={styles.coachHighlight}>
                <Crown size={17} aria-hidden="true" />
                <span><small>{dictionary.bestCoach}</small><strong>{bestCoach?.coach.displayName ?? bestCoach?.coach.name ?? dictionary.calculating}</strong><em>{bestCoach ? `${teamName(verifiedDetail, bestCoach.coach.teamId)} · ${dictionary.winnerVerified}` : dictionary.dataPending}</em></span>
              </article>
              <div className={styles.cardHighlights}>
                <small>{dictionary.bestCards}</small>
                <ol>{bestCards.length ? bestCards.map((row, index) => <li key={row.playerId}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span><strong>{row.playerName}</strong><em>{teamName(verifiedDetail, row.teamId)} · {dictionary.ratingVerified}</em></span>
                  <mark>{row.rating}</mark>
                </li>) : <li className={styles.pendingHighlight}><span><strong>{dictionary.calculating}</strong><em>{dictionary.dataPending}</em></span></li>}</ol>
              </div>
            </section>
            <div className={styles.matchEvidenceGrid}>
              <section className={styles.timelinePanel}>
                <div className={styles.panelTitle}><Goal size={17} /><div><span>{dictionary.recent}</span><strong>{fixtureLabel(selected)}</strong></div></div>
                <ol>{verifiedDetail.events.map((event) => {
                  const relatedPlayerName = event.relatedPlayerName;
                  return <li key={event.id}>
                    <time>{eventMoment(event)}</time>
                    <span><strong>{event.type ?? "Event"}</strong><b>{event.playerName ?? "—"}</b>{relatedPlayerName ? <small>{/substitution/i.test(event.type ?? "") ? dictionary.substitutedFor : dictionary.assist}: {relatedPlayerName}</small> : null}</span>
                    <em>{teamName(verifiedDetail, event.teamId)}</em>
                  </li>;
                })}</ol>
              </section>
              <section className={styles.pointsSummary}>
                <div className={styles.panelTitle}><Trophy size={17} /><div><span>{dictionary.players}</span><strong>{verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length} {dictionary.rating}</strong></div></div>
                <ul>{verifiedDetail.playerStatistics.filter((row) => row.rating !== null).map((row) => <li key={row.playerId}><span><strong>{row.playerName}</strong><small>{teamName(verifiedDetail, row.teamId)}</small></span><b>{row.rating}</b></li>)}</ul>
              </section>
            </div>
            <div className={styles.lineupGrid}>
              <MatchTeamSheet detail={verifiedDetail} teamId={verifiedDetail.fixture.homeTeam?.id} language={language} />
              <MatchTeamSheet detail={verifiedDetail} teamId={verifiedDetail.fixture.awayTeam?.id} language={language} />
            </div>
          </section> : <div className={styles.contentGrid}>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><ShieldCheck size={17} /><div><span>{dictionary.recent}</span><strong>{fixtureLabel(selected)}</strong></div></div><p>{dictionary.dataPending}</p></section>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><Trophy size={17} /><div><span>{dictionary.form}</span><strong>{dictionary.players}</strong></div></div><p>{dictionary.dataPending}</p></section>
          </div>}
        </section> : <section className={styles.emptyPanel}><CalendarDays size={42} /><span>{dictionary.noFixtures}</span><p>{dictionary.noFixturesCopy}</p></section>}
      </section>
    </main>
  );
}
