import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialConfirmedEventDraftView from "@/components/touchline/social/TouchlineSocialConfirmedEventDraft";
import { readTouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine Confirmed Event Story Draft", robots: { index: false, follow: false } };

export default async function TouchlineSocialConfirmedEventPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ fixtureId?: string; eventId?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const result = await readTouchlineSocialConfirmedEventDraft(params.fixtureId ?? "", params.eventId ?? "");
  if (!result.ok) return <main style={{ width: 1080, height: 1920, display: "grid", placeItems: "center", background: "#03100b", color: "white" }}>AWAITING TOUCHLINE VERIFIED EVENT · {result.reason}</main>;
  return <TouchlineSocialConfirmedEventDraftView draft={result.data} />;
}
