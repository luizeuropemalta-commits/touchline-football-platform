import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialConfirmedEventDraftView from "@/components/touchline/social/TouchlineSocialConfirmedEventDraft";
import TouchlineSocialGoalHatLayoutDemo from "@/components/touchline/social/TouchlineSocialGoalHatLayoutDemo";
import { readTouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";

import {
  readTouchlineConfirmedGoalVisualQaPreview,
  readTouchlineConfirmedOwnGoalVisualQaPreview,
  readTouchlineConfirmedRedCardVisualQaPreview,
  readTouchlineGoalHatLayoutVisualQaPreview,
} from "./preview-draft";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TouchLine Confirmed Event Story Draft", robots: { index: false, follow: false } };

export default async function TouchlineSocialConfirmedEventPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ fixtureId?: string; eventId?: string; design?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const params = await searchParams;
  if (params.design === "goal-hat-layout") {
    const preview = await readTouchlineGoalHatLayoutVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>GOAL / HAT-TRICK LAYOUT VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-confirmed-event-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · CANONICAL SNAPSHOT · OUTBOUND OFF</span>
          <h1>GOAAAALLLLL · João Pedro v Brighton</h1>
          <p>Real persisted match data: Chelsea 4–3 Brighton. João Pedro scored at 32&apos; and the score immediately became 3–0 at Stamford Bridge.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 goal in Hat-trick composition preview">
            <div className={styles.artScale}>
              <TouchlineSocialGoalHatLayoutDemo draft={preview} />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>043 · GOAL EVENT · CANONICAL SNAPSHOT</span>
            <h2>João Pedro · Chelsea 3–0 Brighton</h2>
            <ul>
              <li>The scoreboard shows the score immediately after the goal, not the final score.</li>
              <li>Stamford Bridge is selected from the canonical home club.</li>
              <li>João Pedro&apos;s card uses the persisted SportMonks identity and TouchLine publication.</li>
              <li>Match Rating 8.24, Total Rating 16.45 and +5 TouchLine Points remain distinct.</li>
            </ul>
          </aside>
        </section>
      </main>
    );
  }
  if (params.design === "goal") {
    const preview = await readTouchlineConfirmedGoalVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>GOAL-CONFIRMED VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-confirmed-event-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · SAMPLE DATA · NOT PUBLISHED</span>
          <h1>TouchLine Goal Confirmed</h1>
          <p>Premium compact 1080 × 1350 Feed template. The canonical 043 reader remains fail-closed until the event is stable, reconciled and confirmed.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 goal-confirmed artwork preview">
            <div className={styles.artScale}>
              <TouchlineSocialConfirmedEventDraftView draft={preview} placement="feed" />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>043 · GOAL_CONFIRMED</span>
            <h2>Approval checklist</h2>
            <ul>
              <li>Current score and minute are immediately readable.</li>
              <li>The verified scorer and TouchLine card own the moment.</li>
              <li>Arena identity stays visible through premium glass panels.</li>
              <li>Total Rating, Match Rating and TouchLine Points remain distinct.</li>
              <li>VAR, review and unstable events never render or dispatch.</li>
            </ul>
            <dl>
              <div><dt>Canvas</dt><dd>1080 × 1350 Feed</dd></div>
              <div><dt>Copy</dt><dd>British English</dd></div>
              <div><dt>Data shown</dt><dd>Sample only</dd></div>
              <div><dt>Outbound</dt><dd>Disabled</dd></div>
            </dl>
          </aside>
        </section>
      </main>
    );
  }
  if (params.design === "red-card") {
    const preview = await readTouchlineConfirmedRedCardVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>RED-CARD VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-confirmed-event-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · SAMPLE DATA · NOT PUBLISHED</span>
          <h1>TouchLine Red Card Confirmed</h1>
          <p>Premium compact 1080 × 1350 Feed candidate. The canonical reader accepts only an explicit, stable dismissal event.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 red-card artwork preview">
            <div className={styles.artScale}>
              <TouchlineSocialConfirmedEventDraftView draft={preview} placement="feed" />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>043 · RED_CARD_CONFIRMED</span>
            <h2>Approval checklist</h2>
            <ul>
              <li>Confirmed dismissal, player and minute are immediately readable.</li>
              <li>The shared 041 scoreboard stays visually consistent.</li>
              <li>Second-yellow and straight-red labels remain distinct.</li>
              <li>Pending, VAR and rescinded events never render or dispatch.</li>
            </ul>
          </aside>
        </section>
      </main>
    );
  }
  if (params.design === "own-goal") {
    const preview = await readTouchlineConfirmedOwnGoalVisualQaPreview();
    if (!preview) return <main className={styles.unavailable}>OWN-GOAL VISUAL QA PREVIEW UNAVAILABLE</main>;
    return (
      <main className={styles.page} data-confirmed-event-visual-qa="non-publishable">
        <header className={styles.intro}>
          <span>LOCAL VISUAL QA · SAMPLE DATA · NOT PUBLISHED</span>
          <h1>TouchLine Own Goal</h1>
          <p>The approved 043 goal composition is reused. The official own-goal author remains on the card while the score is credited only to the opposing club.</p>
        </header>
        <section className={styles.reviewGrid}>
          <div className={styles.artViewport} aria-label="1080 by 1350 own-goal artwork preview">
            <div className={styles.artScale}>
              <TouchlineSocialConfirmedEventDraftView draft={preview} placement="feed" />
            </div>
          </div>
          <aside className={styles.reviewPanel}>
            <span>043 · GOAL_CONFIRMED · OWN GOAL</span>
            <h2>Shared-template rules</h2>
            <ul>
              <li>The visible label changes to Own Goal.</li>
              <li>The card identifies the official own-goal author.</li>
              <li>The current score benefits the opposing club.</li>
              <li>No scoring club or player is inferred.</li>
            </ul>
          </aside>
        </section>
      </main>
    );
  }
  const result = await readTouchlineSocialConfirmedEventDraft(params.fixtureId ?? "", params.eventId ?? "");
  if (!result.ok) return <main style={{ width: 1080, height: 1920, display: "grid", placeItems: "center", background: "#03100b", color: "white" }}>AWAITING TOUCHLINE VERIFIED EVENT · {result.reason}</main>;
  return <TouchlineSocialConfirmedEventDraftView draft={result.data} />;
}
