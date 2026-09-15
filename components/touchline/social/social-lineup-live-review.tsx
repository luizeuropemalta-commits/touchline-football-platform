import TouchlineSocialLineupDraftView from "./TouchlineSocialLineupDraft";
import type { TouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";
import type { SocialLineupLiveReference } from "@/lib/touchlineArena/social-lineup-live-contract";
import styles from "./social-lineup-live-review.module.css";

/** Private review surface. Operational review state stays in metadata, never in the public creative. */
export default function SocialLineupLiveReview({ draft, reference, provenance, placement, checksum }: {
  draft: TouchlineSocialLineupDraft; reference: SocialLineupLiveReference; provenance: unknown;
  placement: "FEED" | "STORY"; checksum: string;
}) {
  return <section className={`${styles.review} ${placement === "STORY" ? styles.story : styles.feed}`}
    data-lineup-live-ready="true" data-placement={placement} data-source-checksum={checksum}
    data-publishable="false" data-mode="RETROSPECTIVE_VISUAL_REVIEW" data-template-approval="PENDING">
    <div className={styles.composition}>
      <TouchlineSocialLineupDraftView draft={draft} reviewMode placement={placement} />
      <div className={styles.reviewDate}><strong>{reference.dateLabel}</strong><span>LINE-UP REVIEW · MATCH REWIND</span></div>
      <svg className={styles.perimeter} viewBox={`0 0 1080 ${placement === "STORY" ? 1920 : 1350}`} aria-hidden="true">
        <rect data-lineup-loop="true" x="14" y="14" width="1052" height={placement === "STORY" ? 1892 : 1322} rx="30" pathLength="100" />
      </svg>
    </div>
    <script id="social-lineup-live-provenance" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ draft, provenance }).replaceAll("<", "\\u003c") }} />
  </section>;
}
