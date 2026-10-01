export type SportmonksQuotaCooldown = Readonly<{
  /** Complete usable metadata, not provider allowance or admission authority. */
  known: boolean;
  cooldownUntil: string | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TRACE_ITEMS = 60; // Existing provider collector's absolute bound.
const OPERATIONS = ["stages", "topscorers"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function instant(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 27) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}
function requestId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/** Summarize private producer.providerQuota without clock reads, renewal or
 * accounting. Independently valid absolute cooldowns survive invalid metadata.
 * Malformed oversized arrays are scanned only through the collector's bound;
 * known=false prevents treating that partial scan as admission evidence. */
export function summarizeSportmonksQuotaCooldown(input: unknown): SportmonksQuotaCooldown {
  const source = record(input);
  let known = source !== null;
  let maximum: number | null = null;
  const seen = new Map<string, string>();

  for (const operation of OPERATIONS) {
    const trace = record(source?.[operation]);
    if (!trace || trace.coverage !== "complete") known = false;
    const rows = trace?.observations;
    if (!Array.isArray(rows)) { known = false; continue; }
    if (rows.length === 0 || rows.length > MAX_TRACE_ITEMS) known = false;
    const requests = new Map<string, Set<number>>();
    let uniqueAttempts = 0;

    for (const candidate of rows.slice(0, MAX_TRACE_ITEMS)) {
      const row = record(candidate);
      if (!row) { known = false; continue; }
      const cooldown = instant(row.cooldownUntil);
      if (cooldown !== null) maximum = maximum === null ? cooldown : Math.max(maximum, cooldown);
      const observed = instant(row.observedAt), reset = instant(row.resetAt);
      const id = requestId(row.requestId);
      const valid = id !== null && row.operation === operation
        && integer(row.attempt, 1, operation === "stages" ? 1 : 3)
        && integer(row.status, 100, 599)
        && typeof row.requestedEntity === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(row.requestedEntity)
        && integer(row.remaining, 0, Number.MAX_SAFE_INTEGER)
        && observed !== null && reset !== null && reset >= observed
        && (row.cooldownUntil === null || cooldown !== null && cooldown >= observed)
        && (!(row.status === 429 || row.remaining === 0) || cooldown !== null && reset !== null && cooldown >= reset);
      if (!valid || id === null || typeof row.attempt !== "number") { known = false; continue; }

      const key = id + ":" + row.attempt;
      const fingerprint = JSON.stringify([operation, row.observedAt, row.status, row.requestedEntity,
        row.remaining, row.resetAt, row.cooldownUntil]);
      const previous = seen.get(key);
      if (previous !== undefined && previous !== fingerprint) known = false;
      if (previous === undefined) { seen.set(key, fingerprint); uniqueAttempts++; }
      const attempts = requests.get(id) ?? new Set<number>();
      attempts.add(row.attempt);
      requests.set(id, attempts);
    }

    if (requests.size === 0 || requests.size > (operation === "stages" ? 1 : 10)
      || uniqueAttempts > (operation === "stages" ? 1 : 30)) known = false;
    for (const attempts of requests.values()) {
      for (let attempt = 1; attempt <= attempts.size; attempt++) {
        if (!attempts.has(attempt)) known = false;
      }
    }
    const reused = trace?.reusedRequestIds;
    if (!Array.isArray(reused) || reused.length > MAX_TRACE_ITEMS) known = false;
    else for (const candidate of reused) {
      const id = requestId(candidate);
      if (id === null || !requests.has(id)) known = false;
    }
  }
  return { known, cooldownUntil: maximum === null ? null : new Date(maximum).toISOString() };
}
