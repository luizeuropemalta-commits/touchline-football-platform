/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

import { TouchlineClubCrestPerimeterTrace } from "@/components/touchline/cards/TouchlineClubCrestPerimeterTrace";

type Props = Readonly<{
  accent: string;
  alt?: string;
  ariaLabel?: string;
  className: string;
  loading?: "eager" | "lazy";
  src: string;
}>;

/**
 * Presentational ClubHub crest only. The logo remains the canonical local
 * asset supplied by the caller; the decorative trace carries no club data and
 * cannot manufacture a crest for an unresolved opponent.
 */
export default function ClubHubCrestTrace({
  accent,
  alt = "",
  ariaLabel,
  className,
  loading,
  src,
}: Props) {
  return (
    <span
      aria-label={ariaLabel}
      className={className}
      data-club-hub-crest-trace-host="true"
      data-touchline-card-crest-trace-host="true"
      role={ariaLabel ? "img" : undefined}
      style={{ "--touchline-club-crest-color": accent } as CSSProperties}
    >
      <img alt={alt} draggable={false} loading={loading} src={src} />
      <TouchlineClubCrestPerimeterTrace />
    </span>
  );
}
