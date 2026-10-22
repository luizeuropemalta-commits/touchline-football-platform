class ClubCollectionRequestError extends Error {
  readonly responseStatus: number | undefined;
  constructor(message: string, responseStatus?: number) {
    super(message);
    this.name = "ClubCollectionRequestError";
    this.responseStatus = responseStatus;
  }
}

/** A timeout is an unknown outcome, never proof that a purchase failed on the server. */
export async function requestClubCollection(path: string, options: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  let responseStatus: number | undefined;
  let rejectAbort: ((reason: Error) => void) | undefined;
  const abort = () => {
    controller.abort();
    rejectAbort?.(new ClubCollectionRequestError("CLUB_REQUEST_UNCONFIRMED", responseStatus));
  };
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  if (options.signal?.aborted) abort();
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(path, { ...options, signal: controller.signal });
        responseStatus = response.status;
        const payload = await response.json();
        return { response, payload };
      })(),
      interrupted,
    ]);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ClubCollectionRequestError("CLUB_REQUEST_TRANSPORT_FAILED", responseStatus);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

/** One bounded recovery for a read, never a mutation. Cold local compilation can
 * outlast the first deadline; HTTP/auth/data errors still fail without retries. */
export async function readClubCollection(signal?: AbortSignal, timeoutMs = 20_000) {
  const read = () => requestClubCollection("/api/touchline-fantasy/collection/read", { method: "GET", cache: "no-store", signal }, timeoutMs);
  try { return await read(); }
  catch (error) {
    const transient = error instanceof ClubCollectionRequestError && error.responseStatus === undefined &&
      (error.message === "CLUB_REQUEST_TRANSPORT_FAILED" || error.message === "CLUB_REQUEST_UNCONFIRMED");
    if (signal?.aborted || !transient) throw error;
    return read();
  }
}
