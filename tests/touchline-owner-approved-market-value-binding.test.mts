import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindOwnerApprovedMarketValueCandidate,
  type OwnerApprovedMarketValueApplicationCandidate,
  type TouchlineCanonicalMarketValueBinding,
} from "../lib/touchlineArena/owner-approved-market-value-binding.ts";
import {
  OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE,
  ownerApprovedMarketValueBindingBatchRequests,
  prepareOwnerApprovedMarketValueCanonicalBinding,
  type TouchlineCanonicalMarketValueBindingReadRequest,
} from "../lib/touchlineArena/owner-approved-market-value-binding-runner.ts";

const candidateDirectory = new URL(
  "../docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/",
  import.meta.url,
);
const candidate = JSON.parse(readFileSync(new URL("application-manifest.json", candidateDirectory), "utf8")) as OwnerApprovedMarketValueApplicationCandidate;
const coreSource = readFileSync(
  new URL("../lib/touchlineArena/owner-approved-market-value-binding.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../lib/touchlineArena/owner-approved-market-value-binding-server.ts", import.meta.url),
  "utf8",
);
const runnerSource = readFileSync(
  new URL("../lib/touchlineArena/owner-approved-market-value-binding-runner.ts", import.meta.url),
  "utf8",
);

function uuid(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function readyRows() {
  return candidate.rows.filter((row) => row.reconciliation_state === "READY_AFTER_CANONICAL_UUID_BINDING");
}

function bindings(): TouchlineCanonicalMarketValueBinding[] {
  return readyRows().map((row, index) => ({
    providerPlayerId: row.provider_player_id,
    providerTeamId: row.provider_team_id,
    canonicalPlayerId: uuid(index + 1),
    canonicalClubId: uuid(index + 1_000),
    canonicalMembershipId: uuid(index + 2_000),
    canonicalCompetitionId: uuid(9_000),
    playerSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
    clubSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
    membershipSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
    competitionSourceUpdatedAt: "2026-08-10T10:00:00.000Z",
  }));
}

const revision = "a".repeat(64);

function revisionFor(request: TouchlineCanonicalMarketValueBindingReadRequest, character = "a") {
  return `${character}${request.expectedProviderTeamId}`.padEnd(64, character).slice(0, 64);
}

function readyRead(request: TouchlineCanonicalMarketValueBindingReadRequest, character = "a") {
  return {
    status: "ready" as const,
    request,
    sourceRevisionSha256: revisionFor(request, character),
    bindings: bindings().filter((binding) => (
      binding.providerTeamId === request.expectedProviderTeamId
      && request.providerPlayerIds.includes(binding.providerPlayerId)
    )),
    issues: [],
  };
}

test("binds exactly the 533 explicit EUR rows and keeps 5/23/20 outside every write set", () => {
  const manifest = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: bindings(),
    canonicalReadRevisionSha256: revision,
  });

  assert.equal(manifest.status, "review-required");
  assert.equal(manifest.applicationEligible, false);
  assert.equal(manifest.canonicalReadRevisionSha256, revision);
  assert.equal(manifest.rows.length, 533);
  assert.deepEqual(manifest.excluded, {
    pendingValueMissing: 5,
    providerOnlyPending: 23,
    ownerOnlyReview: 20,
    excludedFromEveryWriteSet: true,
  });
  assert.equal(manifest.counts.readyRowsRequested, 533);
  assert.equal(manifest.counts.canonicalRowsBound, 533);
  assert.equal(manifest.counts.blockedRows, 0);
  assert.ok(manifest.rows.every((row) => (
    row.binding_status === "BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION"
    && row.application_eligible === false
    && Number.isSafeInteger(row.market_value_eur)
    && row.market_value_eur >= 0
    && row.currency === "EUR"
  )));
  assert.ok(manifest.rows.every((row) => (
    /^[0-9a-f-]{36}$/i.test(row.canonical_player_id)
    && /^[0-9a-f-]{36}$/i.test(row.canonical_club_id)
    && /^[0-9a-f-]{36}$/i.test(row.canonical_membership_id)
  )));
  assert.equal(manifest.rows.some((row) => /Denner|Mudryk|Eyestone|Mee|Shahar/i.test(row.player_display_name)), false);
  assert.equal(JSON.stringify(manifest).includes("externalPlayerId"), false);
  assert.equal(JSON.stringify(manifest).includes("transfermarkt"), false);
});

