import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mapSportmonksBallCoordinate,
  mapSportmonksFixtureBallCoordinates,
  sortSportmonksBallCoordinatesChronologically,
} from "../lib/football-data/sportmonks-ball-coordinates.ts";

const providerSource = readFileSync(
  new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url),
  "utf8",
);

test("maps and chronologically sorts the documented Sportmonks ballcoordinates payload", () => {
  const coordinates = mapSportmonksFixtureBallCoordinates({
    id: 19_568_502,
    ballcoordinates: [
      {
        id: 258_909_457,
        fixture_id: 19_568_502,
        period_id: 6_379_940,
        timer: "93:32",
        x: "0.91",
        y: "0.49",
        source_timestamp: "2025-11-25T21:48:32.000Z",
      },
      {
        id: 258_909_446,
        fixture_id: 19_568_502,
        period_id: 6_379_940,
        timer: "92:43",
        x: "0.32",
        y: "0.50",
        source_timestamp: "2025-11-25T21:47:43.000Z",
      },
      {
        id: 258_909_452,
        fixture_id: 19_568_502,
        period_id: 6_379_940,
        timer: "92:49",
        x: "0.32",
        y: "0.50",
        source_timestamp: "2025-11-25T21:47:49.000Z",
      },
    ],
  });

  assert.deepEqual(
    coordinates.map((coordinate) => coordinate.providerId),
    ["258909446", "258909452", "258909457"],
  );
  assert.deepEqual(coordinates[0], {
    id: "sportmonks:258909446",
    providerId: "258909446",
    provider: "sportmonks",
    fixtureId: "19568502",
    periodId: "6379940",
    timer: "92:43",
    x: 0.32,
    y: 0.5,
    sourceTimestamp: "2025-11-25T21:47:43.000Z",
  });
});

test("accepts relation wrappers and preserves official coordinate ranges without clamping", () => {
  const coordinates = mapSportmonksFixtureBallCoordinates({
    id: "77",
    ballCoordinates: {
      data: [
        {
          id: "2",
          period_id: "22",
          timer: "45:01",
          x: "1.01",
          y: "-0.02",
        },
      ],
    },
  });

  assert.equal(coordinates.length, 1);
  assert.equal(coordinates[0].fixtureId, "77");
  assert.equal(coordinates[0].x, 1.01);
  assert.equal(coordinates[0].y, -0.02);
  assert.equal("sourceTimestamp" in coordinates[0], false);
});

test("retains source timestamp when supplied but never fabricates player tracking", () => {
  const coordinate = mapSportmonksBallCoordinate({
    id: 3,
    fixture_id: 77,
    period_id: 22,
    timer: "10:05",
    x: 0.4,
    y: 0.7,
    timestamp: 1_764_100_800,
    player_id: 999,
  });

  assert.equal(coordinate?.sourceTimestamp, "1764100800");
  assert.equal("playerId" in (coordinate ?? {}), false);
  assert.equal("player" in (coordinate ?? {}), false);
});

test("drops malformed coordinates rather than inventing required official fields", () => {
  const fixture = {
    id: "77",
    ballcoordinates: [
      { id: 1, period_id: 2, timer: "bad", x: "0.5", y: "0.5" },
      { id: 2, period_id: 2, timer: "01:00", x: "missing", y: "0.5" },
      { period_id: 2, timer: "01:00", x: "0.5", y: "0.5" },
    ],
  };

  assert.deepEqual(mapSportmonksFixtureBallCoordinates(fixture), []);
});

test("timestamp is a deterministic tie-breaker without mutating the input", () => {
  const later = mapSportmonksBallCoordinate({
    id: 20,
    fixture_id: 77,
    period_id: 22,
    timer: "20:00",
    x: "0.8",
    y: "0.2",
    timestamp: "2025-11-25T20:20:02.000Z",
  });
  const earlier = mapSportmonksBallCoordinate({
    id: 10,
    fixture_id: 77,
    period_id: 22,
    timer: "20:00",
    x: "0.2",
    y: "0.8",
    timestamp: "2025-11-25T20:20:01.000Z",
  });
  assert.ok(later && earlier);

  const input = [later, earlier];
  const sorted = sortSportmonksBallCoordinatesChronologically(input);

  assert.deepEqual(sorted.map((coordinate) => coordinate.providerId), ["10", "20"]);
  assert.deepEqual(input.map((coordinate) => coordinate.providerId), ["20", "10"]);
});

test("provider fetches the fixture with the official ballCoordinates include", () => {
  assert.match(providerSource, /async getFixtureBallCoordinates\(fixtureId: string\)/);
  assert.match(providerSource, /\{ include: "ballCoordinates" \}/);
  assert.match(providerSource, /mapSportmonksFixtureBallCoordinates\(value\.data\?\.data, normalizedFixtureId\)/);
});
