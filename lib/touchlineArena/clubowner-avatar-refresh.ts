import { parsePublicOwnerProfile, publicOwnerId } from "./clubowner-public-contract.ts";
import { createPublicOwnerAvatarQueue } from "./clubowner-public-avatar-client.ts";
const queue = createPublicOwnerAvatarQueue();
/** Visible consumers only, serial admission, bounded body, no stored photo data. */
export async function refreshPublicOwnerAvatar(publicId: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!publicOwnerId(publicId)) return null;
  return queue.run(async () => {
    const timeout = AbortSignal.timeout(10_000), combined = AbortSignal.any([signal, timeout]);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancel = () => { void reader?.cancel().catch(() => undefined); };
    try {
      const response = await fetchImpl(`/api/touchline/clubowners/${publicId}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: combined });
      if (response.status === 404) { void response.body?.cancel().catch(() => undefined); return null; }
      if (!response.ok || response.redirected || !response.body || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") { void response.body?.cancel().catch(() => undefined); throw Error("PUBLIC_PHOTO_METADATA_UNAVAILABLE"); }
      reader = response.body.getReader(); combined.addEventListener("abort", cancel, { once: true });
      const decoder = new TextDecoder(); let text = "", size = 0;
      for (;;) {
        combined.throwIfAborted(); const part = await reader.read(); combined.throwIfAborted();
        if (part.done) break;
        size += part.value.byteLength; if (size > 16_384) throw Error("PUBLIC_PHOTO_METADATA_TOO_LARGE");
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      const profile = parsePublicOwnerProfile(JSON.parse(text).profile);
      if (!profile || profile.publicId.toLowerCase() !== publicId.toLowerCase()) throw Error("PUBLIC_PHOTO_METADATA_UNAVAILABLE");
      return profile.avatarUrl ?? null;
    } finally { combined.removeEventListener("abort", cancel); cancel(); }
  }, signal);
}

/** Visibility loss removes queued work and aborts in-flight reads; stale results never commit. */
export function createVisibleOwnerAvatarRefresh<T>(
  isVisible: () => boolean,
  request: (signal: AbortSignal) => Promise<T>,
  accept: (value: T) => void,
  fail: () => void,
) {
  let stopped = false, active: AbortController | null = null;
  const cancel = () => { const previous = active; active = null; previous?.abort(); };
  return {
    refresh() {
      if (stopped) return;
      if (!isVisible()) { cancel(); return; }
      if (active) return;
      const controller = new AbortController(); active = controller;
      void request(controller.signal).then(value => {
        if (!stopped && !controller.signal.aborted && isVisible()) accept(value);
      }).catch(() => {
        if (!stopped && !controller.signal.aborted && isVisible()) fail();
      }).finally(() => { if (active === controller) active = null; });
    },
    dispose() { stopped = true; cancel(); },
  };
}
