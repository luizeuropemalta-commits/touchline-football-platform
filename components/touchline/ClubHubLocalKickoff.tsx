"use client";

import { useSyncExternalStore } from "react";
import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";

const subscribe = () => () => undefined;
function browserZone() {
  try { return normalizeTouchlineMatchCentreTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }
  catch { return "UTC"; }
}

/** SSR explicitly labels UTC; hydration uses the device, never the language. */
export default function ClubHubLocalKickoff({ startsAt, locale, draftLocalesEnabled = false, fallback }: {
  startsAt?: string | null; locale: string; draftLocalesEnabled?: boolean; fallback: string;
}) {
  const timeZone = useSyncExternalStore(subscribe, browserZone, () => "UTC");
  const kickoff = startsAt ? formatTouchlineLocalKickoff(startsAt, timeZone, locale, draftLocalesEnabled) : null;
  return <time dateTime={kickoff ? startsAt! : undefined}>{kickoff ? `${kickoff.date} · ${kickoff.time} · ${kickoff.zoneName}` : fallback}</time>;
}
