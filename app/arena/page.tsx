import { redirect } from "next/navigation";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

// Temporary compatibility for existing bookmarks; no retired game is loaded.
type RetiredArenaPageProps = {
  searchParams: Promise<{ lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] }>;
};

async function renderRetiredArenaPage({ searchParams }: RetiredArenaPageProps, draftLocalesEnabled = false) {
  const input = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const query = new URLSearchParams({ lang: normalizeTouchLineLocale(first(input.lang), draftLocalesEnabled) });
  if (first(input.intro) === "first") query.set("intro", "first");
  if (first(input.skipIntro) === "1") query.set("skipIntro", "1");
  redirect(`/intro?${query.toString()}`);
}

export default async function RetiredArenaPage(props: RetiredArenaPageProps) {
  return renderRetiredArenaPage(props, isTouchLineSiteLocalesEnabled("/arena"));
}
