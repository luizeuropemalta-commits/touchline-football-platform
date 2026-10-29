/** Slots remain visible before the first contract; write permissions stay separate. */
export function collectionStructureShown(marketPage: boolean, presentation: boolean, enabled: boolean): boolean {
  return marketPage && (presentation || enabled);
}

/** Start on an available published coach, equally for every plan. */
export function initialCollectionCoachClub(
  coaches: readonly { clubName: string; selectable?: boolean; slot: { cardTier: string } }[],
): string | null {
  return coaches.find(coach => coach.selectable !== false)?.clubName ?? null;
}
