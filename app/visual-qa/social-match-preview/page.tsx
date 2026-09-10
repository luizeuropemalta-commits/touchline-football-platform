import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialMatchPreviewDraftView from "@/components/touchline/social/TouchlineSocialMatchPreviewDraft";
import { readTouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";

import { readTouchlineMatchPreviewVisualQaPreview } from "./preview-draft";
import styles from "../social-full-time/review.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TouchLine Match Preview Draft",
  robots: { index: false, follow: false },
};

type Props = Readonly<{
  searchParams: Promise<{ fixtureId?: string; design?: string }>;
}>;

export default async function TouchlineSocialMatchPreviewPage({ searchParams }: Props) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  if (params.design === "1") {
    const preview = await readTouchlineMatchPreviewVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>MATCH-PREVIEW VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-match-preview-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · FROZEN CANONICAL SNAPSHOT · NOT PUBLISHED</span>
          <h1>TouchLine Match Preview</h1>
          <p>Premium 1080 × 1350 feed template. This is a local review fixture only; the canonical 041 reader remains fail-closed until a verified upcoming fixture exists.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 match-preview artwork fixture">
            <div className={styles.artScale}>
              <TouchlineSocialMatchPreviewDraftView draft={preview.draft} />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>041 · MATCH_PREVIEW</span>
            <h2>Approval checklist</h2>
            <ul>
              <li>Both club leaders, names, numbers and crests stay inside their card frames.</li>
              <li>The fixture, Gameweek, venue and current table strip remain readable.</li>
              <li>The crown stays absent unless a unique explicit leader is supplied by a live ranking.</li>
              <li>Snapshot data is local, deterministic and non-publishable.</li>
            </ul>
            <dl>
              <div><dt>Canvas</dt><dd>1080 × 1350</dd></div>
              <div><dt>Copy</dt><dd>British English</dd></div>
              <div><dt>Fixture</dt><dd>Frozen canonical snapshot</dd></div>
              <div><dt>Outbound</dt><dd>Disabled</dd></div>
            </dl>
          </aside>
        </section>
      </main>
    );
  }
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
