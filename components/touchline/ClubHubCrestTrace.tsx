/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

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
 * asset supplied by the caller. Decorative circular wrappers are deliberately
 * excluded so every club keeps the natural silhouette of its official crest.
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
      data-club-hub-crest-host="true"
      data-touchline-card-crest-host="true"
      role={ariaLabel ? "img" : undefined}
      style={{ "--touchline-club-crest-color": accent } as CSSProperties}
    >
      <img alt={alt} draggable={false} loading={loading} src={src} />
    </span>
  );
}
