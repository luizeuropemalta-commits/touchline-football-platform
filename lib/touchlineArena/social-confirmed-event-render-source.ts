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
    firstObservedAt: _firstObservedAt,
    confirmedAt: _confirmedAt,
    ...facts
  } = value as Record<string, unknown>;
  return facts;
}

export function checksumTouchlineConfirmedEventRenderSource(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(semanticFacts(value))), "utf8")
    .digest("hex")}`;
}

export function checksumTouchlineConfirmedEventFact(input: Readonly<{
  fixtureId: string;
  eventId: string;
  eventKind: string;
  result: string | null;
  teamId: string;
  playerId: string;
  minute: number;
  extraMinute: number | null;
}>) {
  return `sha256:${createHash("sha256").update([
    input.fixtureId,
    input.eventId,
    input.eventKind,
    input.result ?? "",
    input.teamId,
    input.playerId,
    String(input.minute),
    input.extraMinute === null ? "" : String(input.extraMinute),
  ].join("|"), "utf8").digest("hex")}`;
}
