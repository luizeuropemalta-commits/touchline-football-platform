import { isOfficialSportmonksFixtureId } from "./fixture-schedule-store";
import type { TouchlineFixture } from "./types";

export type PersistedLiveScoreSnapshot = {
  fixtures: TouchlineFixture[];
  fetchedAt: string;
  storedAt: number;
};

function isFixture(value: unknown): value is TouchlineFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<TouchlineFixture>;
  return typeof fixture.id === "string"
    && fixture.provider === "sportmonks"
    && isOfficialSportmonksFixtureId(fixture.providerId)
    && Boolean(fixture.source && typeof fixture.source === "object")
    && fixture.source?.provider === "sportmonks"
    && fixture.source?.providerId === fixture.providerId;
}

export function parseLiveScoreSnapshot(value: unknown): PersistedLiveScoreSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<PersistedLiveScoreSnapshot>;
  if (!Array.isArray(snapshot.fixtures) || !snapshot.fixtures.every(isFixture)) return null;
  if (typeof snapshot.fetchedAt !== "string" || !Number.isFinite(Date.parse(snapshot.fetchedAt))) return null;
  if (typeof snapshot.storedAt !== "number" || !Number.isFinite(snapshot.storedAt)) return null;
  return snapshot as PersistedLiveScoreSnapshot;
}
