import { parseTouchlineFixtureTimestamp as timestamp } from "./fixture-timestamp.ts";

type NextFixtureCandidate = Readonly<{
  id: string;
  providerId?: string;
  startsAt?: string;
  status?: string;
  source?: { lastSyncedAt?: string };
  verifiedAt?: string;
}>;

const SCHEDULED_STATUS = /^(?:not[ _-]?started|ns|scheduled|upcoming|1)$/i;


/** Next scheduled game only, using the existing persisted feeds and calendar.
 * Reconcile duplicate snapshots before filtering: an older calendar entry must
 * not resurrect a fixture which a later feed says has ended or been postponed.
 * Without comparable timestamps, an explicit non-scheduled state wins a tie.
 */
export function selectClubHubNextFixture<T extends NextFixtureCandidate>(
  fixtures: readonly T[], belongsToClub: (fixture: T) => boolean, now = Date.now(),
): T | undefined {
  if (!Number.isFinite(now)) return undefined;
  const current = new Map<string, T>();
  for (const fixture of fixtures) {
    const key = fixture.providerId || fixture.id;
    if (!key) continue;
    const previous = current.get(key);
    if (!previous) { current.set(key, fixture); continue; }
    const previousAt = timestamp(previous.source?.lastSyncedAt ?? previous.verifiedAt);
    const nextAt = timestamp(fixture.source?.lastSyncedAt ?? fixture.verifiedAt);
    if (previousAt !== null && nextAt !== null && previousAt !== nextAt) {
      if (nextAt > previousAt) current.set(key, fixture);
    } else if (SCHEDULED_STATUS.test(previous.status?.trim() ?? "") && !SCHEDULED_STATUS.test(fixture.status?.trim() ?? "")) {
      current.set(key, fixture);
    }
  }
  return [...current.values()]
    .filter(belongsToClub)
    .map(fixture => ({ fixture, kickoff: timestamp(fixture.startsAt) }))
    .filter((row): row is { fixture: T; kickoff: number } => row.kickoff !== null && row.kickoff > now && SCHEDULED_STATUS.test(row.fixture.status?.trim() ?? ""))
    .sort((a, b) => a.kickoff - b.kickoff || a.fixture.id.localeCompare(b.fixture.id))[0]?.fixture;
}
