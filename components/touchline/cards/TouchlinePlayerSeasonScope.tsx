"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { useTouchlineCardLeadershipAuthority } from "./TouchlineCardLeadershipProvider";
import TouchlineEliteExactCard from "./TouchlineEliteExactCard";
import TouchlineCardZoom from "./TouchlineCardZoom";
import { resolveTouchlineSeasonPlayer, type TouchlineSeasonPlayerFacts } from "@/lib/touchlineArena/player-season-presentation";

const SeasonContext = createContext<TouchlineSeasonPlayerFacts | null | undefined>(undefined);

/** One public player projection for the card, open zoom and profile's live fields. */
export function TouchlinePlayerSeasonScope({ playerId, providerPlayerId, seasonId, enabled = false, children }: {
  playerId?: string | null; providerPlayerId?: string | number | null; seasonId?: string | null;
  enabled?: boolean; children: ReactNode;
}) {
  const authority = useTouchlineCardLeadershipAuthority();
  const facts = resolveTouchlineSeasonPlayer({ authority, enabled, playerId, providerPlayerId, seasonId });
  return <SeasonContext.Provider value={facts}>{children}</SeasonContext.Provider>;
}

export const useTouchlineSeasonPlayerFacts = () => useContext(SeasonContext);

/** The live text and its unavailable styling must change in the same render. */
export function TouchlineSeasonStat({ label, seed, expectedSeasonId, unavailable, availableClassName, unavailableClassName }: {
  label: string; seed: number | string | null; expectedSeasonId: string | null; unavailable: string;
  availableClassName: string; unavailableClassName: string;
}) {
  const facts = useTouchlineSeasonPlayerFacts();
  const value = facts === undefined ? seed : expectedSeasonId === facts?.seasonId ? facts.totalRating : null;
  return <div className={value === null ? unavailableClassName : availableClassName}>
    <small>{label}</small><strong>{value === null ? unavailable : String(value)}</strong>
  </div>;
}

export function TouchlineSeasonExactCard(props: ComponentProps<typeof TouchlineEliteExactCard>) {
  const facts = useTouchlineSeasonPlayerFacts();
  const player = facts === undefined ? props.player : { ...props.player, totalRating: facts?.totalRating ?? null };
  return <TouchlineEliteExactCard {...props} player={player} />;
}

export function TouchlineSeasonCardZoom({ unavailable = "—", ...props }: ComponentProps<typeof TouchlineCardZoom> & { unavailable?: string }) {
  const facts = useTouchlineSeasonPlayerFacts();
  const details = facts === undefined || !props.details ? props.details : { ...props.details,
    fields: props.details.fields.map(field => field.kind === "rating-total"
      ? { ...field, value: facts?.totalRating == null ? unavailable : String(facts.totalRating) } : field) };
  return <TouchlineCardZoom {...props} details={details} />;
}

export function TouchlineSeasonValue({ field = "totalRating", children, unavailable = "—", groupLabels, expectedSeasonId }: {
  field?: "totalRating" | "positionRank" | "positionGroup"; children: ReactNode; unavailable?: string;
  expectedSeasonId?: string | null;
  groupLabels?: Readonly<Record<string, string>>;
}) {
  const facts = useTouchlineSeasonPlayerFacts();
  if (facts === undefined) return <>{children}</>;
  if (expectedSeasonId !== undefined && expectedSeasonId !== facts?.seasonId) return <>{unavailable}</>;
  const value = facts?.[field];
  return <>{value == null ? unavailable : field === "positionRank" ? `#${value}`
    : field === "positionGroup" ? groupLabels?.[String(value)] ?? unavailable : String(value)}</>;
}
