import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialFinalScoreDraftView from "@/components/touchline/social/TouchlineSocialFinalScoreDraft";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";

import { readTouchlineFullTimeVisualQaPreview } from "./preview-draft";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine Full Time Draft", robots: { index: false, follow: false } };

export default async function TouchlineSocialFullTimePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ fixtureId?: string; design?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  if (params.design === "1") {
    const preview = await readTouchlineFullTimeVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>FULL-TIME VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-full-time-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · SAMPLE DATA · NOT PUBLISHED</span>
          <h1>TouchLine Full-Time</h1>
          <p>Premium 1080 × 1350 feed template. The canonical 042 reader remains fail-closed until verified final data exists.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 full-time artwork preview">
            <div className={styles.artScale}>
              <TouchlineSocialFinalScoreDraftView draft={preview} placement="feed" />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>042 · FULL_TIME</span>
            <h2>Approval checklist</h2>
            <ul>
              <li>Score is the primary hero.</li>
              <li>Club identity stays balanced without logo circles.</li>
              <li>Arena remains visible through translucent premium panels.</li>
              <li>One verified Top Match Card receives the editorial spotlight.</li>
              <li>Real renders will include only reconciled final facts.</li>
            </ul>
            <dl>
              <div><dt>Canvas</dt><dd>1080 × 1350</dd></div>
              <div><dt>Copy</dt><dd>British English</dd></div>
              <div><dt>Approval</dt><dd>Art + text separated</dd></div>
              <div><dt>Outbound</dt><dd>Disabled</dd></div>
            </dl>
          </aside>
        </section>
      </main>
    );
  }
  const result = await readTouchlineSocialFinalScoreDraft(params.fixtureId ?? "");
  if (!result.ok) return <main style={{ width: 1080, height: 1350, display: "grid", placeItems: "center", background: "#03100b", color: "white" }}>AWAITING TOUCHLINE VERIFIED FINAL DATA · {result.reason}</main>;
  return <TouchlineSocialFinalScoreDraftView draft={result.data} placement="feed" />;
}
