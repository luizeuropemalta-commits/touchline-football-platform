import type { ClubCollectionReadResult } from "./club-collection-read-server";
import { inspectClubAcquisition } from "./club-acquisition.ts";
import { clubCommandMatchesAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { parseClubInitialBudget } from "./club-initial-budget.ts";

/** Validate serialized SSR data identically before either header or hook consumes it. */
export function confirmedCollectionBootstrap(value: ClubCollectionReadResult | null | undefined, authority: ClubCommandAuthority | null) {
  if (!value || value.status !== "confirmed" || !authority || !clubCommandMatchesAuthority(authority, value.accountId, value.seasonId)) return null;
  try {
    if (value.state !== null) {
      inspectClubAcquisition(value.state);
      if (value.state.seasonId !== value.seasonId) return null;
      return { ...value, initialBudget: null };
    }
    const initialBudget = parseClubInitialBudget(value.initialBudget);
    return initialBudget ? { ...value, initialBudget } : null;
  } catch { return null; }
}
