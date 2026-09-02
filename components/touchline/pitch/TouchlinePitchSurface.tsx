import type { ReactNode } from "react";

import styles from "./TouchlinePitchSurface.module.css";

export type TouchlinePitchAdvertisingCampaign = Readonly<{
  campaignId: string;
  messages: readonly string[];
}>;

type TouchlinePitchSurfaceProps = Readonly<{
  advertisingCampaign?: TouchlinePitchAdvertisingCampaign;
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
  surfaceVariant?: "canonical" | "premium-stadium";
}>;

export const TOUCHLINE_MARKET_HOUSE_CAMPAIGN: TouchlinePitchAdvertisingCampaign = {
  campaignId: "touchline-house-market-v1",
  messages: [
    "THIS IS NOT FANTASY. THIS IS REALITY.",
    "FOLLOW THE GAME. FOLLOW TOUCHLINE.",
    "FOLLOW US ON INSTAGRAM",
    "FOLLOW US ON FACEBOOK",
    "ADVERTISE WITH TOUCHLINE",
  ],
};

/**
 * The one canonical TouchLine regulation football field. Its markings follow
 * the 105 × 68 m reference geometry in either orientation. Consumers own their
 * cards and interactions, never a second field design or a second set of
 * markings. This keeps Arena, Match Centre, squad-management views and
 * ClubHub on the same broadcast-quality football surface.
 */
export default function TouchlinePitchSurface({
  advertisingCampaign,
  ariaLabel,
  children,
  className,
  orientation = "horizontal",
  surfaceVariant = "canonical",
}: TouchlinePitchSurfaceProps) {
  const advertisingMessages = advertisingCampaign?.messages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 8) ?? [];

  return (
    <div
      className={[
        styles.surface,
        orientation === "vertical" ? styles.surfaceVertical : null,
        surfaceVariant === "premium-stadium" ? styles.surfacePremiumStadium : null,
        className,
      ].filter(Boolean).join(" ")}
      data-touchline-advertising-campaign-id={advertisingCampaign?.campaignId}
      data-touchline-pitch-orientation={orientation}
      data-touchline-pitch-surface={surfaceVariant}
      role="group"
      aria-label={ariaLabel}
    >
      <span className={styles.boundary} aria-hidden="true" />
      <span className={styles.halfway} aria-hidden="true" />
      <span className={styles.centreCircle} aria-hidden="true" />
      <span className={styles.centreSpot} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxStart}`} aria-hidden="true" />
      <span className={`${styles.box} ${styles.boxEnd}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxStart}`} aria-hidden="true" />
      <span className={`${styles.sixYardBox} ${styles.sixYardBoxEnd}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalStart}`} aria-hidden="true" />
      <span className={`${styles.goal} ${styles.goalEnd}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotStart}`} aria-hidden="true" />
      <span className={`${styles.spot} ${styles.spotEnd}`} aria-hidden="true" />
      <span className={`${styles.penaltyArc} ${styles.penaltyArcStart}`} aria-hidden="true" />
      <span className={`${styles.penaltyArc} ${styles.penaltyArcEnd}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerStartTop}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerStartBottom}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerEndTop}`} aria-hidden="true" />
      <span className={`${styles.cornerArc} ${styles.cornerEndBottom}`} aria-hidden="true" />
      {surfaceVariant === "premium-stadium" && advertisingMessages.length ? (
        <div className={styles.ledPerimeter} aria-hidden="true">
          <div className={styles.ledGoalBoard}>
            <span className={styles.ledGoalScreen}>
              <span className={styles.ledTrack}>
                {[...advertisingMessages, ...advertisingMessages].map((message, index) => (
                  <b key={`${message}-${index}`}>{message}</b>
                ))}
              </span>
            </span>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
