import type { AvatarRetentionTarget } from "./club-owner-avatar-retention-target.ts";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { avatarRetentionConfigurationFailure } from "./club-owner-avatar-retention-configuration.ts";

/** Trigger-only adapter for pg_net's mandatory JSON body. The privileged worker
 * remains bodyless and keeps its existing authentication and retention policy. */
export function createAvatarRetentionScheduler(config: {
  target?: AvatarRetentionTarget;
  enabled: boolean;
  supabaseOrigin: string;
  serviceRoleKey: string;
  triggerSecret: string;
  assertEnvironment(): void;
}, fetchImpl: typeof fetch = fetch) {
  config = { ...config }; // Capture authority; caller mutation cannot retarget a live handler.
  const reply = (status: number) => Response.json({ status: status === 200 ? "processed" : "unavailable" }, { status, headers: { "cache-control": "no-store" } });
  let occupied = false;
  return async (request: Request): Promise<Response> => {
    try {
      config.assertEnvironment();
      if (!config.enabled || avatarRetentionConfigurationFailure(config.supabaseOrigin, config.serviceRoleKey, config.target) || !/^[A-Za-z0-9_-]{43,128}$/.test(config.triggerSecret)) return reply(503);
      const url = new URL(request.url);
      if (!["/touchline-avatar-retention-scheduler", "/functions/v1/touchline-avatar-retention-scheduler"].includes(url.pathname)) return reply(404);
      if (request.method !== "POST") return reply(405);
      const supplied = request.headers.get("x-touchline-avatar-retention-secret") || "";
      if (request.headers.has("origin") || supplied.length !== config.triggerSecret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(config.triggerSecret))) return reply(401);
      if (url.search || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply(400);
      // pg_net serializes '{}' as JSON. Accept exactly that object, never targets,
      // operation IDs, timestamps, retention overrides or any other caller data.
      const reader = request.body?.getReader();
      if (!reader) return reply(400);
      let bytes = 0, body = "";
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("body deadline")), 1000); });
        for (let reads = 0; ; reads++) {
          if (reads >= 8) return reply(400);
          const chunk = await Promise.race([reader.read(), deadline]);
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 32) return reply(400);
          body += new TextDecoder().decode(chunk.value);
        }
      } finally {
        clearTimeout(timer);
        void reader.cancel().catch(() => {}).finally(() => reader.releaseLock());
      }
      if (!/^\s*\{\s*\}\s*$/.test(body)) return reply(400);
      if (request.signal.aborted || occupied) return reply(503);
      config.assertEnvironment();
      occupied = true;
      try {
        const response = await fetchImpl(`${config.supabaseOrigin}/functions/v1/touchline-avatar-retention`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.serviceRoleKey}` },
          redirect: "error",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        });
        // The worker's HTTP status already represents discovery + cleanup success.
        // Never reflect its payload or upstream diagnostics to the scheduler caller.
        void response.body?.cancel().catch(() => {});
        return reply(response.status === 200 ? 200 : 503);
      } finally { occupied = false; }
    } catch { return reply(503); }
  };
}
