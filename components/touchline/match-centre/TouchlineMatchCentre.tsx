"use client";

/* The provider owns crest URLs; this preserves the canonical source without a remote-image allowlist. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CalendarDays, Clock3, Crown, Goal, Landmark, ShieldCheck, Sparkles, Trophy, UsersRound } from "lucide-react";
import TouchlineFixtureAlerts from "./TouchlineFixtureAlerts";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlinePageControls from "@/components/touchline/TouchlinePageControls";
import { Logo } from "@/components/logo";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchlinePublicFixture, TouchlinePublicVenue } from "@/lib/football-data/public-fixture";
import type {
  TouchlinePublicFantasyEvent,
  TouchlinePublicFantasyFixtureMatchDetail,
  TouchlinePublicFantasyLineupMember,
  TouchlinePublicFixturePlayerStatistics,
} from "@/lib/football-data/public-fantasy-fixture";
import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { type TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";
import { touchlineMatchEventLabel, touchlineMatchEventRelatedPlayerLabel } from "@/lib/touchlineArena/match-event-i18n";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";
import { touchlineLiveCoachForTeam } from "@/lib/touchlineArena/live-coaches";
import {
  isTouchlineLiveReadMetadata,
  mergeTouchlineLiveFixtures,
  orderTouchlineMatchEvents,
  orderTouchlineMatchRatings,
  selectTouchlineMatchCentreSchedule,
  selectTouchlineMatchCentreFixture,
  touchlineFixtureRailDateLabel,
  touchlineFixtureStatusLabel,
  touchlineMatchCentreDisplayState,
  touchlineFixtureState,
  type TouchlineLiveReadMetadata,
  type TouchlineMatchCentreDisplayState,
} from "@/lib/touchlineArena/match-centre";

import styles from "./touchline-match-centre.module.css";
import sharedControls from "../TouchlineGlobalNavigation.module.css";

type Props = {
  initialFixtures: TouchlinePublicFixture[];
  initialFixtureId?: string | null;
  initialMatchDetail?: TouchlinePublicFantasyFixtureMatchDetail | null;
  canReadMatchDetail?: boolean;
  initialLocale?: TouchLineLocale | null;
  initialNow: number;
  initialReadMetadata?: TouchlineLiveReadMetadata | null;
  initialTimeZone: string;
  initialSeasonName?: string | null;
  draftLocalesEnabled?: boolean;
  accountLocaleContext?: AccountLocaleContext;
};

type FixtureSection = "current" | "results";

function matchCentreSeasonLabel(seasonName: string | null, language: string, draftLocalesEnabled = false) {
  const name = seasonName?.trim();
  if (!name) return null;
  const shortSeason = /^(\d{4})\s*[/-]\s*(\d{2})$/.exec(name);
  let displayName = name;
  if (shortSeason) {
    const startYear = Number(shortSeason[1]);
    const endSuffix = Number(shortSeason[2]);
    const endYear = Math.floor(startYear / 100) * 100 + endSuffix + (endSuffix < startYear % 100 ? 100 : 0);
    displayName = `${startYear}/${endYear}`;
  }
  return `${getTouchlineMatchCentreCopy(language, draftLocalesEnabled).season} ${displayName}`;
}

function fixtureLabel(fixture: TouchlinePublicFixture, language: TouchLineLocale, draftLocalesEnabled = false) {
  const dictionary = getTouchlineMatchCentreCopy(language, draftLocalesEnabled);
  return fixture.name || `${fixture.homeTeam?.name ?? dictionary.homeFallback} vs ${fixture.awayTeam?.name ?? dictionary.awayFallback}`;
}

function fixtureDate(
  fixture: Pick<TouchlinePublicFixture, "startsAt">,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  draftLocalesEnabled = false,
) {
  if (!fixture.startsAt || Number.isNaN(Date.parse(fixture.startsAt))) return "—";
  return new Intl.DateTimeFormat(resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled), { ...options, calendar: "gregory", timeZone }).format(new Date(fixture.startsAt));
}

function score(fixture: TouchlinePublicFixture, displayState: TouchlineMatchCentreDisplayState | null) {
  if (Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore)) return `${fixture.homeScore} — ${fixture.awayScore}`;
  if (displayState === "live" && !Number.isFinite(fixture.homeScore) && !Number.isFinite(fixture.awayScore)) return "0 — 0";
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
  language: TouchLineLocale,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
  draftLocalesEnabled = false,
) {
  const state = touchlineMatchCentreDisplayState(fixture, metadata, now);
  if (state === "stale") return getTouchlineMatchCentreCopy(language, draftLocalesEnabled).lastVerified;
  if (state === "live") return fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′ · ${getTouchlineMatchCentreCopy(language, draftLocalesEnabled).liveNow}`
    : getTouchlineMatchCentreCopy(language, draftLocalesEnabled).liveNow;
  if (state === "finished") return getTouchlineMatchCentreCopy(language, draftLocalesEnabled).completed;
  return null;
}

function status(
  fixture: TouchlinePublicFixture,
  language: TouchLineLocale,
  timeZone: string,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
  draftLocalesEnabled = false,
) {
  const state = touchlineMatchCentreDisplayState(fixture, metadata, now);
  if (state === "stale") return getTouchlineMatchCentreCopy(language, draftLocalesEnabled).lastVerified;
  if (state === "live") return fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′ · ${touchlineFixtureStatusLabel(fixture.livePeriod, language, draftLocalesEnabled) || getTouchlineMatchCentreCopy(language, draftLocalesEnabled).liveNow}`
    : getTouchlineMatchCentreCopy(language, draftLocalesEnabled).liveNow;
  if (state === "finished") return getTouchlineMatchCentreCopy(language, draftLocalesEnabled).completed;
  return fixtureDate(fixture, language, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false }, draftLocalesEnabled);
}

function Countdown({ startsAt, language, initialNow, draftLocalesEnabled = false }: { startsAt?: string; language: TouchLineLocale; initialNow: number; draftLocalesEnabled?: boolean }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const dictionary = getTouchlineMatchCentreCopy(language, draftLocalesEnabled);
  const target = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (!Number.isFinite(target)) return null;
  const difference = Math.max(0, target - now);
  const minutes = Math.floor(difference / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  return <strong className={styles.countdown}>{dictionary.countdown} · {days ? `${days}${dictionary.dayUnit} ` : ""}{String(hours).padStart(2, "0")}{dictionary.hourUnit} {String(remainingMinutes).padStart(2, "0")}{dictionary.minuteUnit}</strong>;
}

function TeamMark({ fixture, side }: { fixture: TouchlinePublicFixture; side: "home" | "away" }) {
  const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
  const canonicalClub = findTouchLineClub(team?.providerId) ?? findTouchLineClub(team?.name) ?? findTouchLineClub(team?.shortCode);
  const logoUrl = canonicalClub?.logoUrl ?? team?.logoUrl;
  // Live used a fixed green halo for every crest. Keep the visual strength
  // appropriate to the placement in CSS, but take the hue from the club.
  const accent = canonicalClub?.accent ?? "#a3ff12";
  return <span className={styles.teamMark} style={{ "--team-mark-neon": accent } as CSSProperties}>{logoUrl ? <img src={logoUrl} alt="" /> : <span>{team?.name?.slice(0, 2).toUpperCase() ?? "TL"}</span>}</span>;
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

function HeroVenueArtwork({ venue }: { venue?: TouchlinePublicVenue }) {
  const [failedInteriorImageUrl, setFailedInteriorImageUrl] = useState<string | null>(null);
  const interiorImageUrl = venue?.interiorImageUrl;
  if (!interiorImageUrl || failedInteriorImageUrl === interiorImageUrl) return null;

  return <img
    className={styles.heroVenueArtwork}
    src={interiorImageUrl}
    alt=""
    width={1600}
    height={1000}
    decoding="async"
    aria-hidden="true"
    onError={() => setFailedInteriorImageUrl(interiorImageUrl)}
  />;
}

function verificationLabel(metadata: TouchlineLiveReadMetadata, language: TouchLineLocale, timeZone: string, draftLocalesEnabled = false) {
  if (!metadata.fetchedAt || Number.isNaN(Date.parse(metadata.fetchedAt))) return null;
  return `${getTouchlineMatchCentreCopy(language, draftLocalesEnabled).lastVerifiedAt} · ${fixtureDate({ startsAt: metadata.fetchedAt }, language, timeZone, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }, draftLocalesEnabled)}`;
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
  return orderTouchlineMatchRatings(detail.playerStatistics.filter((row) => (
    Number.isFinite(row.rating)
    && (row.appearanceStatus === "started" || row.appearanceStatus === "substitute")
  )))
    .slice(0, 3);
}

function openSelectedLineup(event: MouseEvent<HTMLAnchorElement>) {
  // Modified clicks retain normal link behaviour. A normal click scrolls
  // without adding history entries that could outlive the selected fixture.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const lineup = document.getElementById("touchline-match-lineups");
  if (!lineup) return;
  event.preventDefault();
  lineup.focus({ preventScroll: true });
  lineup.scrollIntoView({ block: "start" });
}

function MatchTeamSheet({
  detail,
  teamId,
  language,
  draftLocalesEnabled = false,
}: {
  detail: TouchlinePublicFantasyFixtureMatchDetail;
  teamId?: string;
  language: TouchLineLocale;
  draftLocalesEnabled?: boolean;
}) {
  const members = lineupPlayerRows(
    detail.lineups.filter((member) => member.teamId === teamId),
    detail.playerStatistics,
  );
  const starters = members.filter(({ member }) => member.isStarter);
  const substitutes = members.filter(({ member }) => !member.isStarter);
  const renderRows = (rows: typeof members) => rows.map(({ member, statistic }) => <li key={member.id}>
    <span className={styles.shirtNumber}>{member.jerseyNumber ?? "—"}</span>
    <span className={styles.playerIdentity}><strong>{member.playerName}</strong><small>{(draftLocalesEnabled ? localizedPositionLabel(member.position, language, true) : member.position) ?? "—"}</small></span>
    <span><small>{getTouchlineMatchCentreCopy(language, draftLocalesEnabled).minutes}</small><b>{statistic?.minutes ?? "—"}</b></span>
    <span><small>{getTouchlineMatchCentreCopy(language, draftLocalesEnabled).rating}</small><b>{statistic?.rating ?? "—"}</b></span>
  </li>);
  return <article className={styles.teamSheet}>
    <header><TeamMark fixture={{ ...detail.fixture, providerId: detail.fixture.id, provider: "sportmonks", source: { provider: "sportmonks", providerId: detail.fixture.id, lastSyncedAt: detail.capturedAt } } as TouchlinePublicFixture} side={detail.fixture.homeTeam?.id === teamId ? "home" : "away"} /><strong>{teamName(detail, teamId)}</strong></header>
    <h4>{getTouchlineMatchCentreCopy(language, draftLocalesEnabled).starters} · {starters.length}</h4><ol>{renderRows(starters)}</ol>
    <h4>{getTouchlineMatchCentreCopy(language, draftLocalesEnabled).bench} · {substitutes.length}</h4><ol>{renderRows(substitutes)}</ol>
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
  initialSeasonName = null,
  draftLocalesEnabled = false,
  accountLocaleContext = { mode: "unavailable" },
}: Props) {
  const language = resolveTouchlineCatalogueLocale(initialLocale, draftLocalesEnabled);
  const textDirection = language === "ar-SA" ? "rtl" : "ltr";
  const [fixtures, setFixtures] = useState(initialFixtures);
  const [selectedId, setSelectedId] = useState(initialFixtureId ?? null);
  const [readMetadata, setReadMetadata] = useState<TouchlineLiveReadMetadata | null>(initialReadMetadata);
  const [matchDetail, setMatchDetail] = useState<TouchlinePublicFantasyFixtureMatchDetail | null>(initialMatchDetail);
  const [now, setNow] = useState(initialNow);
  const dictionary = getTouchlineMatchCentreCopy(language, draftLocalesEnabled);
  const seasonLabel = matchCentreSeasonLabel(initialSeasonName, language, draftLocalesEnabled);
  const schedule = useMemo(() => selectTouchlineMatchCentreSchedule(fixtures, now), [fixtures, now]);
  const visibleFixtures = useMemo(
    () => [...schedule.currentFixtures, ...schedule.recentResults],
    [schedule.currentFixtures, schedule.recentResults],
  );
  const selected = useMemo(() => selectTouchlineMatchCentreFixture(visibleFixtures, selectedId, now), [now, selectedId, visibleFixtures]);
  const detailRefresh = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canReadMatchDetail) return;
    const fixtureId = selected?.providerId;
    if (!fixtureId) return;
    const requestedFixtureId = fixtureId;
    let active = true;
    let currentRequest: { controller: AbortController; deadline: number | null } | null = null;
    async function loadDetail() {
      if (!active || currentRequest || document.visibilityState !== "visible") return;
      const request = { controller: new AbortController(), deadline: null as number | null };
      currentRequest = request;
      // Match the presentation-refresh deadline. It covers headers and body,
      // even when an underlying promise fails to settle after abort.
      request.deadline = window.setTimeout(() => {
        request.controller.abort();
        if (currentRequest === request) currentRequest = null;
      }, 8_000);
      const isCurrent = () => active && currentRequest === request && !request.controller.signal.aborted;
      try {
        const response = await fetch(`/api/football-data/fantasy/fixture?fixtureId=${encodeURIComponent(requestedFixtureId)}`, {
          signal: request.controller.signal,
          cache: "no-store",
        });
        if (!isCurrent()) return;
        if (response.status === 401) { setMatchDetail(null); return; }
        if (!response.ok) return;
        const payload = await response.json() as { ok?: boolean; data?: TouchlinePublicFantasyFixtureMatchDetail };
        // Selection/unmount may change while JSON decoding is pending.
        if (!isCurrent()) return;
        const detail = payload.data;
        if (payload.ok && detail?.fixture.id === requestedFixtureId) setMatchDetail(detail);
      } catch {
        // Keep the last verified snapshot through transient network/server errors.
      } finally {
        if (request.deadline !== null) window.clearTimeout(request.deadline);
        if (currentRequest === request) currentRequest = null;
      }
    }
    detailRefresh.current = loadDetail;
    void loadDetail();
    return () => {
      active = false;
      if (currentRequest) {
        currentRequest.controller.abort();
        if (currentRequest.deadline !== null) window.clearTimeout(currentRequest.deadline);
        currentRequest = null;
      }
      if (detailRefresh.current === loadDetail) detailRefresh.current = null;
    };
  }, [canReadMatchDetail, selected?.providerId]);

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
    // Share the existing cadence: at most 80 periodic persisted-detail reads/hour
    // while visible, plus a selection's initial read; no provider request here.
    const timer = window.setInterval(() => { void load(); void detailRefresh.current?.(); }, 45_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const selectedDisplayState = selected ? touchlineMatchCentreDisplayState(selected, readMetadata, now) : null;
  const selectedCanonicalState = selected ? touchlineFixtureState(selected, now) : null;
  const verifiedDetail = matchDetail?.fixture.id === selected?.providerId ? matchDetail : null;
  const selectedHomeClub = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === selected?.homeTeam?.providerId);
  const verifiedHomeAccent = selected?.venue ? selectedHomeClub?.accent : undefined;
  // Stay with this fixture's verified teamsheet. ClubHub may already preview
  // the next fixture, so its generic lineup anchor loses the selected match.
  const homeLineupHref = selectedHomeClub
    ? "#touchline-match-lineups"
    : null;
  const homeLineupAvailable = Boolean(
    verifiedDetail?.lineupAvailableAt
    && verifiedDetail.lineups.some((member) => member.teamId === selected?.homeTeam?.providerId)
    && (selectedCanonicalState === "live" || selectedCanonicalState === "finished"),
  );
  // A line-up is only useful when the official match state can support one.
  // Keep this neutral: every canonical home club receives the same verified
  // call-to-action rather than giving one club a privileged hero treatment.
  const showHomeLineupCallout = Boolean(
    homeLineupHref
    && (selectedCanonicalState === "live" || selectedCanonicalState === "finished"),
  );
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
    <main className={styles.shell} data-testid="touchline-match-centre" lang={language}>
      <header className={styles.header} dir="ltr">
        <Logo href={`/live?lang=${encodeURIComponent(language)}${selected ? `&fixture=${encodeURIComponent(selected.id)}` : ""}`} officialArena minimalMark subtitle="TouchLine Futebol Cards" wordmarkClassName="text-[clamp(26px,3.2vw,34px)]" />
        <div className={styles.headerTitle}><span>{dictionary.official}</span><h1 className={styles.title}>{dictionary.title}</h1></div>
      </header>
      <div className={styles.toolbar} dir="ltr">
        <TouchlineGlobalNavigation locale={language} currentRoute="live" surface="public" draftLocalesEnabled={draftLocalesEnabled} showAudioControl={false} className={styles.toolbarNavigation} />
        <TouchlinePageControls locale={language} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} />
      </div>
      <p className={styles.selectionAnnouncement} role="status" aria-live="polite" aria-atomic="true">
        {selected ? `${dictionary.selectedFixture}: ${fixtureLabel(selected, language, draftLocalesEnabled)} · ${status(selected, language, initialTimeZone, readMetadata, now, draftLocalesEnabled)}` : dictionary.noFixtures}
      </p>

      {readMetadata?.degraded ? <aside className={styles.freshnessNotice} role="status" aria-live="polite" aria-atomic="true" data-state={readMetadata.state}>
        <Clock3 size={17} aria-hidden="true" />
        <span dir={textDirection}>
          <strong>{dictionary.liveDataUpdating}</strong>
          <small>{readMetadata.state === "partial-persisted-schedule" ? dictionary.partialScheduleCopy : dictionary.liveDataUpdatingCopy}</small>
          {verificationLabel(readMetadata, language, initialTimeZone, draftLocalesEnabled) ? <em>{verificationLabel(readMetadata, language, initialTimeZone, draftLocalesEnabled)}</em> : null}
        </span>
      </aside> : null}

      <section className={styles.layout}>
        <aside className={styles.fixtureRail} aria-label={dictionary.select}>
          <div className={styles.railHeading}>
            <span className={styles.englandFlag} aria-label={dictionary.england} role="img" />
            <span className={styles.railLeague} dir={textDirection}><strong>{dictionary.league}</strong>{seasonLabel ? <small>{seasonLabel}</small> : null}</span>
            <dl className={styles.fixtureCount}>
              <div><dt>{dictionary.currentFixtures}</dt><dd>{schedule.currentFixtures.length}</dd></div>
              <div><dt>{dictionary.recentResults}</dt><dd>{schedule.recentResults.length}</dd></div>
            </dl>
          </div>
          <div
            className={styles.fixtureScroller}
            tabIndex={0}
            aria-label={`${dictionary.currentFixtures}: ${schedule.currentFixtures.length}; ${dictionary.recentResults}: ${schedule.recentResults.length}`}
          >
            {fixtureSections.map((section) => {
              const railFixtures = section.fixtures;
              const isResultSection = section.id === "results";
              return railFixtures.length ? <section key={section.id} className={styles.fixtureGroup} data-section={section.id}>
              <h2><span dir={textDirection}>{section.label}</span><b>{railFixtures.length}</b></h2>
              <div className={styles.fixtureList}>{railFixtures.map((fixture) => {
                const isSelected = selected?.id === fixture.id;
                const fixtureScores = fixtureScorePair(fixture);
                const railStatus = fixtureRailStatus(fixture, language, readMetadata, now, draftLocalesEnabled);
                return <div key={fixture.id} className={styles.fixtureRow}><button type="button" aria-controls={selected ? "touchline-match-panel" : undefined} aria-pressed={isSelected} onClick={() => selectFixture(fixture)} className={isSelected ? styles.selectedFixture : styles.fixture}>
                  <span className={styles.fixtureStack}>
                    <span className={styles.fixtureCentre}>
                      <time
                        dateTime={fixture.startsAt}
                        aria-label={fixtureDate(fixture, language, initialTimeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }, draftLocalesEnabled)}
                      >
                        <span className={styles.fixtureDay}>{touchlineFixtureRailDateLabel(fixture, language, initialTimeZone, now, draftLocalesEnabled)}</span>
                        <span className={styles.fixtureKickoff}>{fixtureDate(fixture, language, initialTimeZone, { hour: "2-digit", minute: "2-digit", hour12: false }, draftLocalesEnabled)}</span>
                      </time>
                      {railStatus ? <small dir={textDirection} className={touchlineMatchCentreDisplayState(fixture, readMetadata, now) === "live" ? styles.liveStatus : ""}>{railStatus}</small> : null}
                    </span>
                    <span className={styles.fixtureTeams}>
                      <span className={styles.fixtureTeam}><TeamMark fixture={fixture} side="home" /><b>{fixture.homeTeam?.name ?? dictionary.homeFallback}</b></span>
                      <span className={styles.fixtureTeam}><TeamMark fixture={fixture} side="away" /><b>{fixture.awayTeam?.name ?? dictionary.awayFallback}</b></span>
                    </span>
                  </span>
                  {fixtureScores ? <span className={styles.fixtureScore} aria-label={`${fixtureScores.home} ${dictionary.versus} ${fixtureScores.away}`}>
                    <strong>{fixtureScores.home}</strong><i aria-hidden="true" /><strong>{fixtureScores.away}</strong>
                  </span> : null}
                  {isResultSection ? <span
                    className={styles.fixtureAlert}
                    role="img"
                    title={isResultSection ? dictionary.completed : dictionary.alertsSoon}
                    aria-label={isResultSection ? dictionary.completed : dictionary.alertsSoon}
                  ><Trophy size={13} aria-hidden="true" /></span> : null}
                </button>{!isResultSection ? <TouchlineFixtureAlerts fixtureId={fixture.id} label={fixtureLabel(fixture, language, draftLocalesEnabled)} locale={language} draftLocalesEnabled={draftLocalesEnabled} /> : null}</div>;
              })}</div>
              </section> : null;
            })}
            {!visibleFixtures.length ? <div className={styles.emptyRail}><CalendarDays size={22} /><strong>{dictionary.noFixtures}</strong></div> : null}
          </div>
        </aside>

        {selected ? <section id="touchline-match-panel" className={styles.matchPanel} aria-label={fixtureLabel(selected, language, draftLocalesEnabled)}>
          <div className={styles.matchMeta}><span><Trophy size={14} /> {dictionary.competition}</span><span>{selected.roundName ? `${dictionary.matchweek} · ${selected.roundName}` : dictionary.roundPending}</span><span><Clock3 size={14} /> {dictionary.timezone}</span></div>
          <div className={styles.hero} data-state={selectedDisplayState ?? "unknown"}>
            <HeroVenueArtwork venue={selected.venue} />
            <TouchlineClubPerimeterTrace accent={verifiedHomeAccent} className={styles.heroPerimeterTrace} />
            {selectedDisplayState === "live" ? <span className={styles.statusPill} role="status" aria-live="polite" aria-atomic="true">
              <span className={styles.liveStatusDot} aria-hidden="true" />
              {dictionary.liveNow}
            </span> : null}
            <div className={styles.heroTeams}>
              <div>
                <TeamMark fixture={selected} side="home" />
                <strong>{selected.homeTeam?.name ?? dictionary.homeFallback}</strong>
                {showHomeLineupCallout ? <aside className={styles.homeLineupCallout} data-state={homeLineupAvailable ? "available" : "pending"}>
                  {homeLineupAvailable && homeLineupHref
                    ? <a className={`${sharedControls.link} ${styles.homeLineupLink}`} href={homeLineupHref} onClick={openSelectedLineup}><UsersRound size={14} aria-hidden="true" /> {dictionary.viewLineup}</a>
                    : <><span>{dictionary.lineupPending}</span><small>{dictionary.lineupPendingCopy}</small></>}
                </aside> : null}
              </div>
              <b className={styles.score}>{score(selected, selectedDisplayState)}</b>
              <div><TeamMark fixture={selected} side="away" /><strong>{selected.awayTeam?.name ?? dictionary.awayFallback}</strong></div>
            </div>
            <time className={styles.heroKickoff} dateTime={selected.startsAt}>
              <span><CalendarDays size={14} aria-hidden="true" />{fixtureDate(selected, language, initialTimeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, draftLocalesEnabled)}</span>
              <strong><Clock3 size={15} aria-hidden="true" />{fixtureDate(selected, language, initialTimeZone, { hour: "2-digit", minute: "2-digit", hour12: false }, draftLocalesEnabled)}</strong>
            </time>
            {touchlineFixtureState(selected, now) === "upcoming" ? <Countdown startsAt={selected.startsAt} language={language} initialNow={now} draftLocalesEnabled={draftLocalesEnabled} /> : <strong className={styles.countdown}>{touchlineMatchCentreDisplayState(selected, readMetadata, now) === "stale" ? dictionary.liveDataUpdating : touchlineFixtureStatusLabel(selected.status, language, draftLocalesEnabled) || dictionary.provider}</strong>}
          </div>

          <div className={styles.infoGrid}>
            {selected.venue ? <article className={styles.venueCard}>
              <TouchlineClubPerimeterTrace accent={verifiedHomeAccent} className={styles.venuePerimeterTrace} />
              <VenueArtwork venue={selected.venue} />
              <div className={styles.venueCopy} dir={textDirection}>
                <span>{dictionary.venue}</span>
                <strong>{selected.venue.name}</strong>
                <small>{selected.venue.capacity ? `${dictionary.capacity} ${new Intl.NumberFormat(language).format(selected.venue.capacity)} · ` : ""}{dictionary.homeOf} {selected.venue.homeClubName}</small>
                {selected.venue.photoCredit ? <em>{dictionary.photo}: <a href={selected.venue.photoCredit.sourceUrl} target="_blank" rel="noreferrer">{selected.venue.photoCredit.label}</a> · <a href={selected.venue.photoCredit.licenseUrl} target="_blank" rel="noreferrer">{selected.venue.photoCredit.licenseLabel}</a></em> : null}
              </div>
            </article> : <article dir={textDirection}><span>{dictionary.venue}</span><strong>{dictionary.venuePending}</strong><small>{dictionary.official}</small></article>}
            <article dir={textDirection}><span>{dictionary.detail}</span><strong>{touchlineMatchCentreDisplayState(selected, readMetadata, now) === "stale" ? dictionary.lastVerified : touchlineFixtureState(selected, now) === "live" ? dictionary.liveNow : touchlineFixtureState(selected, now) === "finished" ? dictionary.completed : dictionary.watch}</strong><small>{dictionary.dataPending}</small></article>
            <article dir={textDirection}><span>{dictionary.archive}</span><strong>{fixtureLabel(selected, language, draftLocalesEnabled)}</strong><small>{selected.verifiedAt ? `${dictionary.provider} · ${fixtureDate({ startsAt: selected.verifiedAt }, language, initialTimeZone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, draftLocalesEnabled)}` : dictionary.provider}</small></article>
          </div>

          {verifiedDetail ? <section className={styles.verifiedMatchData} data-testid="touchline-verified-match-data">
            <header className={styles.verifiedHeading}>
              <div><ShieldCheck size={18} /><span>{dictionary.provider}</span><strong>{dictionary.eventCount(verifiedDetail.events.length)} · {dictionary.ratingCount(verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length)}</strong></div>
              {verifiedDetail.lineupAvailableAt ? <time dateTime={verifiedDetail.lineupAvailableAt}><UsersRound size={15} /> {dictionary.lineupAvailable} · {fixtureDate({ startsAt: verifiedDetail.lineupAvailableAt }, language, initialTimeZone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, draftLocalesEnabled)}</time> : null}
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
                <div className={styles.panelTitle}><Goal size={17} /><div><span>{dictionary.recent}</span><strong>{fixtureLabel(selected, language, draftLocalesEnabled)}</strong></div></div>
                <ol>{orderTouchlineMatchEvents(verifiedDetail.events).map((event) => {
                  const relatedPlayerName = event.relatedPlayerName;
                  return <li key={event.id}>
                    <time>{eventMoment(event)}</time>
                    <span><strong>{touchlineMatchEventLabel(event.type, language, draftLocalesEnabled)}</strong><b>{event.playerName ?? "—"}</b>{relatedPlayerName ? <small>{touchlineMatchEventRelatedPlayerLabel(event.type, language, draftLocalesEnabled)}: {relatedPlayerName}</small> : null}</span>
                    <em>{teamName(verifiedDetail, event.teamId)}</em>
                  </li>;
                })}</ol>
              </section>
              <section className={styles.pointsSummary}>
                <div className={styles.panelTitle}><Trophy size={17} /><div><span>{dictionary.players}</span><strong>{dictionary.ratingCount(verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length)}</strong></div></div>
                <ul>{orderTouchlineMatchRatings(verifiedDetail.playerStatistics).map((row) => <li key={row.playerId}><span><strong>{row.playerName}</strong><small>{teamName(verifiedDetail, row.teamId)}</small></span><b>{row.rating}</b></li>)}</ul>
              </section>
            </div>
            <section id="touchline-match-lineups" className={styles.lineupGrid} aria-label={dictionary.form} tabIndex={-1}>
              <MatchTeamSheet detail={verifiedDetail} teamId={verifiedDetail.fixture.homeTeam?.id} language={language} draftLocalesEnabled={draftLocalesEnabled} />
              <MatchTeamSheet detail={verifiedDetail} teamId={verifiedDetail.fixture.awayTeam?.id} language={language} draftLocalesEnabled={draftLocalesEnabled} />
            </section>
          </section> : <div className={styles.contentGrid}>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><ShieldCheck size={17} /><div><span>{dictionary.recent}</span><strong>{fixtureLabel(selected, language, draftLocalesEnabled)}</strong></div></div><p dir={textDirection}>{dictionary.dataPending}</p></section>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><Trophy size={17} /><div><span>{dictionary.form}</span><strong>{dictionary.players}</strong></div></div><p dir={textDirection}>{dictionary.dataPending}</p></section>
          </div>}
        </section> : <section className={styles.emptyPanel}><CalendarDays size={42} /><span>{dictionary.noFixtures}</span><p dir={textDirection}>{dictionary.noFixturesCopy}</p></section>}
      </section>
    </main>
  );
}
