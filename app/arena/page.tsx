import { redirect } from "next/navigation";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

// Temporary compatibility for existing bookmarks; no retired game is loaded.
export default async function RetiredArenaPage({ searchParams }: {
  searchParams: Promise<{ lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] }>;
}) {
  const input = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const query = new URLSearchParams({ lang: normalizeTouchLineLocale(first(input.lang)) });
  if (first(input.intro) === "first") query.set("intro", "first");
  if (first(input.skipIntro) === "1") query.set("skipIntro", "1");
  redirect(`/intro?${query.toString()}`);
}
