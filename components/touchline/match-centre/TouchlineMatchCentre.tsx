"use client";

/* The provider owns crest URLs; this preserves the canonical source without a remote-image allowlist. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Clock3, Radio, ShieldCheck, Trophy } from "lucide-react";

import type { TouchlineFixture } from "@/lib/football-data/types";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  selectTouchlineMatchCentreFixture,
  touchlineFixtureState,
} from "@/lib/touchlineArena/match-centre";

import styles from "./touchline-match-centre.module.css";

type Props = {
  initialFixtures: TouchlineFixture[];
  initialFixtureId?: string | null;
  initialLocale?: TouchLineLocale | null;
};

type FixtureGroup = "live" | "today" | "upcoming" | "finished";

const copy = {
  "pt-BR": {
    title: "Match Centre", live: "AO VIVO", today: "HOJE", upcoming: "PRÓXIMOS", finished: "ARQUIVO", matchweek: "Rodada", competition: "TouchLine England", select: "Confrontos", noFixtures: "Agenda em atualização", noFixturesCopy: "A programação oficial será exibida assim que a competição publicar fixtures canônicos.", venue: "Estádio", venuePending: "Aguardando confirmação TouchLine do estádio", countdown: "Início em", detail: "Dados da partida", dataPending: "Eventos, escalações e estatísticas aparecem assim que forem verificados pela TouchLine.", recent: "Últimos confrontos", form: "Forma recente", players: "Jogadores em destaque", archive: "Arquivo TouchLine", provider: "TouchLine Verified", timezone: "Horário local", versus: "VS", completed: "ENCERRADO", liveNow: "AO VIVO", next: "PRÓXIMO", official: "TouchLine Data", watch: "Acompanhar partida",
  },
  "en-GB": {
    title: "Match Centre", live: "LIVE NOW", today: "TODAY", upcoming: "UPCOMING", finished: "ARCHIVE", matchweek: "Matchweek", competition: "TouchLine England", select: "Fixtures", noFixtures: "Schedule updating", noFixturesCopy: "Official fixtures will appear as soon as the competition publishes the canonical schedule.", venue: "Stadium", venuePending: "Awaiting TouchLine venue verification", countdown: "Kick-off in", detail: "Match data", dataPending: "Events, line-ups and statistics appear as soon as TouchLine verifies them.", recent: "Recent meetings", form: "Recent form", players: "Players to watch", archive: "TouchLine archive", provider: "TouchLine Verified", timezone: "Local time", versus: "VS", completed: "FULL TIME", liveNow: "LIVE", next: "NEXT", official: "TouchLine Data", watch: "Open match",
  },
} as const;

function fixtureLabel(fixture: TouchlineFixture) {
  return fixture.name || `${fixture.homeTeam?.name ?? "Home"} vs ${fixture.awayTeam?.name ?? "Away"}`;
}

function fixtureDate(fixture: TouchlineFixture, locale: string, options: Intl.DateTimeFormatOptions) {
  if (!fixture.startsAt || Number.isNaN(Date.parse(fixture.startsAt))) return "—";
  return new Intl.DateTimeFormat(locale, options).format(new Date(fixture.startsAt));
}

function score(fixture: TouchlineFixture) {
  if (typeof fixture.homeScore === "number" || typeof fixture.awayScore === "number") return `${fixture.homeScore ?? 0} — ${fixture.awayScore ?? 0}`;
  return "VS";
}

function status(fixture: TouchlineFixture, language: keyof typeof copy) {
  const state = touchlineFixtureState(fixture);
  if (state === "live") return copy[language].liveNow;
  if (state === "finished") return copy[language].completed;
  return fixtureDate(fixture, language, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function groupFixtures(fixtures: TouchlineFixture[], now: number): Record<FixtureGroup, TouchlineFixture[]> {
  const today = new Date(now).toDateString();
  return fixtures.reduce<Record<FixtureGroup, TouchlineFixture[]>>((groups, fixture) => {
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

function TeamMark({ fixture, side }: { fixture: TouchlineFixture; side: "home" | "away" }) {
  const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
  return <span className={styles.teamMark}>{team?.logoUrl ? <img src={team.logoUrl} alt="" /> : <span>{team?.name?.slice(0, 2).toUpperCase() ?? "TL"}</span>}</span>;
}

export default function TouchlineMatchCentre({ initialFixtures, initialFixtureId, initialLocale }: Props) {
  const language: keyof typeof copy = initialLocale === "pt-BR" ? "pt-BR" : "en-GB";
  const [fixtures, setFixtures] = useState(initialFixtures);
  const [selectedId, setSelectedId] = useState(initialFixtureId ?? null);
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
        const payload = await response.json() as { ok?: boolean; data?: TouchlineFixture[] };
        if (payload.ok && Array.isArray(payload.data)) setFixtures(payload.data);
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

  function selectFixture(fixture: TouchlineFixture) {
    setSelectedId(fixture.id);
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", fixture.id);
    window.history.replaceState({}, "", url);
    if (window.matchMedia("(max-width: 850px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("touchline-match-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <main className={styles.shell} data-testid="touchline-match-centre">
      <header className={styles.header}>
        <a href={`/arena?skipIntro=1&lang=${language}`} className={styles.brand}>TOUCHLINE <span>ENGLAND</span></a>
        <div><span>{dictionary.official}</span><strong>{dictionary.title}</strong></div>
        <a href={`/arena?skipIntro=1&lang=${language}`} className={styles.return}>Arena <ChevronRight size={15} /></a>
      </header>

      <section className={styles.layout}>
        <aside className={styles.fixtureRail} aria-label={dictionary.select}>
          <div className={styles.railHeading}><Radio size={16} /><strong>{dictionary.select}</strong><span>{fixtures.length}</span></div>
          <div className={styles.fixtureScroller}>
            {orderedGroups.map((group) => groups[group.id].length ? <section key={group.id} className={styles.fixtureGroup}>
              <h2>{group.label}</h2>
              {groups[group.id].map((fixture) => <button key={fixture.id} type="button" onClick={() => selectFixture(fixture)} className={selected?.id === fixture.id ? styles.selectedFixture : styles.fixture}>
                <span className={styles.fixtureTeams}><TeamMark fixture={fixture} side="home" /><b>{fixture.homeTeam?.name ?? "Home"}</b><TeamMark fixture={fixture} side="away" /><b>{fixture.awayTeam?.name ?? "Away"}</b></span>
                <small className={touchlineFixtureState(fixture) === "live" ? styles.liveStatus : ""}>{status(fixture, language)}</small>
              </button>)}
            </section> : null)}
            {!fixtures.length ? <div className={styles.emptyRail}><CalendarDays size={22} /><strong>{dictionary.noFixtures}</strong></div> : null}
          </div>
        </aside>

        {selected ? <section id="touchline-match-panel" className={styles.matchPanel} aria-label={fixtureLabel(selected)}>
          <div className={styles.matchMeta}><span><Trophy size={14} /> {dictionary.competition}</span><span>{dictionary.matchweek} · {selected.seasonId ?? "—"}</span><span><Clock3 size={14} /> {dictionary.timezone}</span></div>
          <div className={styles.hero} data-state={touchlineFixtureState(selected)}>
            <span className={styles.statusPill}>{touchlineFixtureState(selected) === "live" ? dictionary.liveNow : touchlineFixtureState(selected) === "finished" ? dictionary.completed : dictionary.next}</span>
            <div className={styles.heroTeams}>
              <div><TeamMark fixture={selected} side="home" /><strong>{selected.homeTeam?.name ?? "Home"}</strong></div>
              <b className={styles.score}>{score(selected)}</b>
              <div><TeamMark fixture={selected} side="away" /><strong>{selected.awayTeam?.name ?? "Away"}</strong></div>
            </div>
            <p>{fixtureDate(selected, language, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
            {touchlineFixtureState(selected) === "upcoming" ? <Countdown startsAt={selected.startsAt} language={language} /> : <strong className={styles.countdown}>{selected.status ?? dictionary.provider}</strong>}
          </div>

          <div className={styles.infoGrid}>
            <article><span>{dictionary.venue}</span><strong>{dictionary.venuePending}</strong><small>{dictionary.provider}</small></article>
            <article><span>{dictionary.detail}</span><strong>{touchlineFixtureState(selected) === "live" ? dictionary.liveNow : touchlineFixtureState(selected) === "finished" ? dictionary.completed : dictionary.watch}</strong><small>{dictionary.dataPending}</small></article>
            <article><span>{dictionary.archive}</span><strong>{fixtureLabel(selected)}</strong><small>{selected.source?.lastSyncedAt ? `${dictionary.provider} · ${fixtureDate({ ...selected, startsAt: selected.source.lastSyncedAt }, language, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : dictionary.provider}</small></article>
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
