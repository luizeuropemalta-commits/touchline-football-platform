import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TouchlineSocialMatchPreviewDraftView from "@/components/touchline/social/TouchlineSocialMatchPreviewDraft";

import styles from "./preview.module.css";
import { readClubHubNextFixturePreview } from "./preview-draft";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TouchLine · Arsenal v Chelsea post preview",
  robots: { index: false, follow: false },
};

export default async function ClubHubNextFixturePostPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const preview = await readClubHubNextFixturePreview();
  if (!preview) {
    return <main className={styles.unavailable}>CANONICAL POST PREVIEW UNAVAILABLE</main>;
  }
  const { caption, draft } = preview;

  return (
    <main className={styles.page} data-local-post-preview="arsenal-chelsea">
      <header className={styles.intro}>
        <span>LOCAL VISUAL QA · NOT PUBLISHED</span>
        <h1>How the next-match post will look</h1>
        <p>One canonical TouchLine revision for ClubHub, ClubOwner, Instagram and Facebook.</p>
      </header>
      <section className={styles.reviewGrid}>
        <div className={styles.artViewport} aria-label="1080 by 1350 feed artwork preview">
          <div className={styles.artScale}>
            <TouchlineSocialMatchPreviewDraftView draft={draft} />
          </div>
        </div>
        <aside className={styles.captionPanel}>
          <div className={styles.destinations}>
            <span>ClubHub</span><span>ClubOwner</span><span>Instagram</span><span>Facebook</span>
          </div>
          <p className={styles.label}>SHARED PREMIUM COPY</p>
          <pre>{caption}</pre>
          <dl>
            <div><dt>Art</dt><dd>1080 × 1350</dd></div>
            <div><dt>Template</dt><dd>MATCH_PREVIEW v1</dd></div>
            <div><dt>State</dt><dd>DRAFT · approval required</dd></div>
            <div><dt>Outbound</dt><dd>Disabled</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
