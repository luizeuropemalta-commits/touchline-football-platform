import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindOwnerApprovedMarketValueCandidate,
  type OwnerApprovedMarketValueApplicationCandidate,
  type TouchlineCanonicalMarketValueBinding,
} from "../lib/touchlineArena/owner-approved-market-value-binding.ts";
import {
  OWNER_APPROVED_MARKET_VALUE_APPLICATION_PLAN_TARGETS,
  planOwnerApprovedMarketValueApplication,
} from "../lib/touchlineArena/owner-approved-market-value-application-plan.ts";

const candidateDirectory = new URL(
  "../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/",
  import.meta.url,
);
const candidate = JSON.parse(readFileSync(new URL("application-manifest.json", candidateDirectory), "utf8")) as OwnerApprovedMarketValueApplicationCandidate;
const applicationPlanSource = readFileSync(
  new URL("../lib/touchlineArena/owner-approved-market-value-application-plan.ts", import.meta.url),
  "utf8",
);

function uuid(index: number) {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function bindings(): TouchlineCanonicalMarketValueBinding[] {
  return candidate.rows
    .filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING")
    .map((row, index) => ({
      providerPlayerId: row.provider_player_id,
      providerTeamId: row.provider_team_id,
      canonicalPlayerId: uuid(index + 1),
      canonicalClubId: uuid(Number(row.provider_team_id) + 1_000),
      canonicalMembershipId: uuid(index + 2_000),
      canonicalCompetitionId: uuid(9_000),
      playerSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
      clubSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
      membershipSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
      competitionSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
    }));
}

function boundManifest() {
  return bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: bindings(),
    canonicalReadRevisionSha256: "b".repeat(64),
  });
}

test("plans exactly the 533 explicit EUR values while preserving the 5/23/20 groups outside every write set", () => {
  const plan = planOwnerApprovedMarketValueApplication(boundManifest());

  assert.equal(plan.status, "review-required");
  assert.equal(plan.applicationEligible, false);
  assert.equal(plan.execution, "dry-run-only");
  assert.equal(plan.rows.length, 533);
  assert.equal(plan.counts.plannedValueRows, 533);
  assert.equal(plan.counts.blockedRows, 0);
  assert.deepEqual(plan.excluded, {
    pendingValueMissing: 5,
    providerOnlyPending: 23,
    ownerOnlyReview: 20,
    excludedFromEveryWriteSet: true,
  });
  assert.deepEqual(plan.allowedTargets, OWNER_APPROVED_MARKET_VALUE_APPLICATION_PLAN_TARGETS);
  assert.deepEqual(plan.protectedCanonicalFields, ["card_tier", "card_price", "contract", "club_assignment"]);
  assert.ok(plan.source.applicationPlanFingerprintSha256);
  assert.equal(plan.issues.length, 0);
  assert.ok(plan.rows.every((row) => (
    /^[0-9a-f-]{36}$/i.test(row.canonicalPlayerId)
    && /^[0-9a-f-]{36}$/i.test(row.canonicalMembershipId)
    && row.currency === "EUR"
    && Number.isSafeInteger(row.marketValueEur)
    && row.marketValueEur >= 0
  )));
  assert.equal(JSON.stringify(plan.rows).includes("card"), false);
});

test("fails closed on a blocked binding, a partial 533 set, duplicate membership or changed source data", () => {
  const manifest = boundManifest();
  const blocked = planOwnerApprovedMarketValueApplication({
    ...manifest,
    status: "blocked",
    issues: [{
      code: "CANONICAL_READ_BLOCKED",
      detail: "synthetic blocked read",
      providerPlayerId: null,
      providerTeamId: null,
    }],
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.rows.length, 0);
  assert.equal(blocked.counts.blockedRows, 533);

  const partial = planOwnerApprovedMarketValueApplication({
    ...manifest,
    rows: manifest.rows.slice(1),
    counts: { ...manifest.counts, canonicalRowsBound: 532 },
  });
  assert.equal(partial.status, "blocked");
  assert.equal(partial.rows.length, 0);

  const duplicateMembership = planOwnerApprovedMarketValueApplication({
    ...manifest,
    rows: manifest.rows.map((row, index) => index === 1
      ? { ...row, canonical_membership_id: manifest.rows[0]!.canonical_membership_id }
      : row),
  });
  assert.equal(duplicateMembership.status, "blocked");
  assert.equal(duplicateMembership.rows.length, 0);
  assert.ok(duplicateMembership.issues.some((entry) => entry.code === "BOUND_ROW_DUPLICATE"));

  const changedValue = planOwnerApprovedMarketValueApplication({
    ...manifest,
    rows: manifest.rows.map((row, index) => index === 0 ? { ...row, market_value_eur: -1 } : row),
  });
  assert.equal(changedValue.status, "blocked");
  assert.equal(changedValue.rows.length, 0);
  assert.ok(changedValue.issues.some((entry) => entry.code === "BOUND_ROW_INVALID"));
});

test("is deterministic and has no database, environment, HTTP or mutation capability", () => {
  const first = planOwnerApprovedMarketValueApplication(boundManifest());
  const second = planOwnerApprovedMarketValueApplication({
    ...boundManifest(),
    rows: [...boundManifest().rows].reverse(),
  });
  assert.equal(first.source.applicationPlanFingerprintSha256, second.source.applicationPlanFingerprintSha256);
  for (const forbidden of [
    "createAdminClient",
    "process.env",
    "fetch(",
    "server-only",
    ".from(",
    ".insert(",
    ".upsert(",
    ".delete(",
    ".rpc(",
  ]) assert.equal(applicationPlanSource.includes(forbidden), false, `forbidden application-plan capability: ${forbidden}`);
  assert.doesNotMatch(applicationPlanSource, /\b(?:admin|client|supabase)\s*\.\s*update\s*\(/i);
});
