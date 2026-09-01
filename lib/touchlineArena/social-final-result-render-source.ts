import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function semanticFacts(value: unknown): unknown {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  const {
    sourceSnapshotAt: _sourceSnapshotAt,
    capturedAt: _capturedAt,
    ...facts
  } = value as Record<string, unknown>;
  return facts;
}

export function checksumTouchlineFinalResultRenderSource(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(semanticFacts(value))), "utf8")
    .digest("hex")}`;
}
