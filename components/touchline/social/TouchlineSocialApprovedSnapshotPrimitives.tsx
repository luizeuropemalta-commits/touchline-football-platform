/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from "react";

import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "./TouchlineSocialApprovedExactCard";

export type TouchlineApprovedClub = Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  accent: string;
  secondaryAccent?: string;
  logoUrl: string;
}>;

export type TouchlineApprovedCardSource = Readonly<{
  id?: string;
  canonicalPlayerId?: string | null;
  sportmonksPlayerId?: string;
  name: string;
  shortName?: string;
  role?: string;
  position?: string;
  shirtNumber?: string | number | null;
  countryCode3?: string;
  clubName?: string;
  clubLogoUrl?: string | null;
  cardTemplateUrl?: string | null;
  marketValue?: string | null;
  totalRating?: string | number | null;
  seasonTotalRating?: string | number | null;
  seasonStats?: Readonly<Record<string, string | number | null | undefined>>;
  matchStats?: Readonly<Record<string, string | number | null | undefined>>;
}>;

export function approvedSnapshotCard(source: TouchlineApprovedCardSource, club?: TouchlineApprovedClub): TouchlineEliteExactPlayer {
  return {
    sportmonksPlayerId: source.sportmonksPlayerId ?? source.id ?? `snapshot:${source.name}`,
    canonicalPlayerId: source.canonicalPlayerId ?? null,
    overall: source.shirtNumber ?? "",
    shirtNumber: source.shirtNumber ?? null,
    role: source.role ?? "player",
    position: source.position ?? "",
    countryCode3: source.countryCode3 ?? "",
    name: source.name,
    clubName: source.clubName ?? club?.name ?? "",
    clubLogoUrl: source.clubLogoUrl ?? club?.logoUrl ?? null,
    cardTemplateUrl: source.cardTemplateUrl ?? null,
    marketValue: source.marketValue ?? null,
    totalRating: source.totalRating ?? source.seasonTotalRating ?? null,
    seasonStats: source.seasonStats,
    matchStats: source.matchStats,
  };
}

export function TouchlineSocialApprovedScoreboard({
  home,
  away,
  eyebrow,
  footer,
  score,
}: Readonly<{
  home: TouchlineApprovedClub;
  away: TouchlineApprovedClub;
  eyebrow: string;
  footer: string;
  score?: Readonly<{ home: number; away: number }>;
}>) {
  return <section aria-label={`${home.name} versus ${away.name}`} data-touchline-approved-scoreboard="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center", gap: 14, padding: "22px 28px", border: "1px solid #9eff2d66", borderRadius: 18, background: "#04110de6", color: "#f8fff0", textAlign: "center" }}>
    <ApprovedClub club={home} />
    <div><small style={{ display: "block", color: "#b9c4bf", fontWeight: 800 }}>{eyebrow}</small><strong style={{ display: "block", padding: "6px 0", color: "#9eff2d", fontSize: 44 }}>{score ? `${score.home}–${score.away}` : "VS"}</strong><small>{footer}</small></div>
    <ApprovedClub club={away} />
  </section>;
}

function ApprovedClub({ club }: Readonly<{ club: TouchlineApprovedClub }>) {
  return <div><img src={club.logoUrl} alt="" aria-hidden="true" width={76} height={76} style={{ width: 76, height: 76, objectFit: "contain", filter: `drop-shadow(0 0 10px ${club.accent})` }} /><strong style={{ display: "block" }}>{club.name}</strong></div>;
}

export function TouchlineSocialApprovedDuel({
  sides,
}: Readonly<{ sides: readonly [Readonly<{ club: TouchlineApprovedClub; card: TouchlineApprovedCardSource; totalRating: number }>, Readonly<{ club: TouchlineApprovedClub; card: TouchlineApprovedCardSource; totalRating: number }>] }>) {
  return <section aria-label="Leading TouchLine cards" data-touchline-approved-duel="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
    {sides.map((side) => <article key={side.club.teamId} style={{ display: "grid", justifyItems: "center", padding: 18, border: `1px solid ${side.club.accent}88`, borderRadius: 20, background: "#020805cc" }}>
      <div style={{ width: 430, height: 691, transform: "scale(.58)", transformOrigin: "top center", marginBottom: -285 }}><TouchlineEliteExactCard player={approvedSnapshotCard(side.card, side.club)} staticRenderScale={1} /></div>
      <strong>{side.card.name}</strong><span style={{ color: "#9eff2d", fontWeight: 900 }}>{side.totalRating.toFixed(2)} TOTAL RATING</span>
    </article>)}
  </section>;
}

export const APPROVED_SOCIAL_SNAPSHOT_VARS = Object.freeze({
  "--tl-social-glass": "rgba(1, 12, 8, .87)",
  "--tl-social-lime": "#9eff2d",
}) as Readonly<CSSProperties>;

export function TouchlineSocialApprovedShell({ children, style, art }: Readonly<{ children: ReactNode; style?: CSSProperties; art: string }>) {
  return <main data-social-approved-snapshot={art} style={{ minHeight: 1350, padding: 38, background: "radial-gradient(circle at 50% 0, #164a23, #020805 62%)", color: "#f8fff0", fontFamily: "Arial, sans-serif", ...style }}>{children}</main>;
}
