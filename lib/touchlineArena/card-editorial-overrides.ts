import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type TouchlineCardEditorialOverride = Readonly<{
  playerId: string;
  displayName: string | null;
  shirtNumber: number | null;
  countryCode3: string | null;
  position: string | null;
}>;

type OverrideRow = {
  player_id: string;
  field_key: "displayName" | "shirtNumber" | "countryCode3" | "position" | string;
  touchline_override: unknown;
  status: string;
};

const OVERRIDE_LOOKUP_CHUNK_SIZE = 200;

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonText(value: unknown) {
  if (typeof value === "string") return cleanText(value);
  if (value && typeof value === "object" && !Array.isArray(value)) return cleanText((value as Record<string, unknown>).value);
  return null;
}

function jsonInteger(value: unknown) {
  const candidate = typeof value === "number" ? value : Number(jsonText(value));
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

/**
 * Overrides are editorial-only and intentionally live in a separate table.
 * A Sportmonks sync therefore has no write path that can erase them.
 */
export async function loadTouchlineCardEditorialOverrides(
  playerIds: readonly string[],
  admin = createAdminClient(),
) {
  const ids = [...new Set(playerIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (!admin || !ids.length) return new Map<string, TouchlineCardEditorialOverride>();
  const rows: OverrideRow[] = [];
  for (let offset = 0; offset < ids.length; offset += OVERRIDE_LOOKUP_CHUNK_SIZE) {
    const { data, error } = await admin
      .from("touchline_card_editorial_overrides")
      .select("player_id,field_key,touchline_override,status")
      .in("player_id", ids.slice(offset, offset + OVERRIDE_LOOKUP_CHUNK_SIZE))
      .returns<OverrideRow[]>();
    if (error || !data) return new Map<string, TouchlineCardEditorialOverride>();
    rows.push(...data);
  }
  // A deployment may briefly arrive before the QA migration. Failing closed
  // to the provider values is safe; it never invents or exposes an override.
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const playerId = cleanText(row.player_id)?.toLowerCase();
    if (!playerId || row.status !== "approved") continue;
    grouped.set(playerId, { ...(grouped.get(playerId) ?? {}), [row.field_key]: row.touchline_override });
  }
  return new Map([...grouped.entries()].map(([playerId, fields]) => {
    return [playerId, Object.freeze({
      playerId,
      displayName: jsonText(fields.displayName),
      shirtNumber: jsonInteger(fields.shirtNumber),
      countryCode3: jsonText(fields.countryCode3)?.toUpperCase() ?? null,
      position: jsonText(fields.position),
    })] as const;
  }));
}
