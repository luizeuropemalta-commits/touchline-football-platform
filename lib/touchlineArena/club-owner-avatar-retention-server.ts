import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { createAvatarRetentionListStorage } from "./club-owner-avatar-retention-list-storage.ts";
import { runAvatarRetentionDiscoveryPage } from "./club-owner-avatar-retention-discovery-worker.ts";
import { runAvatarRetentionBatch, type AvatarRetentionRpc } from "./club-owner-avatar-retention-worker.ts";
import { awaitAvatarStep, createAvatarEnvironmentGuard } from "./club-owner-avatar-upload-contract.ts";

type Config = Readonly<{ enabled: boolean; supabaseOrigin: string; serviceRoleKey: string; assertEnvironment: () => void }>;
type Dependencies = Readonly<{ rpc: AvatarRetentionRpc; fetchImpl: typeof fetch }>;
const project = "xgxbwqxjssxxuihuwmgy";
const paths = new Set(["/touchline-avatar-retention", "/functions/v1/touchline-avatar-retention"]);
function keyBoundToQa(key: string) {
  try {
    if (typeof key !== "string" || key.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
    const claims: unknown = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return false;
    const values = claims as Record<string, unknown>;
    return values.ref === project && values.role === "service_role";
  } catch { return false; }
}
/** LOCAL composition only, not a deployed route or scheduler. JWT payload checks
 * bind configured credentials; they do NOT authenticate caller-supplied claims.
 * Caller authentication is exact constant-time comparison with the captured key.
 * One instance must be shared by its future host; no distributed admission claim.
 */
export function createAvatarRetentionServer(config: Config, deps: Dependencies): (request: Request) => Promise<Response> {
  const { enabled, supabaseOrigin, serviceRoleKey } = config;
  const { rpc: rawRpc, fetchImpl: rawFetch } = deps;
  const configured = supabaseOrigin === `https://${project}.supabase.co` && keyBoundToQa(serviceRoleKey)
    && typeof config.assertEnvironment === "function" && typeof rawRpc === "function" && typeof rawFetch === "function";
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment);
  const expectedAuthorization = Buffer.from(`Bearer ${serviceRoleKey}`);
  let occupied = false, handlerFinished = true, pending = 0;
  const release = () => { if (handlerFinished && pending === 0) occupied = false; };
  const track = async <T>(work: () => PromiseLike<T>): Promise<T> => {
    pending++;
    try { return await work(); } finally { pending--; release(); }
  };
  const rpc: AvatarRetentionRpc = (name, args, signal) => track(() => rawRpc(name, args, signal));
  const fetchImpl: typeof fetch = (input, init) => track(() => rawFetch(input, init));
  // One list factory is retained for the whole handler lifetime, including late
  // original fetch/body work after a caller has abandoned its timeout race.
  const storage = configured ? createAvatarRetentionListStorage({ supabaseOrigin, serviceRoleKey, assertEnvironment, fetchImpl }) : null;
  const response = (status: number, data: object = { status: "unavailable" }) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
  return async request => {
    if (enabled !== true || !configured || !storage) return response(503);
    let url: URL;
    try { url = new URL(request.url); } catch { return response(400); }
    if (!paths.has(url.pathname)) return response(404);
    if (request.method !== "POST") return response(405);
    if (url.search || url.hash || request.headers.has("transfer-encoding")
      || (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return response(400);
    const authorization = request.headers.get("authorization");
    if (request.headers.has("origin") || authorization === null || authorization.length > 4103) return response(401);
    const actualAuthorization = Buffer.from(authorization);
    if (actualAuthorization.length !== expectedAuthorization.length || !timingSafeEqual(actualAuthorization, expectedAuthorization)) return response(401);
    // Deno HTTP exposes a stream even for a bodyless POST. Prove EOF rather
    // than assuming non-null means data; authenticate before reading anything.
    if (request.body) {
      const reader = request.body.getReader();
      const controller = new AbortController();
      const bodySignal = AbortSignal.any([request.signal, controller.signal]);
      const bodyTimer = setTimeout(() => controller.abort(), 1000);
      try {
        let eof = false;
        for (let reads = 0; reads < 8; reads++) {
          const part = await awaitAvatarStep(() => reader.read(), bodySignal);
          if (part.done) { eof = true; break; }
          if (!(part.value instanceof Uint8Array) || part.value.byteLength !== 0) return response(400);
        }
        if (!eof) return response(400);
      } catch { return response(400); }
      finally {
        clearTimeout(bodyTimer);
        void reader.cancel().catch(() => undefined);
        try { reader.releaseLock(); } catch { /* A pending read may still own it. */ }
      }
    }
    if (occupied) return response(503);
    occupied = true; handlerFinished = false;
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 85_000);
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    const guard = () => { assertEnvironment(); signal.throwIfAborted(); };
    try {
      guard();
      const discovery = await runAvatarRetentionDiscoveryPage({ supabaseOrigin, assertEnvironment, rpc, listPage: storage.listPage }, signal);
      guard();
      if (discovery.status !== "processed") return response(503);
      const cleanup = await runAvatarRetentionBatch({ supabaseOrigin, serviceRoleKey, assertEnvironment, rpc, fetchImpl }, signal);
      guard();
      if (cleanup.status !== "processed" || cleanup.unknown !== 0) return response(503);
      return response(200, { status: "processed", discovery: { listed: discovery.listed, registered: discovery.registered, denied: discovery.denied, skipped: discovery.skipped },
        cleanup: { inspected: cleanup.inspected, accepted: cleanup.accepted, denied: cleanup.denied, unknown: cleanup.unknown } });
    } catch { return response(503); }
    finally { clearTimeout(timer); handlerFinished = true; release(); }
  };
}