test("fails the entire manifest closed on a missing, duplicate or wrong-team canonical binding", () => {
  const baseline = bindings();
  const missing = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: baseline.slice(1),
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(missing.status, "blocked");
  assert.equal(missing.rows.length, 0);
  assert.ok(missing.issues.some((entry) => entry.code === "CANONICAL_BINDING_MISSING"));

  const duplicate = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: [...baseline, { ...baseline[0]! }],
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(duplicate.status, "blocked");
  assert.equal(duplicate.rows.length, 0);
  assert.ok(duplicate.issues.some((entry) => entry.code === "CANONICAL_BINDING_DUPLICATE"));

  const wrongTeam = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: baseline.map((binding, index) => index === 0 ? { ...binding, providerTeamId: "999" } : binding),
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(wrongTeam.status, "blocked");
  assert.equal(wrongTeam.rows.length, 0);
  assert.ok(wrongTeam.issues.some((entry) => entry.code === "CANONICAL_BINDING_MISSING"));
});

test("fails closed when candidate counts, source rows, UUIDs or freshness proof are tampered", () => {
  const malformedCounts = {
    ...candidate,
    counts: { ...candidate.counts, readyAfterCanonicalUuidBinding: 532 },
  };
  const countResult = bindOwnerApprovedMarketValueCandidate({
    candidate: malformedCounts,
    canonicalBindings: bindings(),
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(countResult.status, "blocked");
  assert.ok(countResult.issues.some((entry) => entry.code === "CANDIDATE_CONTRACT_INVALID"));

  const invalidBinding = bindings();
  invalidBinding[0] = { ...invalidBinding[0]!, canonicalMembershipId: "not-a-uuid", membershipSourceUpdatedAt: "" };
  const invalidResult = bindOwnerApprovedMarketValueCandidate({
    candidate,
    canonicalBindings: invalidBinding,
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(invalidResult.status, "blocked");
  assert.equal(invalidResult.rows.length, 0);
  assert.ok(invalidResult.issues.some((entry) => entry.code === "CANONICAL_BINDING_INVALID"));

  const pendingWithValue = {
    ...candidate,
    rows: candidate.rows.map((row) => row.reconciliation_state === "PENDING_VALUE_MISSING"
      ? { ...row, market_value_eur: 1, currency: "EUR" }
      : row),
  };
  const pendingResult = bindOwnerApprovedMarketValueCandidate({
    candidate: pendingWithValue,
    canonicalBindings: bindings(),
    canonicalReadRevisionSha256: revision,
  });
  assert.equal(pendingResult.status, "blocked");
  assert.ok(pendingResult.issues.some((entry) => entry.code === "CANDIDATE_ROW_INVALID"));
});

test("the pure runner performs 19 stable team-local reads twice before returning all 533 bindings", async () => {
  const requests = ownerApprovedMarketValueBindingBatchRequests(candidate);
  assert.equal(requests.length, 19);
  assert.equal(new Set(requests.flatMap((request) => request.providerPlayerIds)).size, 533);
  assert.ok(requests.every((request) => request.providerPlayerIds.length <= OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE));

  const calls: TouchlineCanonicalMarketValueBindingReadRequest[] = [];
  const manifest = await prepareOwnerApprovedMarketValueCanonicalBinding({
    candidate,
    readBatch: async (request) => {
      calls.push(request);
      return readyRead(request);
    },
  });

  assert.equal(calls.length, requests.length * 2);
  assert.equal(manifest.status, "review-required");
  assert.equal(manifest.rows.length, 533);
  assert.equal(manifest.applicationEligible, false);
  assert.deepEqual(manifest.excluded, {
    pendingValueMissing: 5,
    providerOnlyPending: 23,
    ownerOnlyReview: 20,
    excludedFromEveryWriteSet: true,
  });
});

test("the pure runner blocks every row when a second-pass revision changes", async () => {
  const callsByTeam = new Map<string, number>();
  const manifest = await prepareOwnerApprovedMarketValueCanonicalBinding({
    candidate,
    readBatch: async (request) => {
      const count = (callsByTeam.get(request.expectedProviderTeamId) ?? 0) + 1;
      callsByTeam.set(request.expectedProviderTeamId, count);
      return readyRead(request, count === 2 && request.expectedProviderTeamId === "19" ? "b" : "a");
    },
  });

  assert.equal(manifest.status, "blocked");
  assert.equal(manifest.rows.length, 0);
  assert.ok(manifest.issues.some((entry) => /two fresh canonical projection reads/i.test(entry.detail)));
});

test("the pure runner blocks on a failed second pass and on a reader exception without a partial manifest", async () => {
  const requests = ownerApprovedMarketValueBindingBatchRequests(candidate);
  let callCount = 0;
  const blockedSecondPass = await prepareOwnerApprovedMarketValueCanonicalBinding({
    candidate,
    readBatch: async (request) => {
      callCount += 1;
      if (callCount > requests.length) return {
        status: "blocked" as const,
        request,
        sourceRevisionSha256: null,
        bindings: [],
        issues: [{
          code: "CANONICAL_READ_BLOCKED" as const,
          detail: "synthetic read failure",
          providerPlayerId: null,
          providerTeamId: null,
        }],
      };
      return readyRead(request);
    },
  });
  assert.equal(blockedSecondPass.status, "blocked");
  assert.equal(blockedSecondPass.rows.length, 0);
  assert.ok(blockedSecondPass.issues.some((entry) => entry.detail === "synthetic read failure"));

  const thrown = await prepareOwnerApprovedMarketValueCanonicalBinding({
    candidate,
    readBatch: async () => {
      throw new Error("synthetic reader exception");
    },
  });
  assert.equal(thrown.status, "blocked");
  assert.equal(thrown.rows.length, 0);
  assert.ok(thrown.issues.some((entry) => /reader threw/i.test(entry.detail)));
});

test("the server-only facade reads fresh canonical identity tables twice and has no write or provider path", () => {
  assert.match(serverSource, /import "server-only"/);
  assert.match(serverSource, /readTouchlineCanonicalMarketValueBindingBatch/);
  assert.match(serverSource, /prepareWithCanonicalBindingReader/);
  assert.match(runnerSource, /const first = await readAllBatches/);
  assert.match(runnerSource, /const second = await readAllBatches/);
  assert.match(runnerSource, /OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE = 60/);
  for (const table of [
    "football_competitions",
    "football_clubs",
    "football_players",
    "football_squad_members",
  ]) assert.match(serverSource, new RegExp(`from\\("${table}"\\)`));
  for (const forbidden of [
    "football_player_market_values",
    "market-value-import",
    "createFootballDataProvider",
    "providers/sportmonks",
    "fetch(",
    ".insert(",
    ".upsert(",
    ".delete(",
    ".rpc(",
    "revalidate",
    "unstable_cache",
  ]) assert.equal(serverSource.includes(forbidden), false, `forbidden server-only binding capability: ${forbidden}`);
  assert.doesNotMatch(serverSource, /\.from\([^)]*\)\s*\.update\s*\(/);
  assert.equal(coreSource.includes("createAdminClient"), false);
  assert.equal(coreSource.includes("process.env"), false);
  assert.equal(coreSource.includes("fetch("), false);
  for (const forbidden of ["createAdminClient", "process.env", "fetch(", "createFootballDataProvider", "market-value-import"]) {
    assert.equal(runnerSource.includes(forbidden), false, `forbidden pure runner capability: ${forbidden}`);
  }
});
