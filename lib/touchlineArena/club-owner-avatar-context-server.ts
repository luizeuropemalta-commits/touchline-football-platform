import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail, ownerEmails } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "./auth-access";
import { createClubOwnerAvatarPersistence } from "./club-owner-avatar-persistence";
import { awaitAvatarStep, isAvatarAccountId, projectAvatarRecoveryContext } from "./club-owner-avatar-upload-contract";
import { getClubOwnerAvatarControlAdmission } from "./club-owner-avatar-control-admission";
import { TOUCHLINE_QA_ORIGIN } from "./public-origin";
import { inspectTouchlineQaVercelEnvironment } from "@/lib/touchlinePreview/qa-environment-verifier-core";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import { projectClubOwnerAvatarSelectionContext } from "./club-owner-avatar-selection-contract";

export type ClubOwnerAvatarContext = ReturnType<typeof projectAvatarRecoveryContext>;

/** Future host seam: one C1 read, two distinct projections. Both additional
 * capabilities default off; retention readiness is not inferred from auth. */
export function createClubOwnerAvatarSelectionContextReader(selectionEnabled = false, retentionReady = false) {
  const read = createClubOwnerAvatarContextReader();
  return async (...args: Parameters<typeof read>) => {
    const recovery = await read(...args);
    return { recovery, selection: projectClubOwnerAvatarSelectionContext(recovery, selectionEnabled, retentionReady) };
  };
}
const TIMEOUT_MS = 8_000;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Create before the page's session client/authentication. Consume that single
 * authentication result, including its error; never authenticate a second time.
 * Unknown/off is null, not a fictitious revision zero. This read does not enable
 * upload or verify hosted schema/Storage readiness. Deadlines bound waiting, not
 * native work termination; SSR has no automatic browser-disconnect signal here.
 */
export function createClubOwnerAvatarContextReader() {
  const environment = { ...process.env };
  const assertSnapshot = () => {
    if (Object.keys(environment).length !== Object.keys(process.env).length
      || Object.keys(environment).some(key => process.env[key] !== environment[key])) throw Error("AVATAR_CONFIGURATION_CHANGED");
  };
  return async (authentication: unknown, expectedAccountId: string, outerSignal?: AbortSignal): Promise<ClubOwnerAvatarContext | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pool = getClubOwnerAvatarControlAdmission();
    let scope: ReturnType<typeof pool.tryAcquire> = null;
    try {
      assertSnapshot();
      if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED !== "true"
        || resolveTouchlineDataSource(environment) !== "direct" || ownerEmails().length === 0) return null;
      const result = record(authentication), user = record(record(result?.data)?.user);
      const actor = user?.id, email = user?.email;
      // Capture validated scalars/access before awaiting any work. Mutable caller
      // objects and user_metadata cannot retarget or authorize this read.
      if (result?.error !== null || !isAvatarAccountId(actor) || actor !== actor.toLowerCase()
        || actor !== expectedAccountId || typeof email !== "string" || !email.trim()
        || !hasTouchLineArenaAccess({ app_metadata: record(user?.app_metadata) }) || isOwnerEmail(email)) return null;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, ...(outerSignal ? [outerSignal] : [])]);
      const expires = performance.now() + TIMEOUT_MS;
      const guard = () => {
        assertSnapshot();
        if (performance.now() >= expires) controller.abort();
        signal.throwIfAborted();
        if (scope) pool.assertOpen(scope);
      };
      guard(); scope = pool.tryAcquire(); if (!scope) return null;
      timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      guard();
      const requestHeaders = await awaitAvatarStep(() => pool.track(scope!, () => headers()), signal);
      guard();
      const hostname = requestHeaders.get("host");
      if (hostname !== new URL(TOUCHLINE_QA_ORIGIN).hostname || requestHeaders.get("x-touchline-isolated-preview") !== null
        || inspectTouchlineQaVercelEnvironment({ environment, requestHostname: hostname }).status !== "PASS") return null;
      guard();
      const client = createAdminClient();
      guard();
      if (!client) return null;
      const persistence = createClubOwnerAvatarPersistence(client, actor, { timeoutMs: TIMEOUT_MS, trackControl: work => {
        guard(); return pool.track(scope!, work);
      } });
      const current = await awaitAvatarStep(() => persistence.readRecoveryContext(signal), signal);
      guard();
      const configuredActor = environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID;
      const uploadAllowed = environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED === "true"
        && isAvatarAccountId(configuredActor) && configuredActor.toLowerCase() === actor;
      const context = projectAvatarRecoveryContext(current, uploadAllowed);
      guard();
      return context;
    } catch { return null; }
    finally { if (timer !== undefined) clearTimeout(timer); if (scope) pool.close(scope); }
  };
}
