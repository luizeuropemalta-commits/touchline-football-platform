import "server-only";
import { AuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { hasTouchLineArenaAccess } from "./auth-access.ts";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER, TOUCHLINE_QA_PREVIEW_MODE } from "../touchlinePreview/isolation.ts";
import { AVATAR_UPLOAD_TOTAL_TIMEOUT_MS, createAvatarEnvironmentGuard, isAvatarAccountId, parseAvatarUploadRequest, type AvatarRecoveryUploadDependencies } from "./club-owner-avatar-upload-contract.ts";
import { handleClubOwnerAvatarUpload } from "./club-owner-avatar-upload-handler.ts";
import { validateClubOwnerAvatar } from "./club-owner-avatar-validation.ts";
import { createClubOwnerAvatarPersistence } from "./club-owner-avatar-persistence.ts";
import { createClubOwnerAvatarStorage } from "./club-owner-avatar-storage.ts";
import { createClubOwnerAvatarReader } from "./club-owner-avatar-storage.ts";
import { handleClubOwnerAvatarRead } from "./club-owner-avatar-read-handler.ts";
import { getClubOwnerAvatarResourceAdmission, type ClubOwnerAvatarResourceScope } from "./club-owner-avatar-resource-admission.ts";
import { getClubOwnerAvatarControlAdmission } from "./club-owner-avatar-control-admission.ts";
import { awaitAvatarStep, isAvatarRevision, projectAvatarRecoveryContext, type AvatarFenceResult } from "./club-owner-avatar-upload-contract.ts";

export type ClubOwnerAvatarServerConfig = Readonly<{
  enabled?: boolean;
  requestOrigin?: string;
  supabaseOrigin?: string;
  publicSupabaseOrigin?: string;
  serviceRoleKey?: string;
  dataSource?: string;
  environment?: string;
  deploymentMode?: string;
  publicDeploymentMode?: string;
}>;
export type ClubOwnerAvatarServerDependencies = Readonly<{
  createSessionClient: (config: Readonly<{ supabaseOrigin: string }>, signal: AbortSignal) => Promise<{ auth: Pick<SupabaseClient["auth"], "getUser"> } | null>;
  createPrivilegedClient: (config: Readonly<{ supabaseOrigin: string; serviceRoleKey: string }>) => Pick<SupabaseClient, "rpc"> | null;
  // Composition must supply the canonical server isOwnerEmail helper. A missing,
  // failed or non-boolean classification cannot authorize the customer boundary.
  isOwnerEmail: (email: string) => boolean;
  fetchImpl: typeof fetch;
}>;

function httpsOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}
function reply(status: number, error: string) {
  return Response.json({ ok: false, state: status >= 500 ? "unknown" : "rejected", error }, { status, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", ...(status === 405 ? { Allow: "POST" } : {}),
  } });
}

function configuredServer(config: ClubOwnerAvatarServerConfig, dependencies: ClubOwnerAvatarServerDependencies) {
  return httpsOrigin(config.requestOrigin) && httpsOrigin(config.supabaseOrigin)
    && config.publicSupabaseOrigin === config.supabaseOrigin && config.dataSource === "direct"
    && (config.environment === "qa" || config.environment === "local")
    && config.deploymentMode === config.publicDeploymentMode
    && (config.deploymentMode === undefined || config.deploymentMode === TOUCHLINE_QA_PREVIEW_MODE)
    && typeof config.serviceRoleKey === "string" && config.serviceRoleKey.trim().length > 0 && !/[\r\n]/.test(config.serviceRoleKey)
    && typeof dependencies.createSessionClient === "function" && typeof dependencies.createPrivilegedClient === "function"
    && typeof dependencies.isOwnerEmail === "function" && typeof dependencies.fetchImpl === "function";
}

