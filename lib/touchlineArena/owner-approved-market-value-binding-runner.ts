import { createHash } from "node:crypto";

import {
  bindOwnerApprovedMarketValueCandidate,
  type OwnerApprovedMarketValueApplicationCandidate,
  type OwnerApprovedMarketValueBindingIssue,
  type OwnerApprovedMarketValueBindingManifest,
  type TouchlineCanonicalMarketValueBinding,
} from "./owner-approved-market-value-binding.ts";

export const OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE = 60;

export type TouchlineCanonicalMarketValueBindingReadRequest = Readonly<{
  providerPlayerIds: readonly string[];
  expectedProviderTeamId: string;
}>;

export type TouchlineCanonicalMarketValueBindingRead = Readonly<{
  status: "ready" | "blocked";
  request: TouchlineCanonicalMarketValueBindingReadRequest;
  sourceRevisionSha256: string | null;
  bindings: readonly TouchlineCanonicalMarketValueBinding[];
  issues: readonly OwnerApprovedMarketValueBindingIssue[];
}>;

export type TouchlineCanonicalMarketValueBindingBatchReader = (
  request: TouchlineCanonicalMarketValueBindingReadRequest,
) => Promise<TouchlineCanonicalMarketValueBindingRead>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [
    key,
    stableValue((value as Record<string, unknown>)[key]),
  ]));
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex");
}

function issue(detail: string): OwnerApprovedMarketValueBindingIssue {
  return Object.freeze({
    code: "CANONICAL_READ_BLOCKED",
    detail,
    providerPlayerId: null,
    providerTeamId: null,
  });
}

function requestsMatch(
  left: TouchlineCanonicalMarketValueBindingReadRequest,
  right: TouchlineCanonicalMarketValueBindingReadRequest,
) {
  return left.expectedProviderTeamId === right.expectedProviderTeamId
    && left.providerPlayerIds.length === right.providerPlayerIds.length
    && left.providerPlayerIds.every((providerPlayerId, index) => providerPlayerId === right.providerPlayerIds[index]);
}

function readContractIssues(
  read: TouchlineCanonicalMarketValueBindingRead,
  request: TouchlineCanonicalMarketValueBindingReadRequest,
) {
  const issues: OwnerApprovedMarketValueBindingIssue[] = [];
  if (!requestsMatch(read.request, request)) {
    issues.push(issue("The canonical reader did not echo the requested provider team/player batch."));
  }
  if (read.status === "ready") {
    if (!SHA256_PATTERN.test(text(read.sourceRevisionSha256))) {
      issues.push(issue("A ready canonical read must carry a SHA-256 revision fingerprint."));
    }
    if (!Array.isArray(read.bindings) || read.issues.length > 0) {
      issues.push(issue("A ready canonical read cannot contain issues or a non-array binding payload."));
    }
  } else if (read.sourceRevisionSha256 !== null || read.bindings.length > 0 || !read.issues.length) {
    issues.push(issue("A blocked canonical read must return no revision, bindings or silent failure."));
  }
  return issues;
}

function chunks<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push([...items.slice(index, index + size)]);
  return result;
}

/** Splits only the explicit-EUR candidate rows into stable team-local reads. */
export function ownerApprovedMarketValueBindingBatchRequests(
  candidate: OwnerApprovedMarketValueApplicationCandidate,
): readonly TouchlineCanonicalMarketValueBindingReadRequest[] {
  const byTeam = new Map<string, string[]>();
  for (const row of candidate.rows) {
    if (row.reconciliation_state !== "READY_AFTER_CANONICAL_UUID_BINDING") continue;
    const providerTeamId = text(row.provider_team_id);
    const providerPlayerId = text(row.provider_player_id);
    byTeam.set(providerTeamId, [...(byTeam.get(providerTeamId) ?? []), providerPlayerId]);
  }
  return Object.freeze([...byTeam.entries()]
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([expectedProviderTeamId, providerPlayerIds]) => chunks(
      [...new Set(providerPlayerIds)].sort((left, right) => Number(left) - Number(right)),
      OWNER_APPROVED_MARKET_VALUE_BINDING_BATCH_SIZE,
    ).map((ids) => Object.freeze({
      providerPlayerIds: Object.freeze(ids),
      expectedProviderTeamId,
    }))));
}

async function readAllBatches(
  requests: readonly TouchlineCanonicalMarketValueBindingReadRequest[],
  readBatch: TouchlineCanonicalMarketValueBindingBatchReader,
) {
  try {
    return await Promise.all(requests.map((request) => readBatch(request)));
  } catch {
    return requests.map((request) => Object.freeze({
      status: "blocked" as const,
      request,
      sourceRevisionSha256: null,
      bindings: Object.freeze([]),
      issues: Object.freeze([issue("The canonical reader threw before returning a complete batch.")]),
    }));
  }
}

function combinedRevision(reads: readonly TouchlineCanonicalMarketValueBindingRead[]) {
  return sha256(reads.map((read) => ({
    expectedProviderTeamId: read.request.expectedProviderTeamId,
    providerPlayerIds: read.request.providerPlayerIds,
    sourceRevisionSha256: read.sourceRevisionSha256,
  })));
}

export function touchlineCanonicalMarketValueBindingRevision(
  bindings: readonly TouchlineCanonicalMarketValueBinding[],
) {
  return sha256([...bindings].sort((left, right) => (
    `${left.providerTeamId}:${left.providerPlayerId}`.localeCompare(`${right.providerTeamId}:${right.providerPlayerId}`)
  )));
}

/**
 * Pure two-pass orchestration for a caller-provided canonical reader.
 * It cannot access a database or a provider, and never produces a partial
 * manifest: any blocked read or changed revision blocks all 533 rows.
 */
export async function prepareOwnerApprovedMarketValueCanonicalBinding(
  input: Readonly<{
    candidate: OwnerApprovedMarketValueApplicationCandidate;
    readBatch: TouchlineCanonicalMarketValueBindingBatchReader;
  }>,
): Promise<OwnerApprovedMarketValueBindingManifest> {
  const requests = ownerApprovedMarketValueBindingBatchRequests(input.candidate);
  const first = await readAllBatches(requests, input.readBatch);
  const firstIssues = first.flatMap((read, index) => [
    ...(read.status === "blocked" ? read.issues : []),
    ...readContractIssues(read, requests[index]!),
  ]);
  if (firstIssues.length) {
    return bindOwnerApprovedMarketValueCandidate({
      candidate: input.candidate,
      canonicalBindings: [],
      canonicalReadRevisionSha256: "",
      preflightIssues: firstIssues,
    });
  }
  const second = await readAllBatches(requests, input.readBatch);
  const secondIssues = second.flatMap((read, index) => [
    ...(read.status === "blocked" ? read.issues : []),
    ...readContractIssues(read, requests[index]!),
  ]);
  const revisionChanged = first.some((read, index) => read.sourceRevisionSha256 !== second[index]?.sourceRevisionSha256);
  if (secondIssues.length || revisionChanged) {
    return bindOwnerApprovedMarketValueCandidate({
      candidate: input.candidate,
      canonicalBindings: [],
      canonicalReadRevisionSha256: "",
      preflightIssues: [
        ...secondIssues,
        ...(revisionChanged ? [issue("The two fresh canonical projection reads did not have the same revision fingerprint.")] : []),
      ],
    });
  }
  return bindOwnerApprovedMarketValueCandidate({
    candidate: input.candidate,
    canonicalBindings: first.flatMap((read) => read.bindings),
    canonicalReadRevisionSha256: combinedRevision(first),
  });
}
