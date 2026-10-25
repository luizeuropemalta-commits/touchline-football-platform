import Link from "next/link";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { PlayerDatabaseSearch } from "@/components/player-database-search";
import TouchlineNavigationRail from "@/components/touchline/TouchlineNavigationRail";
import navigationStyles from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import { touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineFootballSearchCopy } from "@/lib/touchlineArena/football-search-i18n";
import styles from "./FootballSearchContent.module.css";

type FootballSearchPageProps = {
  searchParams: Promise<{ lang?: string }>;
};

export default async function FootballSearchPage(props: FootballSearchPageProps) {
  return renderFootballSearchPage(props, isTouchLineSiteLocalesEnabled("/football-search"));
}

async function renderFootballSearchPage({ searchParams }: FootballSearchPageProps, draftLocalesEnabled = false) {
  const { lang } = await searchParams;
  const locale = resolveTouchlineCatalogueLocale(lang, draftLocalesEnabled);
  const copy = getTouchlineFootballSearchCopy(locale, draftLocalesEnabled);

  return (
    <div dir={locale === "ar-SA" ? "rtl" : "ltr"} className="mx-auto min-w-0 w-full max-w-[1760px] animate-in space-y-6">
      <TouchlineNavigationRail className={styles.headerRail}>
        <div className={styles.headerRow}>
          <Link href={touchLineAuthHref("/clubowner", locale, draftLocalesEnabled)} className={`${navigationStyles.link} ${styles.headerItem}`}>
            <ArrowLeft aria-hidden="true" size={14} className={locale === "ar-SA" ? "rotate-180" : undefined} />
            {copy.back}
          </Link>
          <div className={`${styles.headerItem} inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-xs font-black text-cyan-100`}>
            <DatabaseZap aria-hidden="true" size={14} />
            {copy.title}
          </div>
        </div>
      </TouchlineNavigationRail>
      <PlayerDatabaseSearch locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
    </div>
  );
}
