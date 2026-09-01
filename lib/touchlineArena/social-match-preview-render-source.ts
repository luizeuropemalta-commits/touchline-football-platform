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

function semanticRenderSource(value: unknown): unknown {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;

  // These top-level timestamps describe when already-canonical facts were
  // observed. Keep them in the audit payload, but exclude them from the
  // generation identity so a no-op refresh cannot create another draft.
  const {
    sourceSnapshotAt: _sourceSnapshotAt,
    tableAsOf: _tableAsOf,
    ...facts
  } = value as Record<string, unknown>;
  return facts;
}

export function checksumTouchlineMatchPreviewRenderSource(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(semanticRenderSource(value))), "utf8")
    .digest("hex")}`;
}
