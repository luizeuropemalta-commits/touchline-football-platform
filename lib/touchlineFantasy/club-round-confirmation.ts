export type ClubRelatedPlayer = Readonly<{ playerId: string; area: "starters" | "reserves"; slot: number }>;

export function readClubRelatedSnapshot(value: unknown): readonly ClubRelatedPlayer[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: ClubRelatedPlayer[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || typeof entry.playerId !== "string" || !entry.playerId
      || !["starters", "reserves"].includes(entry.area) || !Number.isSafeInteger(entry.slot)
      || entry.slot < 0 || entry.slot >= (entry.area === "starters" ? 11 : 9)) return null;
    result.push({ playerId: entry.playerId, area: entry.area, slot: entry.slot });
  }
  if (new Set(result.map(p=>p.playerId)).size !== result.length
    || new Set(result.map(p=>`${p.area}:${p.slot}`)).size !== result.length) return null;
  return result;
}

export function clubRelatedFingerprint(players: readonly { playerId: string; area: string; slot: number }[]) {
  return JSON.stringify(players.filter(p=>p.area === "starters" || p.area === "reserves")
    .map(p=>[p.area,p.slot,p.playerId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function clubRelatedConfirmed(players: readonly { playerId: string; area: string; slot: number }[], saved: unknown) {
  const related=readClubRelatedSnapshot(saved);
  return related !== null && clubRelatedFingerprint(players) === clubRelatedFingerprint(related);
}
