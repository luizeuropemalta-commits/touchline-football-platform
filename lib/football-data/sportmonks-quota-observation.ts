import type { FootballDataHttpResponse } from "./http.ts";

export type SportmonksQuotaOperation = "stages" | "topscorers";
/** Keep the GoldenBoot operation set stable; Fixture is a separate entity scope. */
export type SportmonksObservedQuotaOperation = SportmonksQuotaOperation | "fixture" | "league" | "season" | "squad" | "squadExtended"
  | "player" | "team" | "coach" | "standing" | "transfer" | "resource" | "enrichment";
/** Closed worker-only prequery contract. New raw literals still require isolated
 * provider evidence before activation; mismatches must block unknown. */
export const SPORTMONKS_PREQUERY_ENDPOINTS = {
  fixture: { operation: "fixture", entity: "Fixture" },
  date: { operation: "fixture", entity: "Fixture" },
  between: { operation: "fixture", entity: "Fixture" },
  inplay: { operation: "fixture", entity: "Fixture" },
  latest: { operation: "fixture", entity: "Fixture" },
  league: { operation: "league", entity: "League" },
  season: { operation: "season", entity: "Season" },
  stages: { operation: "stages", entity: "Stage" },
  topscorers: { operation: "topscorers", entity: "Topscorer" },
  // Official Sportmonks Postman examples distinguish these two quota entities.
  // SQL admission remains fail-closed until a separately verified migration.
  squad: { operation: "squad", entity: "PlayerTeam" },
  squadExtended: { operation: "squadExtended", entity: "Player" },
  player: { operation: "player", entity: "Player" },
  playerSearch: { operation: "player", entity: "Player" },
  team: { operation: "team", entity: "Team" },
  coach: { operation: "coach", entity: "Coach" },
  standings: { operation: "standing", entity: "Standing" },
  playerTransfers: { operation: "transfer", entity: "Transfer" },
  teamTransfers: { operation: "transfer", entity: "Transfer" },
  seasons: { operation: "season", entity: "Season" },
  leagueSeasons: { operation: "season", entity: "Season" },
  leagues: { operation: "league", entity: "League" },
  resources: { operation: "resource", entity: "Resource" },
  enrichments: { operation: "enrichment", entity: "Enrichment" },
} as const;
export type SportmonksPrequeryEndpoint = keyof typeof SPORTMONKS_PREQUERY_ENDPOINTS;

/** Classifies only API-relative paths emitted by this adapter. This is not
 * admission: the central SQL policy must accept and reserve the same tuple.
 * Never normalize URLs, traversal, query strings or encoded path separators. */
