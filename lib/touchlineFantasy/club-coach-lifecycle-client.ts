import type { ClubAcquisitionState } from "./club-acquisition.ts";
import type { ClubCommandAuthority } from "./club-command-authority.ts";
import { parseClubCoachLifecycleCommand } from "./club-coach-lifecycle.ts";
import { parseClubCoachLifecycleResponse } from "./club-coach-lifecycle-response.ts";

/** The caller retains original command+before until confirmed; never retries automatically.
 * A successful old receipt does not authorize replacing a newer rendered revision. */
export async function submitClubCoachLifecycle(command: unknown, before: ClubAcquisitionState,
  authority: ClubCommandAuthority, fetcher: typeof fetch = fetch) {
  const parsed = parseClubCoachLifecycleCommand(command);
  if (!parsed) return { status: "invalid" } as const;
  try {
    const response = await fetcher("/api/touchline-fantasy/collection/coach", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...authority, ...parsed }),
    });
    if (!response.ok) {
      const payload = await response.json();
      if (response.status === 503 && payload?.error === "CLUB_COACH_LIFECYCLE_UNAVAILABLE") return { status: "rejected", code: payload.error as string } as const;
      const rejected = ["CLUB_MARKET_CLOSED", "CLUB_COACH_ROUND_LOCKED", "CLUB_STALE_REVISION", "CLUB_COACH_REQUIRED", "CLUB_COACH_NOT_OWNED", "CLUB_COACH_ALREADY_OWNED", "CLUB_COACH_UNAVAILABLE", "CLUB_INSUFFICIENT_BALANCE", "CLUB_ACCESS_REQUIRED", "CLUB_COLLECTION_PAID_PLAN_REQUIRED"];
      if ((response.status === 409 || response.status === 403) && rejected.includes(payload?.error)) return { status: "rejected", code: payload.error as string } as const;
      return { status: "unresolved" } as const;
    }
    const result = parseClubCoachLifecycleResponse(await response.json(), parsed, authority, before);
    return result ? { status: "committed", response: result } as const : { status: "unresolved" } as const;
  } catch { return { status: "unresolved" } as const; }
}

/** Read-only timeout/reload recovery. No second write and no current-state fallback. */
export async function recoverClubCoachLifecycle(command: unknown, before: ClubAcquisitionState,
  authority: ClubCommandAuthority, fetcher: typeof fetch = fetch) {
  const parsed = parseClubCoachLifecycleCommand(command);
  if (!parsed) return { status: "invalid" } as const;
  try {
    const response = await fetcher("/api/touchline-fantasy/collection/coach", {
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { "X-Touchline-Coach-Reference": JSON.stringify({ ...authority, ...parsed }) },
    });
    if (!response.ok) return { status: "unresolved" } as const;
    const payload = await response.json();
    if (payload?.status === "not_observed" && payload?.resolved === false) return { status: "not_observed" } as const;
    if (payload?.status !== "committed" || payload?.resolved !== true) return { status: "unresolved" } as const;
    const result = parseClubCoachLifecycleResponse(payload.response, parsed, authority, before);
    return result ? { status: "committed", response: result } as const : { status: "unresolved" } as const;
  } catch { return { status: "unresolved" } as const; }
}
