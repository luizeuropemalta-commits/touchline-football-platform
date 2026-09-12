import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import TouchlineSocialApprovedGoalHatLayoutDemo from "@/components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo";
import TouchlineSocialApprovedFinalScoreDraft from "@/components/touchline/social/TouchlineSocialApprovedFinalScoreDraft";
import TouchlineSocialApprovedMatchPreviewDraft from "@/components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft";
import {
  assessTouchlineApprovedSocialSnapshot,
  type TouchlineApprovedSnapshotAssessment,
  type TouchlineApprovedSnapshotTemplate,
} from "@/lib/touchlineArena/social-approved-snapshot-manifest";

import {
  readApproved041VisualQaSnapshot,
  readApproved042VisualQaSnapshot,
  readApproved043VisualQaSnapshot,
} from "./preview-draft";
import styles from "../social-full-time/review.module.css";

export const dynamic = "force-dynamic";

type Design = "041" | "042" | "043";

const templateByDesign: Readonly<Record<Design, TouchlineApprovedSnapshotTemplate>> = {
  "041": "touchline-match-preview-feed-v1",
  "042": "touchline-full-time-feed-v1",
  "043": "touchline-goal-event-feed-v1",
};

function requestedDesign(value: string | undefined): Design {
  return value === "042" || value === "043" ? value : "041";
}

function status(assessment: TouchlineApprovedSnapshotAssessment) {
  return assessment.state === "approved"
    ? "CHECKSUM MATCHED · OWNER VISUAL REVIEW REQUIRED"
    : "NEW RENDERER · OWNER REVIEW REQUIRED";
}

function SnapshotReview({ design, assessment, children }: Readonly<{ design: Design; assessment: TouchlineApprovedSnapshotAssessment; children: ReactNode }>) {
  return (
    <main className={styles.page} data-social-approved-snapshot-visual-qa="non-publishable" data-social-design={design}>
      <header className={styles.intro}>
        <span>LOCAL VISUAL QA · STANDALONE RENDERER · OUTBOUND DISABLED</span>
        <h1>TouchLine Social Snapshot {design}</h1>
        <p>This page renders the new isolated snapshot bytes. It is a visual-review surface only: it cannot publish, enqueue, persist or call Instagram.</p>
      </header>
      <section className={styles.reviewGrid}>
        <div className={styles.artViewport} aria-label={`1080 by 1350 social snapshot ${design} artwork preview`}>
          <div className={styles.artScale}>{children}</div>
        </div>
        <aside className={styles.reviewPanel}>
          <span>{design} · STANDALONE SNAPSHOT</span>
          <h2>{status(assessment)}</h2>
          <ul>
            <li>Current renderer checksum: {assessment.checksum ?? "unavailable"}</li>
            <li>Fixture data is a checked-in local visual-QA fixture.</li>
            <li>Outbound and persistence are disabled by this preview surface.</li>
            <li>Approval must name this exact renderer checksum before any release gate can accept it.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

export default async function TouchlineApprovedSocialSnapshotsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ design?: string }> }>) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const design = requestedDesign((await searchParams).design);
  const assessment = await assessTouchlineApprovedSocialSnapshot(templateByDesign[design]);
  if (design === "041") {
    const preview = await readApproved041VisualQaSnapshot();
    return preview
      ? <SnapshotReview design={design} assessment={assessment}><TouchlineSocialApprovedMatchPreviewDraft draft={preview} /></SnapshotReview>
      : <main className={styles.unavailable}>SOCIAL SNAPSHOT VISUAL QA PREVIEW UNAVAILABLE</main>;
  }
  if (design === "042") {
    const preview = await readApproved042VisualQaSnapshot();
    return preview
      ? <SnapshotReview design={design} assessment={assessment}><TouchlineSocialApprovedFinalScoreDraft draft={preview} /></SnapshotReview>
      : <main className={styles.unavailable}>SOCIAL SNAPSHOT VISUAL QA PREVIEW UNAVAILABLE</main>;
  }
  const preview = await readApproved043VisualQaSnapshot();
  return preview
    ? <SnapshotReview design={design} assessment={assessment}><TouchlineSocialApprovedGoalHatLayoutDemo draft={preview} /></SnapshotReview>
    : <main className={styles.unavailable}>SOCIAL SNAPSHOT VISUAL QA PREVIEW UNAVAILABLE</main>;
}
