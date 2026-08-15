"use client";

/* The provider owns crest URLs; this preserves the canonical source without a remote-image allowlist. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Radio, ShieldCheck, Trophy } from "lucide-react";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  isTouchlineLiveReadMetadata,
  selectTouchlineMatchCentreFixture,
  touchlineMatchCentreDisplayState,
  touchlineFixtureState,
  type TouchlineLiveReadMetadata,
} from "@/lib/touchlineArena/match-centre";

import styles from "./touchline-match-centre.module.css";

type Props = {
  initialFixtures: TouchlinePublicFixture[];
  initialFixtureId?: string | null;
  initialLocale?: TouchLineLocale | null;
  initialReadMetadata?: TouchlineLiveReadMetadata | null;
};

type FixtureGroup = "live" | "today" | "upcoming" | "finished";

const copy = {
  "pt-BR": {
    title: "Match Centre", live: "AO VIVO", today: "HOJE", upcoming: "PRÓXIMOS", finished: "ARQUIVO", matchweek: "Rodada", competition: "TouchLine England", select: "Confrontos", selectedFixture: "Partida selecionada", noFixtures: "Agenda em atualização", noFixturesCopy: "A programação oficial será exibida assim que a competição publicar fixtures canônicos.", venue: "Estádio", venuePending: "Aguardando confirmação TouchLine do estádio", countdown: "Início em", detail: "Dados da partida", dataPending: "Eventos, escalações e estatísticas aparecem assim que forem verificados pela TouchLine.", recent: "Últimos confrontos", form: "Forma recente", players: "Jogadores em destaque", archive: "Arquivo TouchLine", provider: "TouchLine Verified", timezone: "Horário local", versus: "VS", completed: "ENCERRADO", liveNow: "AO VIVO", next: "PRÓXIMO", official: "TouchLine Data", watch: "Acompanhar partida", liveDataUpdating: "Dados ao vivo em atualização", liveDataUpdatingCopy: "Exibindo o último snapshot verificado; o placar pode estar atrasado.", partialScheduleCopy: "A programação persistida está disponível, mas placares ao vivo aguardam um snapshot verificado.", lastVerified: "ÚLTIMO VERIFICADO", lastVerifiedAt: "Última verificação",
  },
  "en-GB": {
    title: "Match Centre", live: "LIVE NOW", today: "TODAY", upcoming: "UPCOMING", finished: "ARCHIVE", matchweek: "Matchweek", competition: "TouchLine England", select: "Fixtures", selectedFixture: "Selected fixture", noFixtures: "Schedule updating", noFixturesCopy: "Official fixtures will appear as soon as the competition publishes the canonical schedule.", venue: "Stadium", venuePending: "Awaiting TouchLine venue verification", countdown: "Kick-off in", detail: "Match data", dataPending: "Events, line-ups and statistics appear as soon as TouchLine verifies them.", recent: "Recent meetings", form: "Recent form", players: "Players to watch", archive: "TouchLine archive", provider: "TouchLine Verified", timezone: "Local time", versus: "VS", completed: "FULL TIME", liveNow: "LIVE", next: "NEXT", official: "TouchLine Data", watch: "Open match", liveDataUpdating: "Live data updating", liveDataUpdatingCopy: "Showing the last verified snapshot; the score may be delayed.", partialScheduleCopy: "The persisted schedule is available, but live scores are awaiting a verified snapshot.", lastVerified: "LAST VERIFIED", lastVerifiedAt: "Last verification",
  },
} as const;

function fixtureLabel(fixture: TouchlinePublicFixture) {
  return fixture.name || `${fixture.homeTeam?.name ?? "Home"} vs ${fixture.awayTeam?.name ?? "Away"}`;
}

function fixtureDate(fixture: Pick<TouchlinePublicFixture, "startsAt">, locale: string, options: Intl.DateTimeFormatOptions) {
  if (!fixture.startsAt || Number.isNaN(Date.parse(fixture.startsAt))) return "—";
  return new Intl.DateTimeFormat(locale, options).format(new Date(fixture.startsAt));
}

function score(fixture: TouchlinePublicFixture) {
  if (Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore)) return `${fixture.homeScore} — ${fixture.awayScore}`;
  return "VS";
}

function status(fixture: TouchlinePublicFixture, language: keyof typeof copy, metadata?: TouchlineLiveReadMetadata | null) {
  const state = touchlineMatchCentreDisplayState(fixture, metadata);
  if (state === "stale") return copy[language].lastVerified;
  if (state === "live") return copy[language].liveNow;
  if (state === "finished") return copy[language].completed;
  return fixtureDate(fixture, language, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function groupFixtures(fixtures: TouchlinePublicFixture[], now: number): Record<FixtureGroup, TouchlinePublicFixture[]> {
  const today = new Date(now).toDateString();
  return fixtures.reduce<Record<FixtureGroup, TouchlinePublicFixture[]>>((groups, fixture) => {
    const state = touchlineFixtureState(fixture);
    if (state === "live") groups.live.push(fixture);
    else if (state === "finished") groups.finished.push(fixture);
    else if (fixture.startsAt && new Date(fixture.startsAt).toDateString() === today) groups.today.push(fixture);
    else if (state === "upcoming") groups.upcoming.push(fixture);
    return groups;
  }, { live: [], today: [], upcoming: [], finished: [] });
}

function Countdown({ startsAt, language }: { startsAt?: string; language: keyof typeof copy }) {
  const [now, setNow] = useState(() => Date.now());
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
  return <span className={styles.teamMark}>{team?.logoUrl ? <img src={team.logoUrl} alt="" /> : <span>{team?.name?.slice(0, 2).toUpperCase() ?? "TL"}</span>}</span>;
}

function verificationLabel(metadata: TouchlineLiveReadMetadata, language: keyof typeof copy) {
  if (!metadata.fetchedAt || Number.isNaN(Date.parse(metadata.fetchedAt))) return null;
  return `${copy[language].lastVerifiedAt} · ${new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(metadata.fetchedAt))}`;
}

export default function TouchlineMatchCentre({ initialFixtures, initialFixtureId, initialLocale, initialReadMetadata = null }: Props) {
  const language: keyof typeof copy = initialLocale === "pt-BR" ? "pt-BR" : "en-GB";
  const [fixtures, setFixtures] = useState(initialFixtures);
  const [selectedId, setSelectedId] = useState(initialFixtureId ?? null);
  const [readMetadata, setReadMetadata] = useState<TouchlineLiveReadMetadata | null>(initialReadMetadata);
  const [now, setNow] = useState(() => Date.now());
  const dictionary = copy[language];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
        if (payload.ok && Array.isArray(payload.data) && metadata) {
          setFixtures(payload.data);
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

  const selected = useMemo(() => selectTouchlineMatchCentreFixture(fixtures, selectedId), [fixtures, selectedId]);
  const groups = useMemo(() => groupFixtures(fixtures, now), [fixtures, now]);
  const orderedGroups: Array<{ id: FixtureGroup; label: string }> = [
    { id: "live", label: dictionary.live }, { id: "today", label: dictionary.today }, { id: "upcoming", label: dictionary.upcoming }, { id: "finished", label: dictionary.finished },
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
        <span className={styles.brand}>TOUCHLINE <span>ENGLAND</span></span>
        <div><span>{dictionary.official}</span><h1 className={styles.title}>{dictionary.title}</h1></div>
      </header>
      <TouchlineGlobalNavigation locale={language} currentRoute="live" surface="public" />
      <p className={styles.selectionAnnouncement} role="status" aria-live="polite" aria-atomic="true">
        {selected ? `${dictionary.selectedFixture}: ${fixtureLabel(selected)} · ${status(selected, language, readMetadata)}` : dictionary.noFixtures}
      </p>

      {readMetadata?.degraded ? <aside className={styles.freshnessNotice} role="status" aria-live="polite" aria-atomic="true" data-state={readMetadata.state}>
        <Clock3 size={17} aria-hidden="true" />
        <span>
          <strong>{dictionary.liveDataUpdating}</strong>
          <small>{readMetadata.state === "partial-persisted-schedule" ? dictionary.partialScheduleCopy : dictionary.liveDataUpdatingCopy}</small>
          {verificationLabel(readMetadata, language) ? <em>{verificationLabel(readMetadata, language)}</em> : null}
        </span>
      </aside> : null}

      <section className={styles.layout}>
        <aside className={styles.fixtureRail} aria-label={dictionary.select}>
          <div className={styles.railHeading}><Radio size={16} /><strong>{dictionary.select}</strong><span>{fixtures.length}</span></div>
          <div className={styles.fixtureScroller}>
            {orderedGroups.map((group) => groups[group.id].length ? <section key={group.id} className={styles.fixtureGroup}>
              <h2>{group.id === "live" && readMetadata?.degraded ? dictionary.lastVerified : group.label}</h2>
              {groups[group.id].map((fixture) => {
                const isSelected = selected?.id === fixture.id;
                return <button key={fixture.id} type="button" aria-controls={selected ? "touchline-match-panel" : undefined} aria-pressed={isSelected} onClick={() => selectFixture(fixture)} className={isSelected ? styles.selectedFixture : styles.fixture}>
                  <span className={styles.fixtureTeams}><TeamMark fixture={fixture} side="home" /><b>{fixture.homeTeam?.name ?? "Home"}</b><TeamMark fixture={fixture} side="away" /><b>{fixture.awayTeam?.name ?? "Away"}</b></span>
                  <small className={touchlineMatchCentreDisplayState(fixture, readMetadata) === "live" ? styles.liveStatus : ""}>{status(fixture, language, readMetadata)}</small>
                </button>;
              })}
            </section> : null)}
            {!fixtures.length ? <div className={styles.emptyRail}><CalendarDays size={22} /><strong>{dictionary.noFixtures}</strong></div> : null}
          </div>
        </aside>

        {selected ? <section id="touchline-match-panel" className={styles.matchPanel} aria-label={fixtureLabel(selected)}>
          <div className={styles.matchMeta}><span><Trophy size={14} /> {dictionary.competition}</span><span>{dictionary.matchweek} · {selected.seasonId ?? "—"}</span><span><Clock3 size={14} /> {dictionary.timezone}</span></div>
          <div className={styles.hero} data-state={touchlineMatchCentreDisplayState(selected, readMetadata)}>
            <span className={styles.statusPill}>{status(selected, language, readMetadata)}</span>
            <div className={styles.heroTeams}>
              <div><TeamMark fixture={selected} side="home" /><strong>{selected.homeTeam?.name ?? "Home"}</strong></div>
              <b className={styles.score}>{score(selected)}</b>
              <div><TeamMark fixture={selected} side="away" /><strong>{selected.awayTeam?.name ?? "Away"}</strong></div>
            </div>
            <p>{fixtureDate(selected, language, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
            {touchlineFixtureState(selected) === "upcoming" ? <Countdown startsAt={selected.startsAt} language={language} /> : <strong className={styles.countdown}>{touchlineMatchCentreDisplayState(selected, readMetadata) === "stale" ? dictionary.liveDataUpdating : selected.status ?? dictionary.provider}</strong>}
          </div>

          <div className={styles.infoGrid}>
            <article><span>{dictionary.venue}</span><strong>{dictionary.venuePending}</strong><small>{dictionary.official}</small></article>
            <article><span>{dictionary.detail}</span><strong>{touchlineMatchCentreDisplayState(selected, readMetadata) === "stale" ? dictionary.lastVerified : touchlineFixtureState(selected) === "live" ? dictionary.liveNow : touchlineFixtureState(selected) === "finished" ? dictionary.completed : dictionary.watch}</strong><small>{dictionary.dataPending}</small></article>
            <article><span>{dictionary.archive}</span><strong>{fixtureLabel(selected)}</strong><small>{selected.verifiedAt ? `${dictionary.provider} · ${fixtureDate({ startsAt: selected.verifiedAt }, language, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : dictionary.provider}</small></article>
          </div>

          <div className={styles.contentGrid}>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><ShieldCheck size={17} /><div><span>{dictionary.recent}</span><strong>{fixtureLabel(selected)}</strong></div></div><p>{dictionary.dataPending}</p></section>
            <section className={styles.featurePanel}><div className={styles.panelTitle}><Trophy size={17} /><div><span>{dictionary.form}</span><strong>{dictionary.players}</strong></div></div><p>{dictionary.dataPending}</p></section>
          </div>
        </section> : <section className={styles.emptyPanel}><CalendarDays size={42} /><span>{dictionary.noFixtures}</span><p>{dictionary.noFixturesCopy}</p></section>}
      </section>
    </main>
  );
}
