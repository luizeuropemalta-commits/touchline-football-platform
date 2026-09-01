import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialRankingDraftView from "@/components/touchline/social/TouchlineSocialRankingDraft";
import { readTouchlineSocialRankingFamilyDraft } from "@/lib/touchlineArena/social-ranking-family-draft-server";
import {
  TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES,
  type TouchlineSocialRankingContentType,
} from "@/lib/touchlineArena/social-ranking-family-contract";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine Ranking Draft", robots: { index: false, follow: false } };

type Props = Readonly<{ searchParams: Promise<{
  contentType?: string;
  fixtureId?: string;
  scopeId?: string;
  playerId?: string;
}> }>;

export default async function TouchlineSocialRankingPage({ searchParams }: Props) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const contentType = TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES.includes(params.contentType as TouchlineSocialRankingContentType)
    ? params.contentType as TouchlineSocialRankingContentType : null;
  const result = contentType ? await readTouchlineSocialRankingFamilyDraft({
    contentType,
    fixtureId: params.fixtureId ?? "",
    scopeId: params.scopeId,
    playerId: params.playerId,
  }) : { ok: false as const, reason: "invalid-content-type" };
  if (!result.ok) {
    return <main style={{ width: 1080, height: 1350, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#06120e,#020807)", color: "white", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
      <div><p style={{ color: "#b6ff4f", fontSize: 20, fontWeight: 950, letterSpacing: ".14em" }}>TOUCHLINE VERIFIED</p><h1 style={{ margin: "18px 0", fontSize: 54 }}>AWAITING VERIFIED RANKING DATA</h1><p style={{ color: "rgba(255,255,255,.6)", fontSize: 18 }}>{result.reason}</p></div>
    </main>;
  }
  return <TouchlineSocialRankingDraftView draft={result.data} />;
}
