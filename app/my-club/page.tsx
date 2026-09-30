import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Club | TouchLine England",
  description: "Manage your TouchLine squad by position.",
};

/** Compatibility entry: Market owns the authenticated customer experience. */
export default async function MyClubPage({ searchParams }: {
  searchParams: Promise<{ lang?: string; club?: string }>;
}) {
  const params = await searchParams;
  const forwarded = new URLSearchParams({ lang: normalizeTouchLineLocale(params.lang) });
  if (params.club) forwarded.set("club", params.club);
  redirect(`/market-transfer?${forwarded.toString()}`);
}
