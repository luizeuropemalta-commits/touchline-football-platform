import { TOUCHLINE_SELECTION_FORMATION, TOUCHLINE_SELECTION_SLOTS } from "./touchline-selection.ts";

export type TouchlinePublishedTopElevenSlot = Readonly<{
  id: string;
  label: string;
  x: number;
  y: number;
  playerIds: readonly string[];
}>;

export type TouchlinePublishedTopEleven = Readonly<{
  snapshotId: string;
  roundId: string;
  publishedAt: string;
  slots: readonly TouchlinePublishedTopElevenSlot[];
}>;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

/** Parses only the immutable selection fields needed by the public Top 11. */
export function parseTouchlinePublishedTopEleven(input: {
  snapshotId: unknown;
  roundId: unknown;
  publishedAt: unknown;
  selectionPayload: unknown;
}): TouchlinePublishedTopEleven | null {
  const snapshotId = text(input.snapshotId);
  const roundId = text(input.roundId);
  const publishedAt = text(input.publishedAt);
  const payload = input.selectionPayload;
  if (!snapshotId || !roundId || !publishedAt || !Number.isFinite(Date.parse(publishedAt))
    || !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.sourceSnapshotId !== snapshotId || record.complete !== true || record.formation !== TOUCHLINE_SELECTION_FORMATION || !Array.isArray(record.players) || record.players.length !== TOUCHLINE_SELECTION_SLOTS.length) return null;
  const slots = record.players.map((value): TouchlinePublishedTopElevenSlot | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entry = value as Record<string, unknown>;
    const canonical = TOUCHLINE_SELECTION_SLOTS.find((slot) => slot.id === text(entry.id));
    const player = entry.player;
    if (!canonical || !player || typeof player !== "object" || Array.isArray(player)) return null;
    const playerRecord = player as Record<string, unknown>;
    const ids = [text(playerRecord.playerId), text(playerRecord.providerPlayerId)].filter(Boolean);
    return ids.length ? { id: canonical.id, label: canonical.label, x: canonical.x, y: canonical.y, playerIds: [...new Set(ids)] } : null;
  });
  if (slots.some((slot) => slot === null) || new Set(slots.map((slot) => slot?.id)).size !== TOUCHLINE_SELECTION_SLOTS.length) return null;
  return { snapshotId, roundId, publishedAt, slots: slots as TouchlinePublishedTopElevenSlot[] };
}
