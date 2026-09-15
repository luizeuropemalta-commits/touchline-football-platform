import { notFound } from "next/navigation";
import TouchlineSocialEventsLiveReview from "@/components/touchline/social/TouchlineSocialEventsLiveReview";
import { readEventsLiveReviewSource } from "@/lib/touchlineArena/social-events-live-source";

export const dynamic = "force-dynamic";
export const metadata = { title: "TouchLine private event video review", robots: { index: false, follow: false } };

export default async function EventsLiveReviewPage({ searchParams }: { searchParams: Promise<{ artId?: string; placement?: string; input?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const source = await readEventsLiveReviewSource(params.artId ?? "", params.input);
  if (!source) notFound();
  if (source.reason) {
    return <main data-events-live-blocked={source.reason}>Amostra indisponível: os fatos precisam ser revalidados.</main>;
  }
  return <TouchlineSocialEventsLiveReview input={source.input} placement={params.placement === "STORY" ? "STORY" : "FEED"} checksum={source.checksum} />;
}
