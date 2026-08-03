import assert from "node:assert/strict";
import test from "node:test";
import { resolveOfficialShirtNumber } from "../lib/football-data/official-shirt-numbers.ts";

test("provider shirt number remains authoritative", () => {
  assert.deepEqual(resolveOfficialShirtNumber({
    providerId: "37567285",
    clubTeamId: "51",
    providerValues: [27],
  }), {
    shirtNumber: 27,
    source: "provider",
    verifiedAt: null,
    sourceUrl: null,
  });
});

test("club-verified fallback fills Matheus Franca and Owen Goodman", () => {
  const matheus = resolveOfficialShirtNumber({ providerId: "37567285", clubTeamId: "51" });
  const goodman = resolveOfficialShirtNumber({ providerId: "37537859", clubTeamId: "51" });

  assert.equal(matheus.shirtNumber, 11);
  assert.equal(matheus.source, "club-verified");
  assert.equal(goodman.shirtNumber, 63);
  assert.equal(goodman.source, "club-verified");
});

test("unknown missing number stays unassigned instead of inventing a shirt", () => {
  assert.deepEqual(resolveOfficialShirtNumber({ providerId: "unknown", clubTeamId: "51" }), {
    shirtNumber: null,
    source: "unassigned",
    verifiedAt: null,
    sourceUrl: null,
  });
});

test("last verified database number survives a temporary provider omission", () => {
  assert.deepEqual(resolveOfficialShirtNumber({
    providerId: "12345",
    clubTeamId: "51",
    providerValues: [null],
    cachedValues: [20],
    cachedVerifiedAt: "2026-07-24T08:00:00.000Z",
  }), {
    shirtNumber: 20,
    source: "verified-cache",
    verifiedAt: "2026-07-24T08:00:00.000Z",
    sourceUrl: null,
  });
});

test("a new provider number replaces the database fallback", () => {
  assert.equal(resolveOfficialShirtNumber({
    providerId: "12345",
    clubTeamId: "51",
    providerValues: [21],
    cachedValues: [20],
  }).shirtNumber, 21);
});
