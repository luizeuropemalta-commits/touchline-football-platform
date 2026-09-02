"use client";

import type { TouchlineCoach } from "@/lib/football-data/types";
import type { TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import type {
  TouchlineCoachCompetitionSnapshot,
  TouchlineCoachContractSnapshot,
} from "@/lib/touchlineArena/coach-scoring";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";

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

function formatVerifiedDateOfBirth(value: string | undefined, locale: string) {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
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
  contract,
  competition = null,
  profileHref,
  compact = true,
  assetLoading,
}: TouchlineCoachCardZoomProps) {
  const portuguese = locale === "pt-BR";
  const palette = touchlineCardTierPalette(slot.cardTier);
  const verifiedRecord = competition ?? contract;
  const formattedDateOfBirth = formatVerifiedDateOfBirth(coach.dateOfBirth, locale);
  const identityFields: TouchlineCardZoomDetails["fields"] = [
    { label: portuguese ? "Clube atual" : "Current club", value: clubName, icon: "club", group: "identity" },
    ...(coach.nationality
      ? [{ label: portuguese ? "Nacionalidade" : "Nationality", value: coach.nationality, icon: "nationality", group: "identity" as const }]
      : []),
    { label: portuguese ? "Função" : "Role", value: portuguese ? "Treinador principal" : "First-team coach", icon: "position", group: "identity" },
    ...(formattedDateOfBirth
      ? [{ label: portuguese ? "Data de nascimento" : "Date of birth", value: formattedDateOfBirth, icon: "history", group: "identity" as const }]
      : []),
    { label: portuguese ? "Nível do card" : "Card tier", value: touchlineCardTierName(slot.cardTier, locale), icon: "tier", group: "identity", accent: true },
  ];
  const performanceFields: TouchlineCardZoomDetails["fields"] = verifiedRecord
    ? [
        ...(competition
          ? [{ label: portuguese ? "Posição na competição" : "Competition rank", value: `#${competition.rank}`, icon: "rank", group: "performance" as const }]
          : []),
        { label: "TouchLine Points", value: String(verifiedRecord.totalTouchlinePoints), icon: "rating", group: "performance", primary: true },
        {
          label: portuguese ? "Casa · V-E-D" : "Home · W-D-L",
          value: `${verifiedRecord.home.wins}-${verifiedRecord.home.draws}-${verifiedRecord.home.losses}`,
          icon: "home",
          group: "performance",
        },
        { label: portuguese ? "Pontos em casa" : "Home points", value: String(verifiedRecord.home.touchlinePoints), icon: "home", group: "performance" },
        {
          label: portuguese ? "Fora · V-E-D" : "Away · W-D-L",
          value: `${verifiedRecord.away.wins}-${verifiedRecord.away.draws}-${verifiedRecord.away.losses}`,
          icon: "away",
          group: "performance",
        },
        { label: portuguese ? "Pontos fora" : "Away points", value: String(verifiedRecord.away.touchlinePoints), icon: "away", group: "performance" },
      ]
    : [
        {
          label: portuguese ? "Estado TouchLine" : "TouchLine status",
          value: portuguese ? "Identidade verificada" : "Verified identity",
          icon: "verified",
          group: "performance",
        },
        {
          label: portuguese ? "Evidência de partidas" : "Match evidence",
          value: portuguese ? "Aguardando dados verificados" : "Awaiting verified data",
          icon: "history",
          group: "performance",
        },
      ];
  const details: TouchlineCardZoomDetails = {
    eyebrow: portuguese ? "Treinador TouchLine" : "TouchLine coach",
    title: coach.displayName,
    subtitle: `${clubName} · ${portuguese ? "Treinador principal" : "First-team coach"}`,
    performanceTitle: portuguese ? "Registo TouchLine" : "TouchLine record",
    performanceSubtitle: competition?.seasonLabel
      ?? (portuguese ? "Apenas evidência verificada" : "Verified evidence only"),
    fields: [...identityFields, ...performanceFields],
    profileHref,
    profileLabel: portuguese ? "Ver perfil completo" : "View full profile",
    profileActionKind: "coach",
  };
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
      details={details}
    >
      {card}
    </TouchlineCardZoom>
  );
}
