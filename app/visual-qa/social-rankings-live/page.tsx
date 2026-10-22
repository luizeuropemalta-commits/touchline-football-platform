import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RANKINGS_LIVE_ART_IDS, type RankingsLiveArtId } from "@/lib/social-rankings-live-contract";
import { readRankingsLiveRenderInput } from "@/lib/social-rankings-live-server";
import TouchlineSocialRankingsLive from "@/components/touchline/social/TouchlineSocialRankingsLive";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine · Rankings review", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ artId?: string; placement?: string; frameMs?: string; runId?: string | string[]; inputSha256?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (!RANKINGS_LIVE_ART_IDS.includes(params.artId as RankingsLiveArtId)) notFound();
  const verified = await readRankingsLiveRenderInput(params.runId, params.inputSha256);
  return <div style={{ display: "contents" }} data-rankings-input-run={verified.runId} data-rankings-input-sha256={verified.inputSha256}>
    <TouchlineSocialRankingsLive input={verified.input} artId={params.artId as RankingsLiveArtId} placement={params.placement === "STORY" ? "STORY" : "FEED"} frameMs={Number(params.frameMs) || 0} />
  </div>;
}
