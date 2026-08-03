export function parseSportmonksStatisticValue(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ["total", "count", "value", "average", "percentage"]) {
    const nested = parseSportmonksStatisticValue(record[key]);
    if (nested !== undefined) return nested;
  }

  return undefined;
}
