import type { SupabaseClient } from "@supabase/supabase-js";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_KEY = /^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;
const PREMIER_LEAGUE_PROVIDER_COMPETITION_ID = "8";
const PREVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const SOURCE_READ_TIMEOUT_MS = 45_000;

export type TouchlineSocialMatchPreviewCandidate = Readonly<{
  contentType: "MATCH_PREVIEW";
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

async function readCurrentMatchPreviewSource(input: Readonly<{
  base: URL;
  renderSecret: string;
  fixtureId: string;
}>) {
  const url = new URL("/api/admin/social-publications/source", input.base);
  url.searchParams.set("contentType", "MATCH_PREVIEW");
  url.searchParams.set("fixtureId", input.fixtureId);
  const response = await fetch(url, {
    method: "GET",
    headers: { cookie: `tl-social-render=${encodeURIComponent(input.renderSecret)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const sourceRevision = payload ? parseSourceRevision(payload) : null;
  const startsAt = String(payload?.startsAt ?? "");
  const sourceChecksum = String(payload?.sourceChecksum ?? "");
  if (!response.ok || payload?.ok !== true || payload.contentType !== "MATCH_PREVIEW"
    || String(payload.fixtureId ?? "") !== input.fixtureId || payload.teamId !== null
    || !SHA256.test(sourceChecksum) || !sourceRevision
    || !Number.isFinite(Date.parse(startsAt))) {
    throw new Error("TL_MATCH_PREVIEW_CURRENT_SOURCE_UNAVAILABLE");
  }
  return {
    contentType: "MATCH_PREVIEW" as const,
    fixtureId: input.fixtureId,
    teamId: null,
    startsAt,
    inputChecksum: sourceChecksum,
    ...sourceRevision,
  };
}

export async function discoverTouchlineSocialMatchPreviewCandidates(input: Readonly<{
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitFixtureId?: string | null;
  expectedInputChecksum?: string | null;
  expectedSourceRevisionChecksum?: string | null;
  nowMs?: number;
}>): Promise<TouchlineSocialMatchPreviewCandidate[]> {
  const explicitFixtureId = input.explicitFixtureId?.trim() || null;
  if (explicitFixtureId && !NUMERIC_ID.test(explicitFixtureId)) {
    throw new Error("TL_MATCH_PREVIEW_EXPLICIT_FIXTURE_INVALID");
  }
  if ((input.expectedInputChecksum || input.expectedSourceRevisionChecksum)
    && (!explicitFixtureId || !SHA256.test(input.expectedInputChecksum ?? "")
      || !SHA256.test(input.expectedSourceRevisionChecksum ?? ""))) {
    throw new Error("TL_MATCH_PREVIEW_EXPECTED_SOURCE_INVALID");
  }
  const competition = await input.admin.from("football_competitions")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", PREMIER_LEAGUE_PROVIDER_COMPETITION_ID)
    .maybeSingle();
  const competitionId = String(competition.data?.id ?? "");
  if (competition.error || !competitionId) throw new Error("TL_MATCH_PREVIEW_COMPETITION_UNAVAILABLE");

  const now = input.nowMs ?? Date.now();
  let query = input.admin.from("football_fixtures")
    .select("provider_fixture_id,starts_at")
    .eq("provider", "sportmonks")
    .eq("competition_id", competitionId);
  if (explicitFixtureId) query = query.eq("provider_fixture_id", explicitFixtureId);
  else query = query
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + PREVIEW_WINDOW_MS).toISOString())
    .order("starts_at", { ascending: true })
    .limit(24);
  const fixtures = await query;
  if (fixtures.error || !Array.isArray(fixtures.data)) throw new Error("TL_MATCH_PREVIEW_FIXTURE_READ_FAILED");
  const identities = fixtures.data.flatMap((fixture) => {
    const fixtureId = String(fixture.provider_fixture_id ?? "");
    const startsAt = String(fixture.starts_at ?? "");
    const startsAtMs = Date.parse(startsAt);
    return NUMERIC_ID.test(fixtureId) && Number.isFinite(startsAtMs)
      && startsAtMs > now && startsAtMs - now <= PREVIEW_WINDOW_MS
      ? [{ fixtureId, startsAt }]
      : [];
  });
  if (explicitFixtureId && identities.length !== 1) throw new Error("TL_MATCH_PREVIEW_EXPLICIT_FIXTURE_NOT_ELIGIBLE");

  const observedAt = new Date(now).toISOString();
  const candidates = await Promise.all(identities.map(async ({ fixtureId }) => ({
    ...(await readCurrentMatchPreviewSource({ base: input.base, renderSecret: input.renderSecret, fixtureId })),
    firstObservedAt: observedAt,
  })));
  if (input.expectedInputChecksum || input.expectedSourceRevisionChecksum) {
    const candidate = candidates[0];
    if (candidates.length !== 1 || !candidate
      || candidate.inputChecksum !== input.expectedInputChecksum
      || candidate.sourceRevisionChecksum !== input.expectedSourceRevisionChecksum) {
      throw new Error("TL_MATCH_PREVIEW_QUEUED_SOURCE_CHANGED");
    }
  }
  return candidates;
}
