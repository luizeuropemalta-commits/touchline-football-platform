import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RANKINGS_LIVE_ART_IDS, type RankingsLiveArtId } from "@/lib/social-rankings-live-contract";
import { readRankingsLiveRenderInput } from "@/lib/social-rankings-live-server";
import TouchlineSocialRankingsLive from "@/components/touchline/social/TouchlineSocialRankingsLive";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine · Rankings review", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ artId?: string; placement?: string; frameMs?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (!RANKINGS_LIVE_ART_IDS.includes(params.artId as RankingsLiveArtId)) notFound();
  const input = await readRankingsLiveRenderInput();
  return <TouchlineSocialRankingsLive input={input} artId={params.artId as RankingsLiveArtId} placement={params.placement === "STORY" ? "STORY" : "FEED"} frameMs={Number(params.frameMs) || 0} />;
}
