import Link from "next/link";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { PlayerDatabaseSearch } from "@/components/player-database-search";
import { touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineFootballSearchCopy } from "@/lib/touchlineArena/football-search-i18n";

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
    <div dir={locale === "ar-SA" ? "rtl" : "ltr"} className="mx-auto max-w-[1760px] animate-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href={touchLineAuthHref("/clubowner", locale, draftLocalesEnabled)} className="inline-flex items-center gap-2 text-[8px] font-black text-slate-600 hover:text-cyan-300">
          <ArrowLeft size={12} className={locale === "ar-SA" ? "rotate-180" : undefined} />
          {copy.back}
        </Link>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black text-cyan-100">
          <DatabaseZap size={12} />
          {copy.title}
        </div>
      </div>
      <PlayerDatabaseSearch locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
    </div>
  );
}
