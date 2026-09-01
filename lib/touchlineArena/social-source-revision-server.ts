import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SOURCE_KEY = /^(fixture-provider|fixture-event|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;

export type TouchlineSocialSourceRevisionCheckpoint = Readonly<{
  clockRevision: number;
  manifest: Readonly<Record<string, number>>;
  checksum: string;
}>;

export async function readTouchlineSocialSourceRevisionCheckpoint(
  sourceKeys: readonly string[],
): Promise<TouchlineSocialSourceRevisionCheckpoint | null> {
  const keys = [...new Set(sourceKeys.map((key) => key.trim()).filter(Boolean))].sort();
  if (keys.length > 128 || keys.some((key) => !SOURCE_KEY.test(key))) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("touchline_social_read_source_revision", {
    p_source_keys: keys,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const payload = data as Record<string, unknown>;
  const clockRevision = Number(payload.clockRevision);
  const checksum = String(payload.checksum ?? "");
  const manifestValue = payload.manifest;
  if (!Number.isSafeInteger(clockRevision) || clockRevision < 0 || !SHA256.test(checksum)
    || !manifestValue || typeof manifestValue !== "object" || Array.isArray(manifestValue)) return null;
  const entries = Object.entries(manifestValue as Record<string, unknown>);
  if (entries.length !== keys.length || entries.length > 128) return null;
  const manifest: Record<string, number> = {};
  for (const [key, value] of entries) {
    const revision = Number(value);
    if (!SOURCE_KEY.test(key) || !keys.includes(key)
      || !Number.isSafeInteger(revision) || revision < 0) return null;
    manifest[key] = revision;
  }
  return Object.freeze({
    clockRevision,
    manifest: Object.freeze(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))),
    checksum,
  });
}
