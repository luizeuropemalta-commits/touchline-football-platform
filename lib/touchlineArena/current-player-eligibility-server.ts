import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalEditorialSeason } from './editorial-season';
import { loadTouchlinePublishedCardPresentations } from './card-publication-read-model';
import type { TouchlineActiveRankingState } from './card-ranking-live';
import { currentRankingCandidateIds, projectTouchlineCurrentPlayerRanking, unavailableCurrentPlayerRanking,
  type TouchlineCurrentLeagueScope, type TouchlineCurrentPlayerAdmission } from './current-player-ranking';

type Row = Record<string, unknown>;
type Response = { data: unknown; error: unknown; count: number | null };
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
const provider = (value: unknown): value is string => typeof value === 'string' && !/\s/.test(value) && /^[1-9][0-9]{0,19}$/.test(value);
function complete(response: Response): Row[] {
  if (response.error || !Array.isArray(response.data) || response.count !== response.data.length
    || response.data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('incomplete-canonical-read');
  return response.data as Row[];
}
/** Exact canonical current-season marker, not the season of the last publication. */
export async function readTouchlineCurrentLeagueScope(admin: SupabaseClient): Promise<TouchlineCurrentLeagueScope | null> {
  try {
    const competitions = complete(await admin.from('football_competitions')
      .select('id,provider,provider_competition_id', { count: 'exact' })
      .eq('provider', 'sportmonks').eq('provider_competition_id', '8').limit(2).abortSignal(AbortSignal.timeout(8_000)));
    const competition = competitions.length === 1 ? competitions[0] : null;
    if (!competition || !uuid(competition.id) || competition.provider !== 'sportmonks' || competition.provider_competition_id !== '8') return null;
    const seasons = complete(await admin.from('football_seasons')
      .select('id,provider,provider_season_id,competition_id,is_current,name', { count: 'exact' })
      .eq('provider', 'sportmonks').eq('competition_id', competition.id).eq('is_current', true).limit(2).abortSignal(AbortSignal.timeout(8_000)));
    const season = seasons.length === 1 ? seasons[0] : null;
    const effectiveSeason = canonicalEditorialSeason(season?.name);
    return season && uuid(season.id) && provider(season.provider_season_id) && season.provider === 'sportmonks'
      && season.competition_id === competition.id && season.is_current === true && effectiveSeason
      ? { competitionId: competition.id, seasonId: season.id, providerSeasonId: season.provider_season_id, effectiveSeason } : null;
  } catch { return null; }
}
async function pages(read: (from: number, to: number) => PromiseLike<Response>): Promise<Row[]> {
  const rows: Row[] = [];
  let count: number | null = null;
  for (let offset = 0; offset <= 10_000; offset += 150) {
    const response = await read(offset, offset + 149);
    if (response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count)
      || response.count! < 0 || response.count! > 10_000 || count !== null && response.count !== count
      || response.data.length !== Math.min(150, response.count! - offset)
      || response.data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('incomplete-canonical-page');
    count = response.count;
    rows.push(...response.data as Row[]);
    if (rows.length === count) {
      if (rows.some(row => !uuid(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('duplicate-canonical-row');
      return rows;
    }
  }
  throw new Error('canonical-capacity-exceeded');
}
async function batches(ids: readonly string[], read: (ids: string[]) => Promise<Row[]>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += 150) rows.push(...await read(ids.slice(index, index + 150)));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('duplicate-batched-identity');
  return rows;
}
async function readAdmissions(admin: SupabaseClient, ids: readonly string[], scope: TouchlineCurrentLeagueScope): Promise<TouchlineCurrentPlayerAdmission[]> {
  const playerIds = new Set(ids);
  const players = await batches(ids, batch => pages((from,to) => admin.from('football_players')
    .select('id,provider,provider_player_id,current_club_id', { count: 'exact' })
    .eq('provider', 'sportmonks').in('id', batch).order('id').range(from,to).abortSignal(AbortSignal.timeout(8_000))));
  if (players.length !== ids.length || players.some(row => !playerIds.has(row.id as string) || row.provider !== 'sportmonks'
    || !provider(row.provider_player_id) || !uuid(row.current_club_id))
    || new Set(players.map(row => row.provider_player_id)).size !== players.length) throw new Error('canonical-player-unavailable');
  const clubIds = [...new Set(players.map(row => row.current_club_id as string))].sort();
  const clubIdSet = new Set(clubIds);
  const clubs = await batches(clubIds, batch => pages((from,to) => admin.from('football_clubs')
    .select('id,provider,provider_team_id,competition_id', { count: 'exact' })
    .eq('provider','sportmonks').in('id',batch).order('id').range(from,to).abortSignal(AbortSignal.timeout(8_000))));
  if (clubs.length !== clubIds.length || clubs.some(row => !clubIdSet.has(row.id as string) || row.provider !== 'sportmonks'
    || !provider(row.provider_team_id) || !uuid(row.competition_id))) throw new Error('canonical-club-unavailable');
  const members = await batches(ids, batch => pages((from,to) => admin.from('football_squad_members')
    .select('id,provider,player_id,club_id,competition_id,status', { count: 'exact' })
    .eq('provider','sportmonks').in('player_id',batch).order('id').range(from,to).abortSignal(AbortSignal.timeout(8_000))));
  if (members.some(row => row.provider !== 'sportmonks' || !playerIds.has(row.player_id as string)
    || !uuid(row.club_id) || !uuid(row.competition_id))) throw new Error('canonical-membership-invalid');
  const clubsById = new Map(clubs.map(row => [row.id,row]));
  const membershipsByBinding = new Map<string,Row[]>();
  for (const member of members) {
    const key = `${member.player_id}:${member.club_id}:${member.competition_id}`;
    const values = membershipsByBinding.get(key) ?? [];
    values.push(member); membershipsByBinding.set(key,values);
  }
  return players.map(player => {
    const club = clubsById.get(player.current_club_id)!;
    const base = { playerId: player.id as string, providerPlayerId: player.provider_player_id as string, clubId: club.id as string };
    if (club.competition_id !== scope.competitionId) return { ...base, membershipId: null, status: 'outside-league' as const };
    const binding = membershipsByBinding.get(`${player.id}:${club.id}:${scope.competitionId}`) ?? [];
    if (binding.length !== 1) throw new Error('canonical-membership-unavailable');
    const member = binding[0]!;
    if (member.status === 'active') return { ...base, membershipId: member.id as string, status: 'eligible' as const };
    if (member.status === 'inactive' || member.status === 'loaned') return { ...base, membershipId: member.id as string, status: 'inactive' as const };
    throw new Error('canonical-membership-unknown');
  }).sort((a,b) => a.playerId.localeCompare(b.playerId));
}

/** SELECT-only, bounded and uncached. Missing/unknown is never an exclusion.
 * Same-scope re-read detects a transfer/revocation during this nontransactional
 * read. Publication validation binds eligible UUID+club+membership again. */
export async function readTouchlineCurrentPlayerRanking(admin: SupabaseClient, raw: TouchlineActiveRankingState | null,
  scope: TouchlineCurrentLeagueScope | null) {
  if (!scope) return unavailableCurrentPlayerRanking(raw, 'current-scope-unavailable');
  try {
    const ids = currentRankingCandidateIds(raw);
    if (ids.length > 10_000 || ids.some(id => !uuid(id))) throw new Error('invalid-ranking-identities');
    const sameSeason = raw?.phase === 'ranked' && raw.seasonId === scope.seasonId;
    const admissions = sameSeason ? await readAdmissions(admin, ids, scope) : [];
    const eligible = admissions.filter(row => row.status === 'eligible');
    for (let offset = 0; offset < eligible.length; offset += 150) {
      const batch = eligible.slice(offset,offset + 150);
      const presentations = await loadTouchlinePublishedCardPresentations({ playerIds: batch.map(row => row.playerId), providedAdmin: admin,
        requireCompleteRead: true, requiredScope: { competitionId: scope.competitionId, effectiveSeason: scope.effectiveSeason },
        requiredBindings: new Map(batch.map(row => [row.playerId, { clubId: row.clubId, membershipId: row.membershipId! }])) });
      if (presentations.size !== batch.length || batch.some(row => !presentations.has(row.playerId))) throw new Error('current-publication-unavailable');
    }
    const finalScope = await readTouchlineCurrentLeagueScope(admin);
    const finalAdmissions = sameSeason ? await readAdmissions(admin, ids, scope) : [];
    if (JSON.stringify(scope) !== JSON.stringify(finalScope) || JSON.stringify(admissions) !== JSON.stringify(finalAdmissions)) throw new Error('current-scope-changed-during-read');
    const revision = createHash('sha256').update(JSON.stringify([raw?.snapshotId ?? null, scope, admissions])).digest('hex');
    return projectTouchlineCurrentPlayerRanking({ raw, scope, admissions, revision });
  } catch { return unavailableCurrentPlayerRanking(raw, 'current-eligibility-unavailable', scope); }
}
