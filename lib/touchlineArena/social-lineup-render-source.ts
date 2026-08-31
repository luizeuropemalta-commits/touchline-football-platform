import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Semantic identity of every value consumed by the LINE-UP renderer.
 * Observational timestamps such as capturedAt are intentionally supplied
 * outside this payload so an unchanged official team sheet remains stable.
 */
export function checksumTouchlineCanonicalJson(value: unknown) {
  const canonical = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export const checksumTouchlineSocialLineupRenderSource = checksumTouchlineCanonicalJson;
