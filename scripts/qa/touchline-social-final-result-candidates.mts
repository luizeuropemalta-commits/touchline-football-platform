import type { SupabaseClient } from "@supabase/supabase-js";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_KEY = /^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;
const COMPETITION_PROVIDER_ID = "8";
const RECENT_WINDOW_MS = 36 * 60 * 60 * 1000;
const SOURCE_READ_TIMEOUT_MS = 45_000;
const FINISHED = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties)/i;

export type TouchlineSocialFinalResultContentType = "FULL_TIME" | "FINAL_SCORE";
export type TouchlineSocialFinalResultCandidate = Readonly<{
  contentType: TouchlineSocialFinalResultContentType;
  fixtureId: string;
  teamId: null;
  firstObservedAt: string;
  startsAt: string;
  inputChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
}>;

function parseSourceRevision(payload: Record<string, unknown>) {
  const checksum = String(payload.sourceRevisionChecksum ?? "");
  const value = payload.sourceRevisionManifest;
  if (!SHA256.test(checksum) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const manifest: Record<string, number> = {};
  for (const [key, rawRevision] of Object.entries(value as Record<string, unknown>)) {
    const revision = Number(rawRevision);
    if (!SOURCE_KEY.test(key) || !Number.isSafeInteger(revision) || revision < 0) return null;
    manifest[key] = revision;
  }
  if (Object.keys(manifest).length < 1 || Object.keys(manifest).length > 128) return null;
  return { sourceRevisionManifest: Object.freeze(manifest), sourceRevisionChecksum: checksum } as const;
}

export async function readCurrentTouchlineFinalResultSource(input: Readonly<{
  base: URL;
  renderSecret: string;
  fixtureId: string;
  contentType: TouchlineSocialFinalResultContentType;
}>) {
  const url = new URL("/api/admin/social-publications/source", input.base);
  url.searchParams.set("contentType", input.contentType);
  url.searchParams.set("fixtureId", input.fixtureId);
  const response = await fetch(url, {
    method: "GET",
    headers: { cookie: `tl-social-render=${encodeURIComponent(input.renderSecret)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const revision = payload ? parseSourceRevision(payload) : null;
  const startsAt = String(payload?.startsAt ?? "");
  const sourceSnapshotAt = String(payload?.sourceSnapshotAt ?? "");
  const inputChecksum = String(payload?.sourceChecksum ?? "");
  if (!response.ok || payload?.ok !== true || payload.contentType !== input.contentType
    || String(payload.fixtureId ?? "") !== input.fixtureId || payload.teamId !== null
    || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(sourceSnapshotAt))
    || Date.parse(sourceSnapshotAt) < Date.parse(startsAt)
    || !SHA256.test(inputChecksum) || !revision) {
    throw new Error("TL_FINAL_RESULT_CURRENT_SOURCE_UNAVAILABLE");
  }
  return { fixtureId: input.fixtureId, teamId: null, startsAt, sourceSnapshotAt, inputChecksum, ...revision };
}

export async function discoverTouchlineSocialFinalResultCandidates(input: Readonly<{
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitFixtureId?: string | null;
  nowMs?: number;
}>): Promise<TouchlineSocialFinalResultCandidate[]> {
  const explicitFixtureId = input.explicitFixtureId?.trim() || null;
  if (explicitFixtureId && !NUMERIC_ID.test(explicitFixtureId)) {
    throw new Error("TL_FINAL_RESULT_EXPLICIT_FIXTURE_INVALID");
  }
  const competition = await input.admin.from("football_competitions")
    .select("id").eq("provider", "sportmonks")
    .eq("provider_competition_id", COMPETITION_PROVIDER_ID).maybeSingle();
  const competitionId = String(competition.data?.id ?? "");
  if (competition.error || !competitionId) throw new Error("TL_FINAL_RESULT_COMPETITION_UNAVAILABLE");

  const now = input.nowMs ?? Date.now();
  let query = input.admin.from("football_fixtures")
    .select("provider_fixture_id,starts_at,status")
    .eq("provider", "sportmonks").eq("competition_id", competitionId);
  if (explicitFixtureId) query = query.eq("provider_fixture_id", explicitFixtureId);
  else query = query.gte("starts_at", new Date(now - RECENT_WINDOW_MS).toISOString())
    .lte("starts_at", new Date(now).toISOString())
    .order("starts_at", { ascending: false }).limit(32);
  const fixtures = await query;
  if (fixtures.error || !Array.isArray(fixtures.data)) throw new Error("TL_FINAL_RESULT_FIXTURE_READ_FAILED");
  const identities = fixtures.data.flatMap((row) => {
    const fixtureId = String(row.provider_fixture_id ?? "");
    const startsAt = String(row.starts_at ?? "");
    return NUMERIC_ID.test(fixtureId) && Number.isFinite(Date.parse(startsAt)) && FINISHED.test(String(row.status ?? ""))
      ? [{ fixtureId, startsAt }] : [];
  });
  if (explicitFixtureId && identities.length !== 1) throw new Error("TL_FINAL_RESULT_EXPLICIT_FIXTURE_NOT_ELIGIBLE");

  const results = await Promise.all(identities.map(async ({ fixtureId }) => {
    const source = await readCurrentTouchlineFinalResultSource({
      base: input.base, renderSecret: input.renderSecret, fixtureId, contentType: "FULL_TIME",
    });
    return (["FULL_TIME", "FINAL_SCORE"] as const).map((contentType) => ({
      ...source, contentType, firstObservedAt: source.sourceSnapshotAt,
    }));
  }));
  return results.flat();
}
