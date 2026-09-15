import { notFound } from "next/navigation";
import SocialLineupLiveReview from "@/components/touchline/social/social-lineup-live-review";
import { readSocialLineupLiveSource } from "@/lib/touchlineArena/social-lineup-live-source";

export const dynamic = "force-dynamic";
export const metadata = { title: "TouchLine private line-up review", robots: { index: false, follow: false } };

export default async function SocialLineupLivePage({ searchParams }: { searchParams: Promise<{ placement?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const source = await readSocialLineupLiveSource();
  if (!source) notFound();
  if (!source.ok) return <main data-lineup-live-blocked={source.reason}>Amostra indisponível: dados precisam de reconciliação · {source.reason}</main>;
  return <SocialLineupLiveReview {...source} placement={params.placement === "STORY" ? "STORY" : "FEED"} />;
}
