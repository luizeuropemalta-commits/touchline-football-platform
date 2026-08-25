import { redirect } from "next/navigation";

import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export default async function FantasyAliasPage({ searchParams }: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang);
  redirect(`/market-transfer?lang=${encodeURIComponent(locale)}`);
}
