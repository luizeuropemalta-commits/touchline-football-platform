/**
 * Club follows are an account preference, not a page-local visual state.
 * The API persists this list inside the authenticated user's notification
 * preferences so it survives navigation and is available to every device that
 * signs in to the same TouchLine account.
 */
export function normalizeTouchlineClubFollowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[1-9][0-9]{0,19}$/.test(item)))]
    .slice(0, 20)
    .sort((left, right) => Number(left) - Number(right));
}

export function setTouchlineClubFollow(
  current: unknown,
  clubId: string,
  following: boolean,
): string[] {
  const normalizedClubId = clubId.trim();
  if (!/^[1-9][0-9]{0,19}$/.test(normalizedClubId)) return normalizeTouchlineClubFollowIds(current);
  const ids = new Set(normalizeTouchlineClubFollowIds(current));
  if (following) ids.add(normalizedClubId);
  else ids.delete(normalizedClubId);
  return normalizeTouchlineClubFollowIds([...ids]);
}
