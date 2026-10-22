/** Bounded JSON stream: a missing Content-Length cannot allocate an unbounded body. */
export async function readClubCommand(request: Request, maxBytes = 2048): Promise<unknown | null> {
  const length = request.headers.get("content-length");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) || request.signal.aborted) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(maxBytes);
  let used = 0, expired = false;
  const cancel = () => { expired = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, 3000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!expired) {
      const { value, done } = await reader.read();
      if (expired) return null;
      if (done) return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used)));
      if (used + value.byteLength > maxBytes) { cancel(); return null; }
      bytes.set(value, used); used += value.byteLength;
    }
  } catch { return null; }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  return null;
}
