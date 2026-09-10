import {
  TOUCHLINE_CARD_TIER_KEYS,
  touchlineCardTierPalette,
  type TouchlineCardTierKey,
} from "./card-rules.ts";

/**
 * Versioned presentation contract for the seven approved player-card frames.
 *
 * This deliberately calibrates content only. Frame PNGs, shirt artwork and
 * the shared master layout remain outside this contract. The first revision
 * records the approved common geometry (all factors are 1); visual QA may
 * later amend a single tier token with measured evidence.
 */
export const TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATION_REVISION =
  "touchline-card-tier-component-calibration-v1" as const;

export type TouchlineCardCalibrationPresentation = "normal" | "compact" | "zoom";
export type TouchlineCardCalibratedComponent = "name" | "number" | "crest" | "points" | "actions" | "logo";

export type TouchlineCardTierComponentCalibration = Readonly<{
  tierKey: TouchlineCardTierKey;
  layoutRevision: "touchline-premier-shirt-back-card-layout-v6";
  palette: Readonly<{ accent: string; secondary: string }>;
  presentations: Readonly<Record<TouchlineCardCalibrationPresentation, Readonly<Record<TouchlineCardCalibratedComponent, number>>>>;
}>;

const COMPONENTS: readonly TouchlineCardCalibratedComponent[] = ["name", "number", "crest", "points", "actions", "logo"];
const PRESENTATIONS: readonly TouchlineCardCalibrationPresentation[] = ["normal", "compact", "zoom"];

function commonComponentScales() {
  return Object.fromEntries(COMPONENTS.map((component) => [component, 1])) as Record<TouchlineCardCalibratedComponent, number>;
}

function calibrationForTier(tierKey: TouchlineCardTierKey): TouchlineCardTierComponentCalibration {
  return {
    tierKey,
    layoutRevision: "touchline-premier-shirt-back-card-layout-v6",
    palette: touchlineCardTierPalette(tierKey),
    presentations: Object.fromEntries(
      PRESENTATIONS.map((presentation) => [presentation, commonComponentScales()]),
    ) as Record<TouchlineCardCalibrationPresentation, Record<TouchlineCardCalibratedComponent, number>>,
  };
}

export const TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS: Readonly<Record<TouchlineCardTierKey, TouchlineCardTierComponentCalibration>> =
  Object.fromEntries(TOUCHLINE_CARD_TIER_KEYS.map((tierKey) => [tierKey, calibrationForTier(tierKey)])) as Record<
    TouchlineCardTierKey,
    TouchlineCardTierComponentCalibration
  >;

export function resolveTouchlineCardTierComponentCalibration(
  tierKey: TouchlineCardTierKey | null | undefined,
): TouchlineCardTierComponentCalibration | null {
  return tierKey ? TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS[tierKey] : null;
}

export function touchlineCardTierComponentScale(
  calibration: TouchlineCardTierComponentCalibration | null,
  presentation: TouchlineCardCalibrationPresentation,
  component: TouchlineCardCalibratedComponent,
) {
  return calibration?.presentations[presentation][component] ?? 1;
}
