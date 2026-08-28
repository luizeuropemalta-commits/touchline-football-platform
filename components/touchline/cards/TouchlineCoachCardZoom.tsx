"use client";

import type { TouchlineCoach } from "@/lib/football-data/types";
import type { TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import type {
  TouchlineCoachCompetitionSnapshot,
  TouchlineCoachContractSnapshot,
} from "@/lib/touchlineArena/coach-scoring";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";

import TouchlineCardZoom from "./TouchlineCardZoom";
import TouchlineCoachCard from "./TouchlineCoachCard";
import TouchlineCoachPerformance from "./TouchlineCoachPerformance";

type TouchlineCoachCardZoomProps = {
  coach: TouchlineCoach;
  slot: TouchlineArenaCoachSlot;
  clubName: string;
  clubLogoUrl?: string | null;
  clubAccent?: string;
  countryCode3?: string;
  locale?: string;
  contract: TouchlineCoachContractSnapshot | null;
  competition?: TouchlineCoachCompetitionSnapshot | null;
  profileHref: string;
  compact?: boolean;
  /**
   * A coach card in the matchday technical area is immediately visible above
   * the fold. Safari can defer the two identity assets on a lazy compact card,
   * which also holds back the atomic frame reveal. Allow that surface to opt
   * into eager assets without changing the regular feed/market behaviour.
   */
  assetLoading?: "eager" | "lazy";
};

export default function TouchlineCoachCardZoom({
  coach,
  slot,
  clubName,
  clubLogoUrl,
  clubAccent,
  countryCode3,
  locale = "en-GB",
  contract,
  competition = null,
  profileHref,
  compact = true,
  assetLoading,
}: TouchlineCoachCardZoomProps) {
  const portuguese = locale === "pt-BR";
  const palette = touchlineCardTierPalette(slot.cardTier);
  const card = (
    <TouchlineCoachCard
      coach={coach}
      slot={slot}
      clubName={clubName}
      clubLogoUrl={clubLogoUrl}
      clubAccent={clubAccent}
      countryCode3={countryCode3}
      locale={locale}
      displayMode={compact ? "compact" : "default"}
      optimizeForLiveCompact={compact}
      enableInteractiveNeon={false}
      assetLoading={assetLoading ?? "lazy"}
      fixtureContext={contract?.currentFixture?.context ?? null}
    />
  );

  return (
    <TouchlineCardZoom
      ariaLabel={portuguese ? `Ampliar card de ${coach.displayName}` : `Open ${coach.displayName} coach card`}
      tierAccent={palette.accent}
      expandedContent={
        <TouchlineCoachCard
          coach={coach}
          slot={slot}
          clubName={clubName}
          clubLogoUrl={clubLogoUrl}
          clubAccent={clubAccent}
          countryCode3={countryCode3}
          locale={locale}
          forceNeonActive
          enableInteractiveNeon={false}
          assetLoading="eager"
          frameLoading="eager"
          frameDecoding="sync"
          frameFetchPriority="high"
          fixtureContext={contract?.currentFixture?.context ?? null}
        />
      }
      detailsContent={
        <div>
          <TouchlineCoachPerformance contract={contract} competition={competition} locale={locale} />
          <a data-coach-profile-action="true" href={profileHref}>{portuguese ? "Ver perfil completo" : "View full profile"}</a>
        </div>
      }
    >
      {card}
    </TouchlineCardZoom>
  );
}
