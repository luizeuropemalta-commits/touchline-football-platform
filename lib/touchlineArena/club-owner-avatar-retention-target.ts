import { inspectTouchlineProductionServiceRoleBinding } from "../touchlinePreview/production-environment-core.ts";

declare const targetBrand: unique symbol;
export type AvatarRetentionTarget = Readonly<{
  mode: "qa" | "production";
  profileId: string;
  projectRef: string;
  supabaseOrigin: string;
  [targetBrand]: true;
}>;
const qaRef = "xgxbwqxjssxxuihuwmgy";
const targets = new WeakMap<AvatarRetentionTarget, string | null>();
const qaTarget = Object.freeze({ mode: "qa", profileId: "qa-avatar-retention-v1", projectRef: qaRef,
  supabaseOrigin: `https://${qaRef}.supabase.co` }) as AvatarRetentionTarget;
targets.set(qaTarget, null);

/** Configured server authority, never request input. Legacy service-role JWT
 * only: this validates configuration binding, not a caller's JWT signature.
 * No default Production ref/profile, credential discovery or I/O. */
export function createProductionAvatarRetentionTarget(input: Readonly<{
  profileId?: string; projectRef?: string; supabaseOrigin?: string; serviceRoleKey?: string;
}>): AvatarRetentionTarget | null {
  const { profileId, projectRef, supabaseOrigin, serviceRoleKey } = input;
  if (!profileId || profileId !== profileId.trim() || !/^[a-z][a-z0-9-]{2,79}$/.test(profileId)
    || !projectRef || projectRef.length !== 20 || !/^[a-z]{20}$/.test(projectRef)
    || projectRef === qaRef || supabaseOrigin !== `https://${projectRef}.supabase.co`
    || !inspectTouchlineProductionServiceRoleBinding({ projectRef, serviceRoleKey }).allowed) return null;
  const target = Object.freeze({ mode: "production", profileId, projectRef, supabaseOrigin }) as AvatarRetentionTarget;
  targets.set(target, serviceRoleKey!);
  return target;
}

/** Omitting the new argument preserves the exact existing QA API. A forged
 * target is rejected; no caller may retarget a captured factory via mutation. */
export function avatarRetentionTarget(input?: AvatarRetentionTarget): AvatarRetentionTarget {
  if (input === undefined) return qaTarget;
  if (!targets.has(input)) throw Error("AVATAR_RETENTION_TARGET_UNCONFIRMED");
  return input;
}
export function matchesAvatarRetentionTarget(input: AvatarRetentionTarget | undefined, origin: unknown, key?: unknown): boolean {
  try {
    const target = avatarRetentionTarget(input);
    return origin === target.supabaseOrigin && (target.mode === "qa" || key === targets.get(target));
  } catch { return false; }
}

const qaNames = {
  list: "touchline_list_due_qa_avatar_retention_candidates",
  begin: "touchline_begin_qa_avatar_retention_attempt",
  record: "touchline_record_qa_avatar_retention_attempt",
  claim: "touchline_claim_qa_avatar_retention_discovery",
  register: "touchline_register_qa_avatar_retention_candidate",
  ack: "touchline_ack_qa_avatar_retention_discovery",
} as const;
type Operation = keyof typeof qaNames;
export function avatarRetentionRpcName(target: AvatarRetentionTarget, operation: Operation): string {
  return avatarRetentionTarget(target).mode === "qa" ? qaNames[operation] : qaNames[operation].replace("_qa_", "_");
}
export function avatarRetentionRpcContext(target: AvatarRetentionTarget): Readonly<Record<string, string>> {
  const checked = avatarRetentionTarget(target);
  return checked.mode === "qa" ? { p_project_ref: checked.projectRef }
    : { p_profile_id: checked.profileId, p_project_ref: checked.projectRef };
}
