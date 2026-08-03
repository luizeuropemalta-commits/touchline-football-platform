import { notFound, redirect } from "next/navigation";

import { ARENA_ONLINE_ZONES, arenaOnlineZoneForSlug } from "@/lib/touchlineArena/arena-online-hub";

type ArenaZonePageProps = {
  params: Promise<{ zone: string }>;
  searchParams: Promise<{ intro?: string | string[]; skipIntro?: string | string[]; lang?: string | string[] }>;
};

export function generateStaticParams() {
  return ARENA_ONLINE_ZONES.map((zone) => ({ zone: zone.key }));
}

export async function generateMetadata({ params }: ArenaZonePageProps) {
  const { zone } = await params;
  const arenaZone = arenaOnlineZoneForSlug(zone);

  return {
    title: arenaZone ? `${arenaZone.title} | Touchline Arena` : "Touchline Arena",
  };
}

export default async function ArenaZonePage({ params, searchParams }: ArenaZonePageProps) {
  const { zone } = await params;
  const query = await searchParams;
  const arenaZone = arenaOnlineZoneForSlug(zone);
  const firstValue = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

  if (!arenaZone) notFound();
  const lang = firstValue(query.lang);
  const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  redirect(`${arenaZone.href}${suffix}`);
}
