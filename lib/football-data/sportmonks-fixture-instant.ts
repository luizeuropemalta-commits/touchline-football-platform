/** Sportmonks epoch seconds are authoritative. Its offset-less display string
 * must use the request's timezone (UTC by default), never the host timezone.
 * Missing/repeated local times at DST transitions are not guessed. */
export function sportmonksFixtureInstant(raw: Readonly<Record<string, unknown>>, sourceTimeZone = "UTC"): string | undefined {
  const value = raw.starting_at_timestamp;
  const seconds = typeof value === "number" ? value
    : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isSafeInteger(seconds)) {
    const instant = new Date(seconds * 1000);
    if (Number.isFinite(instant.getTime())) return instant.toISOString();
  }
  if (typeof raw.starting_at !== "string") return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/.exec(raw.starting_at);
  if (!match || match[1].startsWith("0000")) return undefined;
  const fraction = (match[3] ?? ".000").padEnd(4, "0");
  const canonicalWall = `${match[1]}T${match[2]}${fraction}Z`;
  const wall = Date.parse(canonicalWall);
  if (!Number.isFinite(wall) || new Date(wall).toISOString() !== canonicalWall) return undefined;
  if (match[4]) {
    const instant = Date.parse(`${match[1]}T${match[2]}${fraction}${match[4]}`);
    return Number.isFinite(instant) ? new Date(instant).toISOString() : undefined;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: sourceTimeZone,
      calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const wallAt = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
      return Date.parse(`${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`);
    };
    const wholeWall = wall - wall % 1000;
    // Observe offsets on both sides of the requested wall time. Candidate
    // instants are validated by round-trip, including non-hour/DST offsets.
    const offsets = new Set([-36, 0, 36].map(hours => {
      const sample = wholeWall + hours * 3600000;
      return wallAt(sample) - sample;
    }));
    const matches = [...offsets].map(offset => wholeWall - offset)
      .filter(candidate => Number.isFinite(candidate) && wallAt(candidate) === wholeWall);
    return matches.length === 1 ? new Date(matches[0] + wall % 1000).toISOString() : undefined;
  } catch { return undefined; }
}
