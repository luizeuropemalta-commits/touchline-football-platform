import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialMatchPreviewDraftView from "@/components/touchline/social/TouchlineSocialMatchPreviewDraft";
import { readTouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TouchLine Match Preview Draft",
  robots: { index: false, follow: false },
};

type Props = Readonly<{
  searchParams: Promise<{ fixtureId?: string }>;
}>;

export default async function TouchlineSocialMatchPreviewPage({ searchParams }: Props) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const result = await readTouchlineSocialMatchPreviewDraft({ fixtureId: params.fixtureId ?? "" });
  if (!result.ok) {
    return (
      <main style={{ width: 1080, height: 1350, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#06120e,#020807)", color: "white", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        <div>
          <p style={{ color: "#b6ff4f", fontSize: 20, fontWeight: 950, letterSpacing: ".14em" }}>TOUCHLINE MATCH PREVIEW</p>
          <h1 style={{ margin: "18px 0", fontSize: 54 }}>AWAITING VERIFIED MATCH DATA</h1>
          <p style={{ color: "rgba(255,255,255,.6)", fontSize: 18 }}>{result.reason}</p>
        </div>
      </main>
    );
  }
  return <TouchlineSocialMatchPreviewDraftView draft={result.data} />;
}
