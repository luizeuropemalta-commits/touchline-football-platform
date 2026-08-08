/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { CSSProperties } from "react";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineOfficialLeagueTable from "@/components/touchline/TouchlineOfficialLeagueTable";
import { loadTouchlineOfficialLeagueTable } from "@/lib/football-data/official-league-table-server";
import { TOUCHLINE_ENGLAND_CLUBS_BY_RANK } from "@/lib/touchlineArena/demo-data";
import { normalizeTouchLineLocale, type TouchLineLocale } from "@/lib/touchlineArena/i18n";

import styles from "./touchline-clubs.module.css";

export const dynamic = "force-dynamic";

type ClubsPageProps = {
  searchParams: Promise<{
    lang?: string;
  }>;
};

const copy = {
  "pt-BR": {
    eyebrow: "TouchLine England",
    title: "Escolha um clube",
    intro: "Entre no ClubHub oficial de cada equipe, veja informações reais do clube e acompanhe os cards TouchLine sem cair direto em uma página específica.",
    open: "Abrir ClubHub",
    clubs: "20 clubes",
    verified: "TouchLine Verified",
    hint: "Seleção premium de clubes",
  },
  "en-GB": {
    eyebrow: "TouchLine England",
    title: "Choose a club",
    intro: "Open each team’s official ClubHub, review real club information and follow TouchLine cards without landing inside one specific club by default.",
    open: "Open ClubHub",
    clubs: "20 clubs",
    verified: "TouchLine Verified",
    hint: "Premium club selection",
  },
} as const;

function languageQuery(locale: TouchLineLocale) {
  return `lang=${encodeURIComponent(locale)}`;
}

export default async function TouchlineClubsPage({ searchParams }: ClubsPageProps) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(params.lang);
  const dictionary = locale === "pt-BR" ? copy["pt-BR"] : copy["en-GB"];
  const localeQuery = languageQuery(locale);
  const officialLeagueTable = await loadTouchlineOfficialLeagueTable();

  return (
    <main className={styles.shell}>
      <TouchlineGlobalNavigation
        locale={locale}
        currentRoute="clubHub"
        surface="public"
        className={styles.globalNavigation}
      />

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{dictionary.eyebrow}</span>
          <h1>{dictionary.title}</h1>
          <p>{dictionary.intro}</p>
        </div>
      </section>

      <section className={styles.clubGrid} aria-label={dictionary.hint}>
        {TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => (
          <Link
            key={club.teamId}
            href={`/touchline-clubs/${club.slug}?${localeQuery}`}
            className={styles.clubCard}
            style={{
              "--club-accent": club.accent,
              "--club-secondary": club.secondaryAccent,
            } as CSSProperties}
          >
            <span className={styles.clubIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.logoWrap}>
              <img src={club.logoUrl} alt="" loading={index < 6 ? "eager" : "lazy"} />
            </span>
            <span className={styles.clubInfo}>
              <strong>{club.name}</strong>
              <small>{club.shortCode} · {dictionary.verified}</small>
            </span>
            <span className={styles.open}>{dictionary.open}</span>
          </Link>
        ))}
      </section>

      <TouchlineOfficialLeagueTable
        id="official-league-table"
        table={officialLeagueTable}
        locale={locale}
        variant="directory"
      />

      <footer className={styles.footer}>
        <span>{dictionary.clubs}</span>
        <span>{dictionary.hint}</span>
      </footer>
    </main>
  );
}
