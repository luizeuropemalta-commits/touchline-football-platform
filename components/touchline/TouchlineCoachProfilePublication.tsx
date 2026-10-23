"use client";

import { createContext, useContext, type ReactNode } from "react";
import { House, PlaneTakeoff } from "lucide-react";
import { useTouchlineCardLeadershipAuthority } from "./cards/TouchlineCardLeadershipProvider";
import TouchlineCoachPerformance from "./cards/TouchlineCoachPerformance";
import { coachCompetitionFromRanking } from "@/lib/touchlineArena/coach-competition-projection";
import type { TouchlineCoachCompetitionSnapshot } from "@/lib/touchlineArena/coach-scoring";
import { getTouchlineCoachProfileCopy } from "@/lib/touchlineArena/coach-profile-i18n";
import { getTouchlineTablesPresentationCopy } from "@/lib/touchlineArena/tables-presentation-i18n";

const ProfileContext = createContext<TouchlineCoachCompetitionSnapshot | null>(null);

export function TouchlineCoachProfilePublication({ coachProviderId, seed, seasonLabel, children }: {
  coachProviderId: string; seed: TouchlineCoachCompetitionSnapshot | null; seasonLabel: string; children: ReactNode;
}) {
  const authority = useTouchlineCardLeadershipAuthority();
  const ranking = authority?.coachRanking;
  const competition = ranking === undefined ? seed : ranking
    ? coachCompetitionFromRanking(ranking, coachProviderId, seasonLabel) : null;
  return <ProfileContext.Provider value={competition}>{children}</ProfileContext.Provider>;
}

export function TouchlineCoachProfileValue({ field, fallback = "—" }: { field: "rank" | "matches" | "season"; fallback?: string }) {
  const competition = useContext(ProfileContext);
  if (!competition) return <>{fallback}</>;
  return <>{field === "rank" ? `#${competition.rank}` : field === "season" ? competition.seasonLabel
    : competition.home.wins + competition.home.draws + competition.home.losses
      + competition.away.wins + competition.away.draws + competition.away.losses}</>;
}

export function TouchlineCoachProfilePerformance({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const competition = useContext(ProfileContext);
  return <TouchlineCoachPerformance contract={null} competition={competition} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />;
}

export function TouchlineCoachProfileCampaign({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const competition = useContext(ProfileContext);
  const copy = getTouchlineCoachProfileCopy(locale, draftLocalesEnabled);
  const recordCopy = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled);
  if (!competition) return null;
  return <section className="coach-profile-campaign" aria-label={copy.seasonCampaign}>
    <header><span>{copy.seasonForm}</span><strong>{copy.homeAndAway}</strong></header>
    <div>{(["home", "away"] as const).map(key => {
      const record = competition[key]; const Icon = key === "home" ? House : PlaneTakeoff;
      return <article key={key}><Icon aria-hidden="true" />
        <span><small>{key === "home" ? copy.homeCampaign : copy.awayCampaign}</small><strong>{record.wins}{draftLocalesEnabled ? recordCopy.winsShort : "W"} · {record.draws}{draftLocalesEnabled ? recordCopy.drawsShort : "D"} · {record.losses}{draftLocalesEnabled ? recordCopy.lossesShort : "L"}</strong></span>
      </article>;
    })}</div>
  </section>;
}
