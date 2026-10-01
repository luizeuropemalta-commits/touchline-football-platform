/** Shares only an outstanding public layout read, never a settled value. */
let inFlight: Promise<unknown | null> | null = null;

export function loadCoachCardLayout(): Promise<unknown | null> {
  if (inFlight) return inFlight;
  const request = (async () => {
    try {
      const response = await fetch("/touchlineArena/card-layouts/coach-card-layout.json", { cache: "no-store" });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  })();
  inFlight = request;
  void request.then(() => { if (inFlight === request) inFlight = null; });
  return request;
}
