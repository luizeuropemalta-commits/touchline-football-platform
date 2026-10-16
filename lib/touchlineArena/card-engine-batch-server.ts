import "server-only";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CardEngineResolvedRow } from "./card-engine-editorial-import";
import {
  TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID,
  TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
} from "./public-player-projection";

export type TouchlineCardEngineBatchSourceType = "paste" | "csv" | "single_edit" | "qa_fixture";
export type TouchlineCardEngineBatchAction = "approve" | "publish" | "rollback";

type EngineRpcResult = { data: unknown[] | null; error: { message: string } | null };
type EngineRpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<EngineRpcResult> };

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function rpc(admin: SupabaseClient) {
  return admin as unknown as EngineRpc;
}

function persistedRows(rows: readonly CardEngineResolvedRow[]) {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    raw: row.raw,
    ...(row.playerId ? { playerId: row.playerId } : {}),
    ...(row.providerPlayerId ? { providerPlayerId: row.providerPlayerId } : {}),
    matchStatus: row.matchStatus,
    matchStrategy: row.matchStrategy,
    provider: row.provider,
    proposed: row.proposed,
    errors: row.errors,
  }));
}

/** Creates a reviewable batch only; it never approves or publishes values. */
export async function createTouchlineCardEngineBatch(admin: SupabaseClient, input: Readonly<{
  sourceType: TouchlineCardEngineBatchSourceType;
  sourceFilename?: string | null;
  effectiveSeason: string;
  rows: readonly CardEngineResolvedRow[];
  actorId: string;
  contentIdentity: string;
}>) {
  const contentSha256 = digest(input.contentIdentity);
  const idempotencyKey = digest(`${input.sourceType}:${input.effectiveSeason}:${contentSha256}`);
  const { data, error } = await rpc(admin).rpc("touchline_card_engine_create_batch", {
    p_idempotency_key: idempotencyKey,
    p_content_sha256: contentSha256,
    p_source_type: input.sourceType,
    p_source_filename: input.sourceFilename?.trim() || null,
    p_effective_season: input.effectiveSeason,
    p_rows: persistedRows(input.rows),
    p_actor_id: input.actorId,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "Card Engine batch creation returned no result.");
  return data[0];
}

export async function transitionTouchlineCardEngineBatch(admin: SupabaseClient, input: Readonly<{
  action: TouchlineCardEngineBatchAction;
  batchId: string;
  actorId: string;
}>) {
  const functionName = input.action === "approve"
    ? "touchline_card_engine_approve_batch"
    : input.action === "publish"
      ? "touchline_card_engine_publish_batch"
      : "touchline_card_engine_revert_batch";
  const { data, error } = await rpc(admin).rpc(functionName, {
    p_batch_id: input.batchId,
    p_actor_id: input.actorId,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "Card Engine command returned no result.");
  if (input.action === "publish" || input.action === "rollback") {
    try {
      revalidateTag(
        `touchline-public-projection:${TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID}:${TOUCHLINE_ENGLAND_EFFECTIVE_SEASON}`,
        { expire: 0 },
      );
    } catch {
      // The transaction already committed: never report a failed publication
      // or invite a duplicate write merely because cache expiration failed.
      console.error("TouchLine Card Engine projection cache expiration failed", { batchId: input.batchId });
    }
  }
  return data[0];
}
