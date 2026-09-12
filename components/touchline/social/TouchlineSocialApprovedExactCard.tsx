/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

/**
 * Immutable social-card snapshot.
 *
 * It has no imports from the live card engine: ranking, pricing, shirt-number
 * palette, statistics, crown, persistence and client interaction cannot alter
 * an approved social composition after review. Social readers project the
 * presentation fields before this renderer receives them.
 */
export type TouchlineEliteExactPlayer = Readonly<{
  sportmonksPlayerId: string;
  canonicalPlayerId?: string | null;
  formationPlayerId?: string;
  overall: string | number;
  shirtNumber?: string | number | null;
  role: string;
  position: string;
  countryCode3: string;
  name: string;
  clubName: string;
  clubLogoUrl?: string | null;
  cardTemplateUrl?: string | null;
  avatarImageUrl?: string | null;
  sourcePhotoUrl?: string | null;
  frameUrl?: string | null;
  marketValue: string | null;
  totalRating?: string | number | null;
  matchRating?: string | number | null;
  cardTier?: string | null;
  seasonStats?: Readonly<Record<string, string | number | null | undefined>>;
  matchStats?: Readonly<Record<string, string | number | null | undefined>>;
}>;

export type TouchlineEliteExactCardPlayer = TouchlineEliteExactPlayer;
export type TouchlineEliteExactCardLabels = Readonly<{
  nationality: string;
  totalRating: string;
  marketValue: string;
}>;

type Props = Readonly<{
  player: TouchlineEliteExactPlayer;
  className?: string;
  staticRenderScale?: number;
  initialRenderScale?: number;
  ensureStaticNameFit?: boolean;
  runtimeLocaleOverride?: string | null;
  subscribeToRanking?: boolean;
  enableInteractiveNeon?: boolean;
  showCardActions?: boolean;
  showProfileAction?: boolean;
  showSocialMetrics?: boolean;
  rankingMode?: "live" | "preview";
  forceNeonActive?: boolean;
  imageLoading?: "eager" | "lazy";
}>;

const CARD_WIDTH = 430;
const CARD_HEIGHT = 691;
const FALLBACK_FRAME = "/touchlineArena/cards/templates/clubs/Manchester%20City/market-tiers/diamond-gold.png";
const safeText = (value: unknown, fallback = "—") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};
const stat = (player: TouchlineEliteExactPlayer, key: string) => safeText(
  player.seasonStats?.[key] ?? player.matchStats?.[key],
);

export function TouchlineEliteExactCard({ player, className, staticRenderScale = 1, imageLoading = "eager" }: Props) {
  const scale = Number.isFinite(staticRenderScale) ? Math.max(0.1, Math.min(1, staticRenderScale)) : 1;
  const style = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  } as CSSProperties;
  const template = player.cardTemplateUrl || player.frameUrl || FALLBACK_FRAME;
  const number = safeText(player.shirtNumber ?? player.overall, "");
  return (
    <article className={className} style={{ ...style, position: "relative", overflow: "hidden", isolation: "isolate" }} data-touchline-social-approved-card="true" data-interactive="false">
      <img src={template} alt="" aria-hidden="true" draggable={false} loading={imageLoading} style={{ position: "absolute", inset: 0, zIndex: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      {(player.avatarImageUrl || player.sourcePhotoUrl) ? <img src={player.avatarImageUrl || player.sourcePhotoUrl || ""} alt="" aria-hidden="true" draggable={false} loading={imageLoading} style={{ position: "absolute", inset: "15% 10% 18%", zIndex: 1, width: "80%", height: "67%", objectFit: "contain" }} /> : null}
      <div style={{ position: "absolute", zIndex: 2, top: 77, left: 45, right: 45, textAlign: "center", color: "white", fontWeight: 1000, fontSize: 25, lineHeight: 1.05, textShadow: "0 2px 6px #000" }}>{player.name.toUpperCase()}</div>
      <div style={{ position: "absolute", zIndex: 2, top: 151, left: 0, right: 0, textAlign: "center", color: "white", fontWeight: 1000, fontSize: 100, lineHeight: 1, textShadow: "0 3px 9px #000" }}>{number}</div>
      {player.clubLogoUrl ? <img src={player.clubLogoUrl} alt="" aria-hidden="true" draggable={false} loading={imageLoading} style={{ position: "absolute", zIndex: 2, top: 70, right: 48, width: 54, height: 54, objectFit: "contain" }} /> : null}
      <div style={{ position: "absolute", zIndex: 2, left: 47, right: 47, top: 400, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, color: "white", textAlign: "center", fontFamily: "Arial, sans-serif" }}>
        <div style={{ padding: "9px 4px", borderRadius: 10, background: "#010706cf", border: "1px solid #ffffff22" }}><small style={{ display: "block", color: "#b9c4bf", fontWeight: 800, fontSize: 10 }}>TOTAL RATING</small><strong style={{ fontSize: 24 }}>{safeText(player.totalRating)}</strong></div>
        <div style={{ padding: "9px 4px", borderRadius: 10, background: "#010706cf", border: "1px solid #ffffff22" }}><small style={{ display: "block", color: "#b9c4bf", fontWeight: 800, fontSize: 10 }}>MARKET VALUE</small><strong style={{ fontSize: 20 }}>{safeText(player.marketValue)}</strong></div>
      </div>
      <div style={{ position: "absolute", zIndex: 2, left: 45, right: 45, bottom: 48, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, color: "#fff", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
        {[["GOALS", "goals"], ["ASSISTS", "assists"], ["DEF", "defense"], ["CARDS", "yellowcards"]].map(([label, key]) => <span key={key} style={{ borderTop: "1px solid #ffffff44", paddingTop: 5 }}><small style={{ display: "block", color: "#b9c4bf", fontSize: 8 }}>{label}</small>{stat(player, key)}</span>)}
      </div>
    </article>
  );
}

export default TouchlineEliteExactCard;
