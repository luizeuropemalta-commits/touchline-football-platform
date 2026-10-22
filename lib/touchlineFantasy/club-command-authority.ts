/** Expected context is a guard, never authority to select another owner/season. */
export type ClubCommandAuthority = Readonly<{expectedAccountId: string; expectedSeasonId: string}>;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function parseClubCommandAuthority(value: unknown): {authority: ClubCommandAuthority; command: Record<string, unknown>} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const {expectedAccountId,expectedSeasonId,...command} = value as Record<string,unknown>;
  if (typeof expectedAccountId !== "string" || !uuid.test(expectedAccountId)
    || typeof expectedSeasonId !== "string" || !uuid.test(expectedSeasonId)) return null;
  return {authority:{expectedAccountId,expectedSeasonId},command};
}
export function clubCommandMatchesAuthority(expected: ClubCommandAuthority, accountId: string, seasonId: string) {
  return expected.expectedAccountId === accountId && expected.expectedSeasonId === seasonId;
}
