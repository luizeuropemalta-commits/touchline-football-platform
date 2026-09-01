import { createHash } from "node:crypto";

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => [key, canonicalise(entry)]));
  }
  return value;
}

function semanticSource(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  const {
    sourceSnapshotAt: _sourceSnapshotAt,
    firstObservedAt: _firstObservedAt,
    generatedAt: _generatedAt,
    ...facts
  } = value as Record<string, unknown>;
  return facts;
}

export function checksumTouchlineRankingFamilyRenderSource(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalise(semanticSource(value))), "utf8")
    .digest("hex")}`;
}
