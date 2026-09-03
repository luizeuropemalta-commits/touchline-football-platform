import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialConfirmedEventDraftView from "@/components/touchline/social/TouchlineSocialConfirmedEventDraft";
import TouchlineSocialRankingDraftView from "@/components/touchline/social/TouchlineSocialRankingDraft";
import { readTouchlineConfirmedRedCardVisualQaPreview } from "@/app/visual-qa/social-confirmed-event/preview-draft";

import { createRankingVisualQaPreview } from "./preview-drafts";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine · Next three social templates", robots: { index: false, follow: false } };

export default async function TouchlineNextThreeSocialTemplatesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ focus?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { focus } = await searchParams;
  const redCard = await readTouchlineConfirmedRedCardVisualQaPreview();
  if (!redCard) return <main className={styles.unavailable}>THREE-TEMPLATE VISUAL QA UNAVAILABLE</main>;
  const preview = createRankingVisualQaPreview("GAMEWEEK_RANKING_PREVIEW");
  const final = createRankingVisualQaPreview("GAMEWEEK_RANKING_FINAL");
  if (focus === "ranking-preview" || focus === "ranking-final") {
    return (
      <main className={styles.focusPage} data-three-template-visual-qa="non-publishable">
        <TouchlineSocialRankingDraftView draft={focus === "ranking-preview" ? preview : final} />
      </main>
    );
  }
  return (
    <main className={styles.page} data-three-template-visual-qa="non-publishable">
      <header className={styles.header}>
        <span>LOCAL VISUAL QA · THREE CANDIDATES · OUTBOUND DISABLED</span>
        <h1>TouchLine social approval board</h1>
        <p>Review the next three templates together. Every football fact shown here is frozen QA data or an explicitly labelled event-state sample.</p>
      </header>
      <section className={styles.board}>
        <article>
          <div><span>043</span><h2>Red Card Confirmed</h2></div>
          <div className={styles.viewport}><div className={styles.scale}><TouchlineSocialConfirmedEventDraftView draft={redCard} placement="feed" /></div></div>
          <a href="/visual-qa/social-confirmed-event?design=red-card">Open full size</a>
        </article>
        <article>
          <div><span>044</span><h2>Gameweek Ranking Preview</h2></div>
          <div className={styles.viewport}><div className={styles.scale}><TouchlineSocialRankingDraftView draft={preview} /></div></div>
          <a href="/visual-qa/social-next-three?focus=ranking-preview">Open full size</a>
        </article>
        <article>
          <div><span>044</span><h2>Gameweek Ranking Final</h2></div>
          <div className={styles.viewport}><div className={styles.scale}><TouchlineSocialRankingDraftView draft={final} /></div></div>
          <a href="/visual-qa/social-next-three?focus=ranking-final">Open full size</a>
        </article>
      </section>
    </main>
  );
}
