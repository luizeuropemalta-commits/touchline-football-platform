import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { readTouchlineCoachContracts } from "@/lib/touchlineArena/coach-contracts-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForTeam,
} from "@/lib/touchlineArena/live-coaches";

import styles from "./ClubHubCanonicalCoachPanel.module.css";

type ClubHubCanonicalCoachPanelProps = {
  teamId: string;
  clubName: string;
  clubLogoUrl?: string | null;
  clubAccent?: string;
  locale: string;
  userId: string | null;
  presentation?: "showcase" | "technical";
};

export default async function ClubHubCanonicalCoachPanel({
  teamId,
  clubName,
  clubLogoUrl,
  clubAccent,
  locale,
  userId,
  presentation = "showcase",
}: ClubHubCanonicalCoachPanelProps) {
  const portuguese = locale === "pt-BR";
  const canonicalCoach = touchlineLiveCoachForTeam(teamId);
  if (!canonicalCoach) return null;

  const classification = touchlineCoachClassificationForProviderId(canonicalCoach.coach.providerId);
  if (!classification) return null;

  const admin = userId ? createAdminClient() : null;
  const [coachRanking, contracts] = await Promise.all([
    loadTouchLineCoachRanking(),
    userId && admin
      ? readTouchlineCoachContracts(admin, userId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const coachContract = contracts.find((candidate) => (
    candidate.coachProviderId === canonicalCoach.coach.providerId && candidate.status === "active"
  )) ?? contracts.find((candidate) => candidate.coachProviderId === canonicalCoach.coach.providerId) ?? null;
  const coachRankingRow = coachRanking.phase === "ranked"
    ? coachRanking.rows.find((candidate) => candidate.coachProviderId === canonicalCoach.coach.providerId) ?? null
    : null;
  const competition = coachRankingRow && coachRanking.snapshotId && coachRanking.seasonId && coachRanking.scoringVersion
    ? {
      snapshotId: coachRanking.snapshotId,
      seasonId: coachRanking.seasonId,
      seasonLabel: "2026-27",
      rank: coachRankingRow.rank,
      scoringVersion: coachRanking.scoringVersion,
      home: coachRankingRow.home,
      away: coachRankingRow.away,
      totalTouchlinePoints: coachRankingRow.touchlinePoints,
    }
    : null;
  const baseSlot = createTouchlineArenaCoachSlot(canonicalCoach.coach, null, classification.tierKey);
  const slot = competition ? {
    ...baseSlot,
    touchlinePoints: competition.totalTouchlinePoints,
    status: "audited" as const,
    scoreEvidence: {
      provider: "sportmonks" as const,
      providerEventIds: [...coachRanking.fixtureIds],
      scoringVersion: competition.scoringVersion,
    },
  } : coachContract ? {
    ...baseSlot,
    touchlinePoints: coachContract.totalTouchlinePoints,
    status: "audited" as const,
    scoreEvidence: {
      provider: "sportmonks" as const,
      providerEventIds: coachContract.fixtureHistory.map((fixture) => fixture.fixtureId),
      scoringVersion: coachContract.scoringVersion,
    },
  } : baseSlot;
  const profileHref = `/touchline-coaches/${encodeURIComponent(canonicalCoach.coach.providerId)}?lang=${encodeURIComponent(locale)}`;

  const card = (
    <TouchlineCoachCardZoom
      coach={canonicalCoach.coach}
      slot={slot}
      clubName={clubName}
      clubLogoUrl={clubLogoUrl}
      clubAccent={clubAccent}
      countryCode3={canonicalCoach.countryCode3}
      locale={locale}
      contract={coachContract}
      competition={competition}
      profileHref={profileHref}
      assetLoading={presentation === "technical" ? "eager" : "lazy"}
    />
  );

  if (presentation === "technical") {
    return <div className={styles.technicalCard}>{card}</div>;
  }

  return (
    <section className={styles.shell} aria-label={`${clubName} ${portuguese ? "treinador principal" : "first-team coach"}`}>
      <div className={styles.copy}>
        <span>{portuguese ? "EQUIPE TÉCNICA" : "TECHNICAL STAFF"}</span>
        <h2>{portuguese ? "Treinador principal" : "First-team coach"}</h2>
        <strong>{canonicalCoach.coach.displayName}</strong>
        <p>{portuguese
          ? "Abra o card para ver Casa, Fora, W-D-L e todos os TouchLine Points antes de visitar o perfil completo."
          : "Open the card to review Home, Away, W-D-L and all TouchLine Points before visiting the full profile."}</p>
      </div>
      <div className={styles.card}>{card}</div>
    </section>
  );
}
