import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialFinalScoreDraftView from "@/components/touchline/social/TouchlineSocialFinalScoreDraft";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine Full Time Draft", robots: { index: false, follow: false } };

export default async function TouchlineSocialFullTimePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ fixtureId?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const result = await readTouchlineSocialFinalScoreDraft(params.fixtureId ?? "");
  if (!result.ok) return <main style={{ width: 1080, height: 1350, display: "grid", placeItems: "center", background: "#03100b", color: "white" }}>AWAITING TOUCHLINE VERIFIED FINAL DATA · {result.reason}</main>;
  return <TouchlineSocialFinalScoreDraftView draft={result.data} placement="feed" />;
}
