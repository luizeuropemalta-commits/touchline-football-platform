import type { TouchlineCoach } from "@/lib/football-data/types";

export const TOUCHLINE_QA_REPRESENTATIVE_FIXTURE_VERSION = "2026-08-15-representative-v1" as const;

/**
 * Synthetic QA identity used only by admin-gated visual fixtures.
 * It is never exported by a public API, persisted as an official football
 * identity, offered for sale or inserted into the canonical coach registry.
 */
export const TOUCHLINE_QA_REPRESENTATIVE_COACH: TouchlineCoach = {
  id: "qa-fixture:coach:representative",
  providerId: "qa-fixture-coach-representative",
  provider: "sportmonks",
  name: "QA Fixture Coach",
  displayName: "QA Fixture Coach",
  nationality: "QA Fixture",
  teamId: "qa-fixture-club",
  source: {
    provider: "sportmonks",
    providerId: "qa-fixture-coach-representative",
    raw: {
      qaFixture: true,
      officialFootballFact: false,
      productionAllowed: false,
      fixtureVersion: TOUCHLINE_QA_REPRESENTATIVE_FIXTURE_VERSION,
    },
  },
};

export const TOUCHLINE_QA_UI_STATES = [
  "loading",
  "empty",
  "success",
  "error",
  "unavailable",
  "pending",
  "stale",
  "unauthorized",
  "forbidden",
  "not-found",
] as const;