// Both compositions validate the session once, without enrolling the account or
// treating editable user_metadata as authority. Waiting is bounded by each core;
// getUser's transport has no per-request AbortSignal in this SDK seam.
async function authenticatedCustomer(origin: string, dependencies: ClubOwnerAvatarServerDependencies, signal: AbortSignal, assertEnvironment: () => void = () => {}) {
  assertEnvironment();
  signal.throwIfAborted();
  const client = await dependencies.createSessionClient({ supabaseOrigin: origin }, signal);
  assertEnvironment();
  signal.throwIfAborted();
  if (!client) throw Error("AVATAR_AUTH_UNCONFIRMED");
  const result = await client.auth.getUser();
  assertEnvironment();
  signal.throwIfAborted();
  if (!result || !result.data || !Object.hasOwn(result.data, "user")) throw Error("AVATAR_AUTH_UNCONFIRMED");
  const user = result.data.user;
  if (user === null && (result.error === null || result.error instanceof AuthSessionMissingError)) return null;
  if (result.error !== null || !user || !isAvatarAccountId(user.id)) throw Error("AVATAR_AUTH_UNCONFIRMED");
  const id = user.id.toLowerCase();
  if (!hasTouchLineArenaAccess(user) || typeof user.email !== "string" || !user.email.trim()) return { id, allowed: false };
  if (dependencies.isOwnerEmail(user.email) !== false) return { id, allowed: false };
  signal.throwIfAborted();
  return { id, allowed: true };
}

/** GET composition only. Runtime wiring must bind these injected factories to
 * the checked configuration; this factory itself never reads env or cookies.
 * No POST, publication, operation lookup, cleanup or access-enrollment path.
 */
export function createClubOwnerAvatarReadServer(config: ClubOwnerAvatarServerConfig,
  dependencies: ClubOwnerAvatarServerDependencies): (request: Request) => Promise<Response> {
  const settings = { ...config }, deps = { ...dependencies };
  const configured = configuredServer(settings, deps);
  const unavailable = (error: string) => Response.json({ ok: false, error }, { status: 503, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  } });
  return async request => {
    if (settings.enabled !== true) return unavailable("AVATAR_READ_DISABLED");
    if (!configured) return unavailable("AVATAR_READ_UNCONFIGURED");
    const expires = performance.now() + AVATAR_UPLOAD_TOTAL_TIMEOUT_MS;
    const resources = getClubOwnerAvatarResourceAdmission();
    let resourceScope: ClubOwnerAvatarResourceScope | undefined;
    try {
      let actorId: string | null = null;
      let persistence: ReturnType<typeof createClubOwnerAvatarPersistence> | undefined;
      let reader: ReturnType<typeof createClubOwnerAvatarReader> | undefined;
      const guardActor = (id: string, signal: AbortSignal) => {
        signal.throwIfAborted();
        resources.assertOpen(resourceScope!);
        if (!actorId || id !== actorId) throw Error("AVATAR_ACTOR_UNCONFIRMED");
      };
      const response = await handleClubOwnerAvatarRead(request, {
        async actor(signal) {
          // The read core has already checked method/origin/version. One shared
          // request ticket precedes auth/body/native work; adapters borrow it.
          signal.throwIfAborted();
          const acquired = resources.tryAcquire();
          if (!acquired) throw Error("AVATAR_RESOURCE_BUSY");
          resourceScope = acquired;
          const actor = await authenticatedCustomer(settings.publicSupabaseOrigin!, deps, signal);
          signal.throwIfAborted();
          if (actor?.allowed === true) actorId = actor.id;
          return actor;
        },
        async readCurrent(id, signal) {
          guardActor(id, signal);
          if (!persistence) {
            const client = deps.createPrivilegedClient({ supabaseOrigin: settings.supabaseOrigin!, serviceRoleKey: settings.serviceRoleKey! });
            signal.throwIfAborted();
            if (!client) throw Error("AVATAR_CLIENT_UNCONFIRMED");
            persistence = createClubOwnerAvatarPersistence(client, id);
          }
          return persistence.readCurrent(id, signal);
        },
        async readImmutable(identity, signal) {
          guardActor(identity.actorId, signal);
          if (!persistence) throw Error("AVATAR_PROFILE_UNCONFIRMED");
          reader ??= createClubOwnerAvatarReader({ supabaseOrigin: settings.supabaseOrigin!, serviceRoleKey: settings.serviceRoleKey!, fetchImpl: deps.fetchImpl, resourceScope });
          return reader.readImmutable(identity, signal);
        },
      }, { enabled: true, requestOrigin: settings.requestOrigin });
      if (response.ok && (performance.now() >= expires || request.signal.aborted)) return unavailable("AVATAR_READ_UNAVAILABLE");
      return response;
    } catch { return unavailable("AVATAR_READ_UNAVAILABLE"); }
    finally { if (resourceScope) resources.close(resourceScope); }
  };
}

