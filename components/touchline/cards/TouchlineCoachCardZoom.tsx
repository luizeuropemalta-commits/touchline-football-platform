"use client";

import type { TouchlineCoach } from "@/lib/football-data/types";
import type { TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import type {
  TouchlineCoachCompetitionSnapshot,
  TouchlineCoachContractSnapshot,
} from "@/lib/touchlineArena/coach-scoring";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { localizedCountryLabel } from "@/lib/touchlineArena/country-labels";
import { resolveTouchlineCoachZoomPresentation } from "@/lib/touchlineArena/coach-zoom-i18n";

import TouchlineCardZoom, { type TouchlineCardZoomDetails } from "./TouchlineCardZoom";
import TouchlineCoachCard from "./TouchlineCoachCard";

type TouchlineCoachCardZoomProps = {
  coach: TouchlineCoach;
  slot: TouchlineArenaCoachSlot;
  clubName: string;
  clubLogoUrl?: string | null;
  clubAccent?: string;
  countryCode3?: string;
  locale?: string;
  draftLocalesEnabled?: boolean;
  contract: TouchlineCoachContractSnapshot | null;
  competition?: TouchlineCoachCompetitionSnapshot | null;
  profileHref: string;
  compact?: boolean;
  cardClassName?: string;
  publishedTouchlinePoints?: number | null;
  showLeadershipCrown?: boolean;
  /**
   * A coach card in the matchday technical area is immediately visible above
   * the fold. Safari can defer the two identity assets on a lazy compact card,
   * which also holds back the atomic frame reveal. Allow that surface to opt
   * into eager assets without changing the regular feed/market behaviour.
   */
  assetLoading?: "eager" | "lazy";
  frameLoading?: "eager" | "lazy";
  frameDecoding?: "sync" | "async" | "auto";
  frameFetchPriority?: "high" | "low" | "auto";
};

function formatVerifiedDateOfBirth(value: string | undefined, locale: string) {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(parsed);
}

export default function TouchlineCoachCardZoom({
  coach,
  slot,
  clubName,
  clubLogoUrl,
  clubAccent,
  countryCode3,
  locale = "en-GB",
  draftLocalesEnabled = false,
  contract,
  competition = null,
  profileHref,
  compact = true,
  cardClassName,
  publishedTouchlinePoints = null,
  showLeadershipCrown,
  assetLoading,
  frameLoading,
  frameDecoding,
  frameFetchPriority,
}: TouchlineCoachCardZoomProps) {
  const { locale: presentationLocale, copy } = resolveTouchlineCoachZoomPresentation(locale, draftLocalesEnabled);
  const portuguese = presentationLocale === "pt-BR";
  const palette = touchlineCardTierPalette(slot.cardTier);
  const verifiedRecord = competition ?? contract;
  const formattedDateOfBirth = formatVerifiedDateOfBirth(coach.dateOfBirth, presentationLocale);
  const identityFields: TouchlineCardZoomDetails["fields"] = [
    { label: copy.currentClub, value: clubName, icon: "coach-club", group: "identity" },
    ...(coach.nationality
      ? [{ label: copy.nationality, value: localizedCountryLabel(coach.nationality, presentationLocale, draftLocalesEnabled) ?? coach.nationality, icon: "coach-nationality", group: "identity" as const }]
      : []),
    { label: copy.role, value: copy.firstTeamCoach, icon: "coach-role", group: "identity" },
    ...(formattedDateOfBirth
      ? [{ label: copy.dateOfBirth, value: formattedDateOfBirth, icon: "coach-birth", group: "identity" as const }]
      : []),
    { label: copy.cardTier, value: touchlineCardTierName(slot.cardTier, presentationLocale, draftLocalesEnabled), icon: "coach-tier", group: "identity", accent: true },
  ];
  const performanceFields: TouchlineCardZoomDetails["fields"] = verifiedRecord
    ? [
        ...(competition
          ? [{ label: copy.competitionRank, value: `#${competition.rank}`, icon: portuguese ? "coach-rank-position" : "coach-rank", group: "performance" as const, kind: "stat" as const }]
          : []),
        { label: "TouchLine Points", value: String(verifiedRecord.totalTouchlinePoints), icon: "rating", group: "performance", primary: true, kind: "rating-total" },
        {
          label: copy.homeRecord,
          value: `${verifiedRecord.home.wins}-${verifiedRecord.home.draws}-${verifiedRecord.home.losses}`,
          icon: "coach-home",
          group: "performance",
          kind: "stat",
        },
        { label: copy.homePoints, value: String(verifiedRecord.home.touchlinePoints), icon: "coach-home", group: "performance", kind: "stat" },
        {
          label: copy.awayRecord,
          value: `${verifiedRecord.away.wins}-${verifiedRecord.away.draws}-${verifiedRecord.away.losses}`,
          icon: "coach-away",
          group: "performance",
          kind: "stat",
        },
        { label: copy.awayPoints, value: String(verifiedRecord.away.touchlinePoints), icon: "coach-away", group: "performance", kind: "stat" },
      ]
    : [
        {
          label: copy.status,
          value: copy.verifiedIdentity,
          icon: "coach-verified",
          group: "performance",
          kind: "stat",
        },
        {
          label: copy.matchEvidence,
          value: copy.awaitingVerifiedData,
          icon: "coach-evidence",
          group: "performance",
          kind: "stat",
        },
      ];
  const details: TouchlineCardZoomDetails = {
    eyebrow: copy.coachEyebrow,
    title: coach.displayName,
    subtitle: `${clubName} · ${copy.firstTeamCoach}`,
    performanceTitle: copy.record,
    performanceSubtitle: competition?.seasonLabel
      || copy.verifiedOnly,
    fields: [...identityFields, ...performanceFields],
    profileHref,
    profileLabel: copy.profile,
    profileActionKind: "coach",
  };
  const card = (
    <TouchlineCoachCard
      className={cardClassName}
      coach={coach}
      slot={slot}
      clubName={clubName}
      clubLogoUrl={clubLogoUrl}
      clubAccent={clubAccent}
      countryCode3={countryCode3}
      locale={locale}
      draftLocalesEnabled={draftLocalesEnabled}
      displayMode={compact ? "compact" : "default"}
      optimizeForLiveCompact={compact}
      enableInteractiveNeon={false}
      assetLoading={assetLoading ?? "lazy"}
      frameLoading={frameLoading}
      frameDecoding={frameDecoding}
      frameFetchPriority={frameFetchPriority}
      fixtureContext={contract?.currentFixture?.context ?? null}
      publishedTouchlinePoints={publishedTouchlinePoints}
      showLeadershipCrown={showLeadershipCrown}
    />
  );

  return (
    <TouchlineCardZoom
      locale={locale}
      draftLocalesEnabled={draftLocalesEnabled}
      ariaLabel={copy.openCard.replace("{coachName}", () => coach.displayName)}
      tierAccent={palette.accent}
      expandedContent={
        <TouchlineCoachCard
          className={cardClassName}
          coach={coach}
          slot={slot}
          clubName={clubName}
          clubLogoUrl={clubLogoUrl}
          clubAccent={clubAccent}
          countryCode3={countryCode3}
          locale={locale}
          draftLocalesEnabled={draftLocalesEnabled}
          forceNeonActive
          enableInteractiveNeon={false}
          assetLoading="eager"
          frameLoading={frameLoading ?? "eager"}
          frameDecoding={frameDecoding ?? "sync"}
          frameFetchPriority={frameFetchPriority ?? "high"}
          fixtureContext={contract?.currentFixture?.context ?? null}
          publishedTouchlinePoints={publishedTouchlinePoints}
          showLeadershipCrown={showLeadershipCrown}
        />
      }
      details={details}
    >
      {card}
    </TouchlineCardZoom>
  );
}
