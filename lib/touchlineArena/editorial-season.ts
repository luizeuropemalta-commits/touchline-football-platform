/** Canonical adjacent-year season label, matching the Golden Boot SQL helper.
 * Formatting equivalence never supplies a missing year or changes scope. */
export function canonicalEditorialSeason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})[-/](\d{2}|\d{4})$/.exec(value);
  if (!match || match[0] !== value) return null;
  const start = Number(match[1]);
  if (start < 1000 || start >= 9999) return null;
  const end = String(start + 1);
  if (match[2] !== end && match[2] !== end.slice(-2)) return null;
  return `${match[1]}-${end.slice(-2)}`;
}
