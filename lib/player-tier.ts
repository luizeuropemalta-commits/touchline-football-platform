export type TouchlinePlayerTier = "bronze" | "silver" | "gold" | "blue_diamond" | "purple_diamond";

export function parseTouchlineMarketValue(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase().replace(/[, ]/g, "");
  const number = Number.parseFloat(lower.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return null;
  if (lower.includes("bn") || lower.includes("b")) return number * 1_000_000_000;
  if (lower.includes("m")) return number * 1_000_000;
  if (lower.includes("k")) return number * 1_000;
  return number;
}

export function getTouchlinePlayerTier(marketValue?: number | string | null): TouchlinePlayerTier {
  const value = parseTouchlineMarketValue(marketValue) ?? 0;
  if (value >= 200_000_000) return "purple_diamond";
  if (value >= 100_000_000) return "blue_diamond";
  if (value >= 50_000_000) return "gold";
  if (value >= 10_000_000) return "silver";
  return "bronze";
}