/** Preparation only: no route, environment reads, credential discovery or default
 * network client. SQL/runtime, private bucket, ingress and Sharp concurrency
 * admission remain deployment gates. Dependency injection cannot attest that a
 * supplied client actually targets its declared origin; future wiring must prove
 * that binding. The real owner-email classifier must be injected server-side.
 * No ensureAccess/profile mutation, notifications, automatic retry or cleanup.
 */
export function createClubOwnerAvatarServer(config: ClubOwnerAvatarServerConfig,
  dependencies: ClubOwnerAvatarServerDependencies & { assertEnvironment?: () => void }): (request: Request) => Promise<Response> {
  const { enabled, requestOrigin, supabaseOrigin, publicSupabaseOrigin, serviceRoleKey } = config;
  const { createSessionClient, createPrivilegedClient, isOwnerEmail, fetchImpl } = dependencies;
  const capturedDependencies = { createSessionClient, createPrivilegedClient, isOwnerEmail, fetchImpl };
  const environmentAssertion = dependencies.assertEnvironment;
  const configured = configuredServer(config, capturedDependencies);
  return async request => {
    if (enabled !== true) return reply(503, "AVATAR_UPLOAD_DISABLED");
    if (!configured) return reply(503, "AVATAR_UPLOAD_UNCONFIGURED");
    const resources = getClubOwnerAvatarResourceAdmission();
    let resourceScope: ClubOwnerAvatarResourceScope | undefined;
    const assertEnvironment = createAvatarEnvironmentGuard(environmentAssertion);
    try {
      assertEnvironment();
      const target = new URL(request.url);
      if (target.origin !== requestOrigin || target.pathname !== "/api/account/avatar" || target.search
        || isTouchlineIsolatedPreviewRequest(request.headers.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) return reply(403, "INVALID_ORIGIN");
      const parsed = parseAvatarUploadRequest(request);
      if (!parsed.ok) return reply(parsed.status, parsed.error);
      if (request.signal.aborted) return reply(408, "UPLOAD_ABORTED");
      const acquired = resources.tryAcquire();
      if (!acquired) return reply(503, "AVATAR_RESOURCE_BUSY");
      resourceScope = acquired;
      // All state below is request-local. A shared factory cannot retain one
      // account's service adapter or auth receipt for another request.
      let authenticatedActor: string | null = null;
      let persistence: ReturnType<typeof createClubOwnerAvatarPersistence> | undefined;
      let storage: ReturnType<typeof createClubOwnerAvatarStorage> | undefined;
      const requireActor = (actor: string, signal: AbortSignal) => {
        assertEnvironment();
        signal.throwIfAborted();
        resources.assertOpen(resourceScope!);
        if (!authenticatedActor || actor !== authenticatedActor || actor !== parsed.accountId) throw Error("AVATAR_ACTOR_UNCONFIRMED");
      };
      const persistent = (actor: string, signal: AbortSignal) => {
        requireActor(actor, signal);
        if (!persistence) {
          const client = createPrivilegedClient({ supabaseOrigin: supabaseOrigin!, serviceRoleKey: serviceRoleKey! });
          assertEnvironment();
          signal.throwIfAborted();
          if (!client) throw Error("AVATAR_CLIENT_UNCONFIRMED");
          persistence = createClubOwnerAvatarPersistence(client, actor);
        }
        return persistence;
      };
      const deps: AvatarRecoveryUploadDependencies = {
        async actor(signal) {
          const actor = await authenticatedCustomer(publicSupabaseOrigin!, capturedDependencies, signal, assertEnvironment);
          // The existing handler returns ACCOUNT_CHANGED for mismatches before
          // decoding/body processing. Never record that account as authorized.
          if (actor?.allowed === true && actor.id === parsed.accountId) authenticatedActor = actor.id;
          return actor;
        },
        async validate(bytes, signal) {
          requireActor(parsed.accountId, signal);
          const result = await validateClubOwnerAvatar(bytes, { resourceScope, signal, expiresAt: expires, assertEnvironment });
          assertEnvironment();
          signal.throwIfAborted();
          if (!result.ok && result.error === "resource_unavailable") throw Error("AVATAR_RESOURCE_UNAVAILABLE");
          return result;
        },
        readCurrent: (actor, signal) => persistent(actor, signal).readCurrent(actor, signal),
        beginOperation: (input, signal) => persistent(input.actorId, signal).beginOperation(input, signal),
        publishV2: (input, signal) => persistent(input.actorId, signal).publishV2(input, signal),
        async createImmutable(input, signal) {
          requireActor(input.actorId, signal);
          if (!persistence) throw Error("AVATAR_PROFILE_UNCONFIRMED");
          storage ??= createClubOwnerAvatarStorage({ supabaseOrigin: supabaseOrigin!, serviceRoleKey: serviceRoleKey!, fetchImpl, resourceScope, assertEnvironment });
          return storage.createImmutable(input, signal);
        },
      };
      const expires = performance.now() + AVATAR_UPLOAD_TOTAL_TIMEOUT_MS;
      const response = await handleClubOwnerAvatarUpload(request, deps, { assertEnvironment });
      assertEnvironment();
      // Do not add a successful acknowledgement after the core's final guard
      // if cancellation/deadline intervenes in this wrapper's continuation.
      if (response.ok && (request.signal.aborted || performance.now() >= expires)) return reply(503, "AVATAR_UPLOAD_UNCONFIRMED");
      return response;
    } catch { return reply(503, "AVATAR_UPLOAD_UNAVAILABLE"); }
    finally { if (resourceScope) resources.close(resourceScope); }
  };
}

/** Control lane only: status never mutates; fence requires a separate explicit
 * consent and exact epoch. It neither reads image bytes nor claims readiness.
 * The original auth/SDK work is tracked independently of abort/timeout races. */
export function createClubOwnerAvatarRecoveryServer(config: ClubOwnerAvatarServerConfig & { accountId?: string },
  dependencies: ClubOwnerAvatarServerDependencies & { assertEnvironment?: () => void }): (request: Request) => Promise<Response> {
  const settings = { ...config }, deps = { ...dependencies };
  const configured = configuredServer(settings, deps) && isAvatarAccountId(settings.accountId);
  const response = (status: number, value: unknown) => Response.json(value, { status, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  } });
  const fail = (status = 503) => response(status, { ok: false, state: "unknown", error: "AVATAR_RECOVERY_UNCONFIRMED" });
  return async request => {
    if (settings.enabled !== true || !configured) return fail();
    const pool = getClubOwnerAvatarControlAdmission();
    let scope: ReturnType<typeof pool.tryAcquire> = null, timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, completed = false;
    const cancel = () => { if (reader) void reader.cancel().catch(() => undefined); };
    const controller = new AbortController(), signal = AbortSignal.any([request.signal, controller.signal]);
    const assertEnvironment = createAvatarEnvironmentGuard(deps.assertEnvironment);
    const expires = performance.now() + 8_000;
    const guard = () => { assertEnvironment(); if (performance.now() >= expires) controller.abort(); signal.throwIfAborted(); if (scope) pool.assertOpen(scope); };
    try {
      guard(); const target = new URL(request.url), expected = request.headers.get("x-touchline-expected-account");
      if (request.method !== "POST") return fail(405);
      if (target.origin !== settings.requestOrigin || target.pathname !== "/api/account/avatar/recovery" || target.search
        || request.headers.get("origin") !== target.origin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
        || isTouchlineIsolatedPreviewRequest(request.headers.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) return fail(403);
      if (!isAvatarAccountId(expected) || expected.toLowerCase() !== settings.accountId!.toLowerCase()) return fail(403);
      if (request.headers.get("content-type")?.toLowerCase() !== "application/json" || request.headers.has("content-encoding")) return fail(415);
      const declared = request.headers.get("content-length");
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || BigInt(declared) > BigInt(512))) return fail(413);
      scope = pool.tryAcquire(); if (!scope) return fail();
      timer = setTimeout(() => controller.abort(), 8_000); signal.addEventListener("abort", cancel);
      if (!request.body) return fail(400);
      reader = request.body.getReader(); const bytes = new Uint8Array(512); let used = 0;
      while (true) {
        guard(); const part = await awaitAvatarStep(() => pool.track(scope!, () => reader!.read()), signal); guard();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array) || part.value.length > bytes.length - used) return fail(413);
        bytes.set(part.value, used); used += part.value.length;
      }
      completed = true;
      if (declared !== null && BigInt(declared) !== BigInt(used)) return fail(400);
      let value: unknown; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used))); } catch { return fail(400); }
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail(400);
      const input = value as Record<string, unknown>, keys = Object.keys(input);
      const statusRequest = input.action === "status" && keys.length === 1;
      const fenceRequest = input.action === "fence" && keys.length === 4 && ["action", "generation", "expectedActiveOperationId", "explicitRecoveryConsent"].every(key => Object.hasOwn(input, key))
        && input.explicitRecoveryConsent === true && isAvatarRevision(input.generation)
        && (input.expectedActiveOperationId === null || (isAvatarAccountId(input.expectedActiveOperationId) && input.expectedActiveOperationId === input.expectedActiveOperationId.toLowerCase()));
      if (!statusRequest && !fenceRequest) return fail(400);
      const actor = await awaitAvatarStep(() => pool.track(scope!, () => authenticatedCustomer(settings.publicSupabaseOrigin!, deps, signal, assertEnvironment)), signal); guard();
      if (!actor) return fail(401); if (!actor.allowed) return fail(403);
      if (actor.id !== expected.toLowerCase()) return fail(409);
      const client = deps.createPrivilegedClient({ supabaseOrigin: settings.supabaseOrigin!, serviceRoleKey: settings.serviceRoleKey! }); guard();
      if (!client) return fail();
      const persistence = createClubOwnerAvatarPersistence(client, actor.id, { timeoutMs: 8_000, trackControl: work => {
        guard(); return pool.track(scope!, work);
      } });
      let barrier: AvatarFenceResult | undefined;
      if (fenceRequest) {
        barrier = await awaitAvatarStep(() => persistence.fenceOperation({ actorId: actor.id, generation: input.generation as string,
          expectedActiveOperationId: input.expectedActiveOperationId as string | null }, signal), signal); guard();
      }
      const context = await awaitAvatarStep(() => persistence.readRecoveryContext(signal), signal); guard();
      const result = response(200, { ok: true, state: "observed", context: projectAvatarRecoveryContext(context, true),
        ...(barrier ? { barrierStatus: barrier.status } : {}) });
      guard(); return result;
    } catch { return fail(); }
    finally {
      if (timer !== undefined) clearTimeout(timer); signal.removeEventListener("abort", cancel);
      if (!completed) cancel(); try { reader?.releaseLock(); } catch { /* Cancellation is not awaited. */ }
      if (scope) pool.close(scope);
    }
  };
}
