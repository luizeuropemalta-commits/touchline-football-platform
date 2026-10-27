import { parseClubReleaseRecoveryReference } from "./club-release-recovery.ts";
import { clubCommandMatchesAuthority } from "./club-command-authority.ts";

type Dependencies = {
  authenticate: () => Promise<string | null>;
  currentSeason: () => Promise<string | null>;
  read: (owner: string, reference: NonNullable<ReturnType<typeof parseClubReleaseRecoveryReference>>) => Promise<unknown>;
};
/** History observation only: no release gate, wallet mutation or retry callback. */
export async function handleClubReleaseRecovery(request: Request, deps: Dependencies) {
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vary": "Cookie, X-Touchline-Release-Reference" };
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin !== null && origin !== new URL(request.url).origin)
    return fail("INVALID_ORIGIN", 403);
  const raw = request.headers.get("X-Touchline-Release-Reference");
  if (!raw || raw.length > 2048) return fail("INVALID_REQUEST", 400);
  let reference: ReturnType<typeof parseClubReleaseRecoveryReference>;
  try { reference = parseClubReleaseRecoveryReference(JSON.parse(raw)); }
  catch { return fail("INVALID_REQUEST", 400); }
  if (!reference) return fail("INVALID_REQUEST", 400);
  let expired = false;
  const current = () => { if (expired) throw new Error("READ_UNCONFIRMED"); request.signal.throwIfAborted(); };
  let stop: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => { stop = () => { expired = true; reject(new Error("READ_UNCONFIRMED")); }; });
  const timer = setTimeout(() => stop?.(), 8000);
  const abort = () => stop?.();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  try {
    return await Promise.race([interrupted, (async () => {
      current();
      const owner = await deps.authenticate();
      current();
      if (!owner) return fail("AUTH_REQUIRED", 401);
      if (owner !== reference.expectedAccountId) return fail("CLUB_CONTEXT_CHANGED", 409);
      current();
      const season = await deps.currentSeason();
      if (!season) return fail("CLUB_SEASON_UNAVAILABLE", 503);
      if (!clubCommandMatchesAuthority(reference, owner, season)) return fail("CLUB_CONTEXT_CHANGED", 409);
      current();
      const result = await deps.read(owner, reference);
      current();
      return Response.json({ ok: true, result }, { headers });
    })()]);
  } catch { return fail("CLUB_RECOVERY_UNAVAILABLE", 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", abort); }
}
