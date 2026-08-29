import Link from "next/link";
import type { CSSProperties } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineCoachCategoryShowcase from "@/components/touchline/TouchlineCoachCategoryShowcase";
import ClubHubCrestTrace from "@/components/touchline/ClubHubCrestTrace";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import ClubHubCardLink from "@/components/touchline/ClubHubCardLink";
import { loadTouchlinePublishedCardShowcaseCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
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
    language: "Idioma",
    openingClub: "Abrindo ClubHub",
  },
  "en-GB": {
    eyebrow: "TouchLine England",
    title: "Choose a club",
    intro: "Open each team’s official ClubHub, review real club information and follow TouchLine cards without landing inside one specific club by default.",
    open: "Open ClubHub",
    clubs: "20 clubs",
    verified: "TouchLine Verified",
    hint: "Premium club selection",
    language: "Language",
    openingClub: "Opening ClubHub",
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
  const publishedPlayerCards = await loadTouchlinePublishedCardShowcaseCatalog();

  return (
    <main className={styles.shell}>
      <div className={styles.topbar}>
        <TouchlineGlobalNavigation
          locale={locale}
          currentRoute="clubHub"
          surface="public"
          className={styles.globalNavigation}
        />
        <details className={styles.languageMenu}>
          <summary aria-label={dictionary.language}>
            <Languages aria-hidden="true" />
            <span>{dictionary.language}</span>
            <b>{locale === "pt-BR" ? "PT" : "EN"}</b>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className={styles.languagePanel}>
            <Link href="/touchline-clubs?lang=en-GB" aria-current={locale === "en-GB" ? "page" : undefined}>
              <span>🇬🇧 English</span>{locale === "en-GB" ? <Check aria-hidden="true" /> : null}
            </Link>
            <Link href="/touchline-clubs?lang=pt-BR" aria-current={locale === "pt-BR" ? "page" : undefined}>
              <span>🇧🇷 Português</span>{locale === "pt-BR" ? <Check aria-hidden="true" /> : null}
            </Link>
          </div>
        </details>
      </div>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{dictionary.eyebrow}</span>
          <h1>{dictionary.title}</h1>
          <p>{dictionary.intro}</p>
        </div>
      </section>

      <section className={styles.clubGrid} aria-label={dictionary.hint}>
        {TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => (
          <ClubHubCardLink
            key={club.teamId}
            href={`/touchline-clubs/${club.slug}?${localeQuery}`}
            className={styles.clubCard}
            pendingLabel={`${dictionary.openingClub}: ${club.name}`}
            style={{
              "--club-accent": club.accent,
              "--club-secondary": club.secondaryAccent,
            } as CSSProperties}
          >
            <TouchlineClubPerimeterTrace accent={club.accent} className={styles.clubCardTrace} />
            <span className={styles.clubIndex}>{String(index + 1).padStart(2, "0")}</span>
            {club.logoUrl ? (
              <ClubHubCrestTrace
                accent={club.accent}
                className={styles.logoWrap}
                loading={index < 6 ? "eager" : "lazy"}
                src={club.logoUrl}
              />
            ) : <span className={styles.logoWrap} aria-hidden="true">{club.shortCode}</span>}
            <span className={styles.clubInfo}>
              <strong>{club.name}</strong>
              <small>{club.shortCode} · {dictionary.verified}</small>
            </span>
            <span className={styles.open}>{dictionary.open}</span>
          </ClubHubCardLink>
        ))}
      </section>

      <TouchlineCoachCategoryShowcase locale={locale} playerCards={publishedPlayerCards} />

      <footer className={styles.footer}>
        <span>{dictionary.clubs}</span>
        <span>{dictionary.hint}</span>
      </footer>
    </main>
  );
}
