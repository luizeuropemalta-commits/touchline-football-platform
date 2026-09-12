/**
 * Immutable owner-approval locks for the local 041/042 visual evidence.
 *
 * These values are transcribed from the owner approval records.  They are not
 * mutable runtime configuration: a changed source must become unavailable
 * until a new owner review records a new lock.  The regression tests bind this
 * module back to the human-readable approval records.
 */

const SHA256 = /^sha256:[0-9a-f]{64}$/;

export type TouchlineTemplateApprovalLock = Readonly<{
  templateVersion: "touchline-match-preview-feed-v1" | "touchline-full-time-feed-v1" | "touchline-goal-event-feed-v1" | "touchline-hat-trick-feed-v1";
  visualTemplateChecksum: string;
  templateIdentityChecksum: string;
  /**
   * Digest of the complete frozen executable bundle (renderer, card snapshot,
   * copy, lexicon and template descriptor).  It is deliberately separate from
   * the historical approval identity: snapshot files have safe runtime import
   * rewrites, while the approval record preserves the original source paths.
   */
  frozenBundleChecksum: string;
}>;

export const TOUCHLINE_OWNER_APPROVED_TEMPLATE_LOCKS = Object.freeze([
  {
    templateVersion: "touchline-match-preview-feed-v1",
    visualTemplateChecksum: "sha256:181fbf97fa849795a73a3f68f214072057dbff92d8d59902476057f74ac331da",
    templateIdentityChecksum: "sha256:64fd190e2d20d081b4b8a138a0cc563a23fbf82f423e01877534cc04d3fba1f4",
    frozenBundleChecksum: "sha256:ed317dd61ef858e8dd46b5785bf450082ba4bce32b1c6e6492b23c1468145961",
  },
  {
    templateVersion: "touchline-full-time-feed-v1",
    visualTemplateChecksum: "sha256:99b78ad79d9587a894e3d8e87e59c3296e3cde8f6d2e4fdc6247095baf4b0d3f",
    templateIdentityChecksum: "sha256:35c09e45209429b76bbfd5a0c569d6c88745c4b648fb7a118fe553f02bec1ff2",
    frozenBundleChecksum: "sha256:7a542b114443faadd47f8d6bc33a945dea7a0cc34915973472b2f7e9f5842cc8",
  },
  {
    templateVersion: "touchline-goal-event-feed-v1",
    visualTemplateChecksum: "sha256:d2e1091432d6bcd26601b6338b25c4b3260cc3da9aac0a0dc5d99d6bb927f60a",
    templateIdentityChecksum: "sha256:c04b3f999cb9d7f80a8cdb8f7445e697c6bf0c441e57fbb33cd5715af49843e5",
    frozenBundleChecksum: "sha256:fc309b4ce901b447728ec4827eee10ca2a1bd14edef84450f9a1621fdbb2f7ac",
  },
  {
    templateVersion: "touchline-hat-trick-feed-v1",
    visualTemplateChecksum: "sha256:d2e1091432d6bcd26601b6338b25c4b3260cc3da9aac0a0dc5d99d6bb927f60a",
    templateIdentityChecksum: "sha256:a3506d1996740589416954038db22632d6d42b01b829cec447d972e1ab80103b",
    frozenBundleChecksum: "sha256:ac5630dda87ff226deadf9aea73202ae1a68cc36e8f14eead8c8345b5975bfdd",
  },
] as const satisfies readonly TouchlineTemplateApprovalLock[]);

export type TouchlineTemplateApprovalLockAssessment =
  | Readonly<{ state: "approved"; lock: TouchlineTemplateApprovalLock }>
  | Readonly<{
    state: "unavailable";
    reason: "APPROVED_TEMPLATE_CHECKSUM_MISMATCH" | "APPROVED_TEMPLATE_LOCK_MISSING";
    lock?: TouchlineTemplateApprovalLock;
  }>;

/**
 * Fails closed.  An executable source only inherits a local artwork approval
 * when both locked checksums agree exactly with the owner-reviewed revision.
 */
export function assessTouchlineTemplateApprovalLock(input: Readonly<{
  templateVersion: string;
  visualTemplateChecksum: string;
  templateIdentityChecksum: string;
}>): TouchlineTemplateApprovalLockAssessment {
  const lock = TOUCHLINE_OWNER_APPROVED_TEMPLATE_LOCKS.find((candidate) => (
    candidate.templateVersion === input.templateVersion
  ));
  if (!lock) return Object.freeze({ state: "unavailable", reason: "APPROVED_TEMPLATE_LOCK_MISSING" });
  if (!SHA256.test(input.visualTemplateChecksum)
    || !SHA256.test(input.templateIdentityChecksum)
    || input.visualTemplateChecksum !== lock.visualTemplateChecksum
    || input.templateIdentityChecksum !== lock.templateIdentityChecksum) {
    return Object.freeze({ state: "unavailable", reason: "APPROVED_TEMPLATE_CHECKSUM_MISMATCH", lock });
  }
  return Object.freeze({ state: "approved", lock });
}

/**
 * A social renderer can inherit a historical owner approval only if the exact
 * frozen executable bundle is present.  We never rewrite the historical
 * approval checksums to follow the live site-card renderer: a source, copy,
 * lexicon or descriptor change leaves the generic calculated identity in
 * place, which the normal lock assessment rejects.
 */
export function reconcileTouchlineOwnerApprovedSnapshot<T extends Readonly<{
  templateVersion: string;
  visualTemplateChecksum: string;
  templateIdentityChecksum: string;
}>>(identity: T, frozenBundleChecksum: string): T {
  const lock = TOUCHLINE_OWNER_APPROVED_TEMPLATE_LOCKS.find((candidate) => (
    candidate.templateVersion === identity.templateVersion
  ));
  if (!lock || !SHA256.test(frozenBundleChecksum) || frozenBundleChecksum !== lock.frozenBundleChecksum) {
    return identity;
  }
  /**
   * A standalone runtime snapshot may be safer than the old renderer while
   * still being a different visual artifact.  It must not inherit approval by
   * substituting historical checksums: that would make an unreviewed image
   * appear byte-identical to an owner-reviewed one.  Keep the raw identity
   * unless it already equals the recorded approval.  In that exact case this
   * is intentionally a no-op, but documents the only valid reconciliation.
   */
  if (identity.visualTemplateChecksum !== lock.visualTemplateChecksum
    || identity.templateIdentityChecksum !== lock.templateIdentityChecksum) {
    return identity;
  }
  return identity;
}
