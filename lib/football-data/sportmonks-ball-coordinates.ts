import { asString, providerId } from "./http.ts";
import type { TouchlineBallCoordinate } from "./types.ts";

type SportmonksBallCoordinateEntity = Record<string, unknown>;

function relationItems(value: unknown): SportmonksBallCoordinateEntity[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is SportmonksBallCoordinateEntity =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (!value || typeof value !== "object") return [];

  const data = (value as SportmonksBallCoordinateEntity).data;
  return Array.isArray(data)
    ? data.filter(
        (item): item is SportmonksBallCoordinateEntity =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function timerSeconds(timer: string) {
  const match = /^(\d+):(\d{1,2})$/.exec(timer);
  if (!match) return undefined;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) {
    return undefined;
  }

  return minutes * 60 + seconds;
}

function coordinateNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sourceTimestamp(raw: SportmonksBallCoordinateEntity) {
  return (
    asString(raw.source_timestamp) ??
    asString(raw.timestamp) ??
    asString(raw.created_at) ??
    asString(raw.updated_at)
  );
}

function comparableSourceTimestamp(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 0 && numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Maps one documented Sportmonks BallCoordinate. The provider does not attach
 * player identity to this feed, so this domain object intentionally contains
 * only ball-tracking fields. Provider timestamps are retained when present but
 * are never synthesized from the fixture kickoff or relative match timer.
 */
export function mapSportmonksBallCoordinate(
  raw: SportmonksBallCoordinateEntity,
  fallbackFixtureId?: string,
): TouchlineBallCoordinate | null {
  const coordinateId = asString(raw.id);
  const fixtureId = asString(raw.fixture_id) ?? fallbackFixtureId;
  const periodId = asString(raw.period_id);
  const timer = asString(raw.timer);
  const x = coordinateNumber(raw.x);
  const y = coordinateNumber(raw.y);

  if (
    !coordinateId ||
    !fixtureId ||
    !periodId ||
    !timer ||
    timerSeconds(timer) === undefined ||
    x === undefined ||
    y === undefined
  ) {
    return null;
  }

  const timestamp = sourceTimestamp(raw);

  return {
    id: providerId("sportmonks", coordinateId),
    providerId: coordinateId,
    provider: "sportmonks",
    fixtureId,
    periodId,
    timer,
    x,
    y,
    ...(timestamp ? { sourceTimestamp: timestamp } : {}),
  };
}

/** Sorts by Sportmonks' continuous MM:SS match timer without mutating input. */
export function sortSportmonksBallCoordinatesChronologically(
  coordinates: readonly TouchlineBallCoordinate[],
) {
  return [...coordinates].sort((left, right) => {
    const elapsedDifference =
      (timerSeconds(left.timer) ?? Number.POSITIVE_INFINITY) -
      (timerSeconds(right.timer) ?? Number.POSITIVE_INFINITY);
    if (elapsedDifference !== 0) return elapsedDifference;

    const leftTimestamp = comparableSourceTimestamp(left.sourceTimestamp);
    const rightTimestamp = comparableSourceTimestamp(right.sourceTimestamp);
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp < rightTimestamp ? -1 : 1;
    }

    return left.providerId.localeCompare(right.providerId, "en", { numeric: true });
  });
}

/**
 * Extracts the lowercase response key used by Sportmonks while accepting the
 * include's camel-case spelling for compatibility with recorded fixtures.
 */
export function mapSportmonksFixtureBallCoordinates(
  fixture: SportmonksBallCoordinateEntity | undefined,
  fallbackFixtureId?: string,
) {
  if (!fixture) return [];

  const fixtureId = asString(fixture.id) ?? fallbackFixtureId;
  const relation = fixture.ballcoordinates ?? fixture.ballCoordinates;
  const coordinates = relationItems(relation).flatMap((item) => {
    const coordinate = mapSportmonksBallCoordinate(item, fixtureId);
    return coordinate ? [coordinate] : [];
  });

  return sortSportmonksBallCoordinatesChronologically(coordinates);
}
