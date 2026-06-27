import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTdiePlayerIdentity,
  isTdieIdentityFresh,
  TDIE_PLAYER_IDENTITY_VERSION,
  type TdiePlayerIdentity,
  type TdiePlayerIdentityInput,
} from "@/lib/tdie/player-identity";

type MaybeTdieIdentityRow = {
  identity_payload?: unknown;
  source_signature?: string | null;
  artwork_url?: string | null;
  identity_status?: string | null;
  render_mode?: string | null;
  generated_at?: string | null;
  stale_after?: string | null;
};

function isTdiePlayerIdentity(value: unknown): value is TdiePlayerIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<TdiePlayerIdentity>;
  return (
    record.version === TDIE_PLAYER_IDENTITY_VERSION &&
    typeof record.displayName === "string" &&
    typeof record.initials === "string" &&
    typeof record.sourceSignature === "string"
  );
}

function mergeStoredIdentity(row: MaybeTdieIdentityRow): TdiePlayerIdentity | null {
  if (!isTdiePlayerIdentity(row.identity_payload)) return null;
  return {
    ...row.identity_payload,
    artworkUrl: row.artwork_url ?? row.identity_payload.artworkUrl ?? null,
    lastGeneratedAt: row.generated_at ?? row.identity_payload.lastGeneratedAt ?? null,
    staleAfter: row.stale_after ?? row.identity_payload.staleAfter ?? null,
  };
}

export async function loadOrCreateTdiePlayerIdentity(
  admin: SupabaseClient | null | undefined,
  input: TdiePlayerIdentityInput,
): Promise<TdiePlayerIdentity> {
  const fallback = buildTdiePlayerIdentity(input);
  if (!admin) return fallback;

  try {
    const { data } = await admin
      .from("tdie_player_identities")
      .select("identity_payload, source_signature, artwork_url, identity_status, render_mode, generated_at, stale_after")
      .eq("player_source", input.playerSource)
      .eq("player_source_id", input.playerSourceId)
      .eq("tdie_version", TDIE_PLAYER_IDENTITY_VERSION)
      .maybeSingle();

    const stored = data ? mergeStoredIdentity(data as MaybeTdieIdentityRow) : null;
    if (stored && isTdieIdentityFresh(stored, input)) {
      await admin
        .from("tdie_player_identities")
        .update({ last_used_at: new Date().toISOString() })
        .eq("player_source", input.playerSource)
        .eq("player_source_id", input.playerSourceId)
        .eq("tdie_version", TDIE_PLAYER_IDENTITY_VERSION);
      return stored;
    }

    const now = new Date().toISOString();
    await admin.from("tdie_player_identities").upsert(
      {
        player_source: input.playerSource,
        player_source_id: input.playerSourceId,
        provider: input.provider ?? null,
        provider_player_id: input.providerPlayerId ?? null,
        player_name: input.name,
        source_reference_url: input.sourceReferenceUrl ?? null,
        source_photo_url: input.sourcePhotoUrl ?? null,
        tdie_version: TDIE_PLAYER_IDENTITY_VERSION,
        identity_status: fallback.status,
        render_mode: fallback.renderMode,
        artwork_url: fallback.artworkUrl ?? null,
        identity_payload: fallback,
        source_signature: fallback.sourceSignature,
        generated_at: fallback.lastGeneratedAt ?? now,
        last_used_at: now,
        stale_after: fallback.staleAfter ?? null,
      },
      { onConflict: "player_source,player_source_id,tdie_version" },
    );

    return fallback;
  } catch {
    return fallback;
  }
}
