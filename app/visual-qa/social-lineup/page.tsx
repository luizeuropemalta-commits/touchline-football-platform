import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialLineupDraftView from "@/components/touchline/social/TouchlineSocialLineupDraft";
import { readTouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TouchLine Official Line-up Draft",
  robots: { index: false, follow: false },
};

type Props = Readonly<{
  searchParams: Promise<{ fixtureId?: string; teamId?: string }>;
}>;

export default async function TouchlineSocialLineupDraftPage({ searchParams }: Props) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  const result = await readTouchlineSocialLineupDraft({
    fixtureId: params.fixtureId ?? "",
    teamId: params.teamId ?? "",
  });
  if (!result.ok) {
    return (
      <main style={{
        width: 1080,
        height: 1350,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(145deg,#06120e,#020807)",
        color: "white",
        fontFamily: "Arial, sans-serif",
        textAlign: "center",
      }}>
        <div>
          <p style={{ color: "#b6ff4f", fontSize: 20, fontWeight: 950, letterSpacing: ".14em" }}>TOUCHLINE DRAFT</p>
          <h1 style={{ margin: "18px 0", fontSize: 54 }}>AGUARDANDO ESCALAÇÃO</h1>
          <p style={{ color: "rgba(255,255,255,.6)", fontSize: 18 }}>Official verified line-up unavailable · {result.reason}</p>
        </div>
      </main>
    );
  }
  return <TouchlineSocialLineupDraftView draft={result.data} />;
}
