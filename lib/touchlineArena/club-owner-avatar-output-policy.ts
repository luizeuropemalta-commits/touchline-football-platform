import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

type OutputPolicy = Readonly<{ admissionVersion: 1 | 2; maxBytes: number }>;
const newOperation: OutputPolicy = Object.freeze({ admissionVersion: 2, maxBytes: 128 * 1024 });
const committedReplay: OutputPolicy = Object.freeze({ admissionVersion: 1, maxBytes: CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES });

/** Admission versions are not persisted journal/encoder versions. The caller
 * supplies the parsed authoritative begin outcome, never a browser preference.
 * Keep the encoder identical: every committed replay still verifies its exact
 * historic digest and current receipt under the original transport ceiling.
 */
export function getClubOwnerAvatarOutputPolicy(beginStatus: unknown): OutputPolicy | null {
  if (beginStatus === "started") return newOperation;
  if (beginStatus === "committed") return committedReplay;
  return null;
}
