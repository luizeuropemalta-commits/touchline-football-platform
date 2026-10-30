import { isPublicOwnerAvatarUrl } from "./clubowner-public-contract.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

type Job = { start: () => void; cancel: () => void };
/** One original request at a time, at most twenty waiting visible images.
 * Aborting rejects the caller promptly, but an active original promise retains
 * its slot until it settles. There is no automatic retry or image cache.
 */
export function createPublicOwnerAvatarQueue() {
  const waiting: Job[] = []; let active = false;
  const drain = () => { if (!active) waiting.shift()?.start(); };
  return Object.freeze({
    run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        if (waiting.length >= 20) { reject(Error("PUBLIC_AVATAR_QUEUE_FULL")); return; }
        let started = false, settled = false;
        const finish = (value: T | undefined, error?: unknown, failed = false) => {
          if (settled) return; settled = true; signal.removeEventListener("abort", job.cancel);
          if (failed) reject(error); else resolve(value as T);
        };
        const job: Job = {
          cancel() { const index = waiting.indexOf(job); if (!started && index >= 0) waiting.splice(index, 1); finish(undefined, signal.reason ?? Error("PUBLIC_AVATAR_ABORTED"), true); },
          start() {
            if (signal.aborted) { job.cancel(); drain(); return; }
            started = true; active = true;
            Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(value => finish(value), error => finish(undefined, error, true)).finally(() => { active = false; drain(); });
          },
        };
        signal.addEventListener("abort", job.cancel, { once: true }); waiting.push(job); drain();
      });
    },
  });
}
const SLOT = Symbol.for("touchline.people.public-avatar.queue.v1");
function queue() {
  const scope = globalThis as typeof globalThis & { [SLOT]?: ReturnType<typeof createPublicOwnerAvatarQueue> };
  scope[SLOT] ??= createPublicOwnerAvatarQueue(); return scope[SLOT]!;
}
export type PublicOwnerAvatarResult = { status: "ready"; blob: Blob } | { status: "not-found" | "unavailable" };
export async function loadPublicOwnerAvatar(url: string, publicId: string, outer: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<PublicOwnerAvatarResult> {
  if (!isPublicOwnerAvatarUrl(url, publicId)) return { status: "unavailable" };
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(outer.reason);
  if (outer.aborted) abort(); else outer.addEventListener("abort", abort, { once: true });
  try {
    return await queue().run(async () => {
      signal.throwIfAborted(); const timer = setTimeout(() => controller.abort(), 15_000);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancel = () => { if (reader) void reader.cancel().catch(() => undefined); };
      try {
        const response = await fetchImpl(url, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal });
        signal.throwIfAborted();
        if (response.status === 404) { void response.body?.cancel().catch(() => undefined); return { status: "not-found" } as const; }
        if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";", 1)[0] !== "image/webp" || !response.body) {
          void response.body?.cancel().catch(() => undefined); return { status: "unavailable" } as const;
        }
        const declared = response.headers.get("content-length");
        if (declared !== null && (!/^\d{1,7}$/.test(declared) || Number(declared) > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES)) {
          void response.body.cancel().catch(() => undefined); return { status: "unavailable" } as const;
        }
        reader = response.body.getReader(); signal.addEventListener("abort", cancel, { once: true });
        const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
        while (true) {
          signal.throwIfAborted(); const part = await reader.read(); signal.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength; if (size > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) throw Error("PUBLIC_AVATAR_TOO_LARGE");
          chunks.push(new Uint8Array(part.value));
        }
        if (size === 0 || (declared !== null && size !== Number(declared))) throw Error("PUBLIC_AVATAR_INCOMPLETE");
        return { status: "ready", blob: new Blob(chunks, { type: "image/webp" }) } as const;
      } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); cancel(); try { reader?.releaseLock(); } catch { /* Cancellation can be pending. */ } }
    }, signal);
  } catch (error) { if (outer.aborted) throw error; return { status: "unavailable" }; }
  finally { outer.removeEventListener("abort", abort); }
}
