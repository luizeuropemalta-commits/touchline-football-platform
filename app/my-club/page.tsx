import type { Metadata } from "next";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";

import { redirect } from "next/navigation";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Club | TouchLine England",
  description: "Manage your TouchLine squad by position.",
};

/** Compatibility entry: Market owns the authenticated customer experience. */
type MyClubPageProps = {
  searchParams: Promise<{ lang?: string; club?: string }>;
};

async function renderMyClubPage({ searchParams }: MyClubPageProps, draftLocalesEnabled = false) {
  const params = await searchParams;
  const forwarded = new URLSearchParams({ lang: normalizeTouchLineLocale(params.lang, draftLocalesEnabled) });
  if (params.club) forwarded.set("club", params.club);
  redirect(`/clubowner?${forwarded.toString()}`);
}

export default async function MyClubPage(props: MyClubPageProps) {
  return renderMyClubPage(props, isTouchLineSiteLocalesEnabled("/my-club"));
}
