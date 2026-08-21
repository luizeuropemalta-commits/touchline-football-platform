/**
 * Sportmonks' stable detailed-position taxonomy.
 *
 * Squad payloads in the active subscription expose `detailed_position_id`
 * even when the optional `detailedPosition` relation name is omitted. These
 * IDs describe provider roles, not TouchLine/player-specific overrides, so a
 * single taxonomy lookup is the authoritative way to retain that exact role.
 */
const SPORTMONKS_DETAILED_POSITION_NAMES = new Map<string, string>([
  ["24", "Goalkeeper"],
  ["148", "Centre Back"],
  ["149", "Defensive Midfield"],
  ["150", "Attacking Midfield"],
  ["151", "Centre Forward"],
  ["152", "Left Wing"],
  ["153", "Central Midfield"],
  ["154", "Right Back"],
  ["155", "Left Back"],
  ["156", "Right Wing"],
  ["157", "Left Midfield"],
  ["158", "Right Midfield"],
  ["163", "Secondary Striker"],
]);

export function sportmonksDetailedPositionName(positionId: string | null | undefined) {
  const normalized = typeof positionId === "string" ? positionId.trim() : "";
  return normalized ? SPORTMONKS_DETAILED_POSITION_NAMES.get(normalized) ?? null : null;
}