export function sportmonksPrequeryEndpoint(path: string): SportmonksPrequeryEndpoint | null {
  if (typeof path !== "string" || /\s/.test(path) || path.includes("\\")) return null;
  const exact: Readonly<Record<string, SportmonksPrequeryEndpoint>> = {
    "/livescores/inplay": "inplay", "/livescores/latest": "latest",
    "/seasons": "seasons", "/leagues": "leagues",
    "/my/resources": "resources", "/my/enrichments": "enrichments",
  };
  if (Object.hasOwn(exact, path)) return exact[path];
  const idPaths: readonly [string, SportmonksPrequeryEndpoint][] = [
    ["squads/teams", "squad"], ["leagues", "league"], ["seasons", "season"],
    ["stages/seasons", "stages"], ["topscorers/seasons", "topscorers"],
    ["fixtures", "fixture"], ["players", "player"], ["teams", "team"],
    ["coaches", "coach"], ["standings/seasons", "standings"],
    ["transfers/players", "playerTransfers"], ["transfers/teams", "teamTransfers"],
    ["seasons/leagues", "leagueSeasons"],
  ];
  for (const [prefix, endpoint] of idPaths) {
    if (new RegExp(`^/${prefix}/[1-9][0-9]{0,19}$`).test(path)) return endpoint;
  }
  if (/^\/squads\/teams\/[1-9][0-9]{0,19}\/extended$/.test(path)) return "squadExtended";
  const search = /^\/players\/search\/([^/?#]+)$/.exec(path);
  if (search) {
    try {
      const term = decodeURIComponent(search[1]);
      const hasControl = [...term].some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127);
      if (term.trim() && term !== "." && term !== ".." && !hasControl && !/[/\\%?#]/.test(term)
        && encodeURIComponent(term) === search[1]) return "playerSearch";
    } catch { /* Invalid escape/UTF-8 is not an endpoint. */ }
    return null;
  }
  const date = /^\/fixtures\/date\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  const between = /^\/fixtures\/between\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  const validDay = (day: string) => {
    const time = Date.parse(`${day}T00:00:00.000Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
  };
  if (date && validDay(date[1])) return "date";
  if (between && validDay(between[1]) && validDay(between[2]) && between[1] <= between[2]) return "between";
  return null;
}
export type SportmonksQuotaObservation = Readonly<{
  requestId: string;
  attempt: number;
  operation: SportmonksObservedQuotaOperation;
  observedAt: string | null;
  status: number;
  requestedEntity: string | null;
  remaining: number | null;
  resetAt: string | null;
  cooldownUntil: string | null;
}>;
export type SportmonksRequestQuota = Readonly<{
  requestId: string;
  observations: readonly SportmonksQuotaObservation[];
  complete: boolean;
}>;
export type SportmonksQuotaTrace = Readonly<{
  /** Coverage of completed attempts, NOT known billable consumption. */
  coverage: "complete" | "unknown";
  observations: readonly SportmonksQuotaObservation[];
  reusedRequestIds: readonly string[];
}>;
export type SportmonksQuotaObserver = (trace: SportmonksQuotaTrace) => void | Promise<void>;

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}
function afterSeconds(now: number | null, seconds: unknown): string | null {
  const duration = integer(seconds);
  if (now === null || duration === null) return null;
  const result = now + duration * 1_000;
  return Number.isSafeInteger(result) && Math.abs(result) <= 8_640_000_000_000_000
    ? new Date(result).toISOString() : null;
}
function retryAt(value: string | null, now: number | null): string | null {
  if (value === null || now === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return afterSeconds(now, Number(trimmed));
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(Math.max(now, parsed)).toISOString() : null;
}
function latest(first: string | null, second: string | null): string | null {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

/** Only allowlisted operational primitives leave this boundary. No URL/body/error. */
export function observeSportmonksQuota(
  requestId: string, operation: SportmonksObservedQuotaOperation, attempt: number,
  response: Readonly<FootballDataHttpResponse<unknown>>,
): SportmonksQuotaObservation {
  const rate = record(record(response.data)?.rate_limit);
  const observed = timestamp(response.fetchedAt);
  const remaining = integer(rate?.remaining);
  const rawEntity = rate?.requested_entity;
  const requestedEntity = typeof rawEntity === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(rawEntity)
    ? rawEntity : null;
  const resetAt = afterSeconds(observed, rate?.resets_in_seconds);
  return Object.freeze({
    requestId, operation, attempt, observedAt: observed === null ? null : response.fetchedAt,
    status: response.status, requestedEntity, remaining, resetAt,
    cooldownUntil: latest(retryAt(response.headers.get("retry-after"), observed),
      response.status === 429 || remaining === 0 ? resetAt : null),
  });
}

/** Bounded read collector. Cache/inflight replays share original attempt IDs. */
export function createSportmonksQuotaRead(observer?: SportmonksQuotaObserver) {
  const observations = new Map<string, SportmonksQuotaObservation>();
  const reused = new Set<string>();
  let requests = 0, completed = 0, consistent = true, closed = false;
  function emit(final = false) {
    if (!observer) return;
    const trace: SportmonksQuotaTrace = Object.freeze({
      coverage: final && requests > 0 && completed === requests && consistent ? "complete" : "unknown",
      observations: Object.freeze([...observations.values()]),
      reusedRequestIds: Object.freeze([...reused]),
    });
    try { void Promise.resolve(observer(trace)).catch(() => undefined); } catch { /* telemetry only */ }
  }
  function observe(value: SportmonksQuotaObservation) {
    if (closed) return;
    const key = value.requestId + ":" + value.attempt;
    const previous = observations.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value)) consistent = false;
    else if (!previous) {
      // Existing adapter limit: 20 pages x 3 attempts; producer is stricter.
      if (observations.size >= 60) consistent = false;
      else observations.set(key, value);
    }
    emit();
  }
  return {
    begin() { if (!closed) { requests++; emit(); } },
    observe,
    finish(value: SportmonksRequestQuota | undefined, cached: boolean) {
      if (closed) return;
      if (value) {
        for (const item of value.observations) observe(item);
        if (cached) reused.add(value.requestId);
      }
      if (value?.complete) completed++;
      else consistent = false;
      emit();
    },
    close() { if (!closed) { closed = true; emit(true); } },
  };
}
