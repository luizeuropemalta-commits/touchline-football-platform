import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialRankingDraftView from "@/components/touchline/social/TouchlineSocialRankingDraft";

import { createRankingVisualQaPreview } from "../social-next-three/preview-drafts";
import styles from "../social-next-three/review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TouchLine · Ranking social catalogue",
  robots: { index: false, follow: false },
};

const candidates = [
  { key: "player-duel", label: "Player Duel", type: "PLAYER_DUEL" },
  { key: "gameweek-hero", label: "Gameweek Hero", type: "GAMEWEEK_HERO" },
  { key: "top-performer", label: "Top Performer", type: "TOP_PERFORMER" },
  { key: "hat-trick-hero", label: "Hat-trick Hero", type: "HAT_TRICK_HERO" },
] as const;

export default async function TouchlineSocialRankingCataloguePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ focus?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { focus } = await searchParams;
  const focused = candidates.find((candidate) => candidate.key === focus);
  if (focused) {
    return (
      <main className={styles.focusPage} data-ranking-catalogue-visual-qa="non-publishable">
        <TouchlineSocialRankingDraftView draft={createRankingVisualQaPreview(focused.type)} />
      </main>
    );
  }
  return (
    <main className={styles.page} data-ranking-catalogue-visual-qa="non-publishable">
      <header className={styles.header}>
        <span>LOCAL VISUAL QA · 044 CATALOGUE · OUTBOUND DISABLED</span>
        <h1>TouchLine ranking family</h1>
        <p>Four remaining automatic candidates. Live rendering requires the exact verified ranking, fixture and event revision for each content type.</p>
      </header>
      <section className={`${styles.board} ${styles.fourBoard}`}>
        {candidates.map((candidate) => (
          <article key={candidate.key}>
            <div><span>044</span><h2>{candidate.label}</h2></div>
            <div className={styles.viewport}>
              <div className={styles.scale}>
                <TouchlineSocialRankingDraftView draft={createRankingVisualQaPreview(candidate.type)} />
              </div>
            </div>
            <a href={`/visual-qa/social-ranking-catalogue?focus=${candidate.key}`}>Open full size</a>
          </article>
        ))}
      </section>
    </main>
  );
}
