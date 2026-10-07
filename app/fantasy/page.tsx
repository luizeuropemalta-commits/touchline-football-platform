import { redirect } from "next/navigation";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";

import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

type FantasyAliasPageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

async function renderFantasyAliasPage({ searchParams }: FantasyAliasPageProps, draftLocalesEnabled = false) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang, draftLocalesEnabled);
  redirect(`/clubowner?lang=${encodeURIComponent(locale)}`);
}

export default async function FantasyAliasPage(props: FantasyAliasPageProps) {
  return renderFantasyAliasPage(props, isTouchLineSiteLocalesEnabled("/fantasy"));
}
