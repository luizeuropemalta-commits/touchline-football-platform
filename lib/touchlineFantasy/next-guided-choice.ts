export type GuidedChoice = { area: "starters"; slot: string } | { area: "reserves" | "outside"; slot: number };

/** Filled slots remain manageable; empty slots must match the current recruitment step. */
export function canChooseGuidedSlot(next: GuidedChoice | null, destination: GuidedChoice, occupied: boolean) {
  return occupied || (next?.area === destination.area && next.slot === destination.slot);
}

/** Next empty recruitment slot. UI follows this sequence; server authority remains separate. */
export function nextGuidedChoice(
  starters: readonly { slot: { id: string; allowedPositions?: readonly string[] }; selection: unknown }[],
  collection: { players: readonly { area: string; slot: number }[] } | null,
): GuidedChoice | null {
  // Follow the owner's learning sequence, not the geometry's drawing order.
  // Position counts still come from the chosen formation; no slots are invented.
  const order = ["goalkeeper", "centre-back", "right-back", "left-back", "defensive-midfield", "midfield", "attacker", "centre-forward"];
  const priority = (entry: typeof starters[number]) => {
    const index = order.indexOf(entry.slot.allowedPositions?.[0] ?? "");
    return index < 0 ? order.length : index;
  };
  const empty = starters.filter(entry => !entry.selection).sort((a, b) => priority(a) - priority(b))[0];
  if (empty) return { area: "starters", slot: empty.slot.id };
  if (!starters.length || !collection) return null;
  for (const [area, count] of [["reserves", 9], ["outside", 15]] as const) {
    for (let slot = 0; slot < count; slot++) {
      if (!collection.players.some(player => player.area === area && player.slot === slot)) return { area, slot };
    }
  }
  return null;
}
