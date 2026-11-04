import 'server-only';
import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachCatalogue } from './coach-catalogue-contract';
import type { TouchLineCoachRankingState } from './coach-ranking-server';
import type { TouchlineActiveRankingState } from './card-ranking-live';
import { parseTouchlineCurrentPlayerRanking, unavailableCurrentPlayerRanking, type TouchlineCurrentPlayerRanking, type TouchlineCurrentLeagueScope } from './current-player-ranking';
import { parseTouchlineCurrentCoachRanking } from './current-coach-ranking';
import { readTouchlineCurrentPlayerRanking } from './current-player-eligibility-server';
import { readTouchlineCurrentCoachRanking } from './current-coach-ranking-server';
import { createTouchlineCurrentRankingCache } from './current-ranking-cache';

type CurrentPair = Readonly<{ currentPlayerRanking: TouchlineCurrentPlayerRanking; currentCoachRanking: TouchLineCoachRankingState | null }>;
const cache = createTouchlineCurrentRankingCache<CurrentPair>({
  // Closure values are represented explicitly by this canonical digest. No
  // request headers/cookies or service-role key is passed to Next's cache.
  readCached: (key,fresh) => unstable_cache(fresh,['touchline-current-ranking-v1',key],{revalidate:5})(),
});
export function touchlineCurrentRankingCacheKey(input: {
  environment: Record<string,string|undefined>; scope: TouchlineCurrentLeagueScope;
  player: TouchlineActiveRankingState|null; coach: TouchLineCoachRankingState|null; catalogue: CoachCatalogue;
}) {
  const url = input.environment.SUPABASE_URL || input.environment.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  let projectOrigin: string;
  try { const parsed=new URL(url); if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.search || parsed.hash || parsed.pathname !== '/' && parsed.pathname !== '') return null; projectOrigin=parsed.origin; } catch { return null; }
  const environment = input.environment.VERCEL_ENV ?? input.environment.NODE_ENV;
  if (!environment || !['production','preview','development','test'].includes(environment)) return null;
  return createHash('sha256').update(JSON.stringify(['current-ranking-v1',environment,projectOrigin,
    input.scope,input.player?.snapshotId??null,input.coach?.snapshotId??null,
    input.environment.TOUCHLINE_COACH_CATALOGUE_ENABLED==='true',input.catalogue.phase,input.catalogue.revision,
    createHash('sha256').update(JSON.stringify(input.catalogue)).digest('hex')])).digest('hex');
}
/** The caller resolves current scope/catalogue before cache lookup. A season,
 * publication, gate or catalogue change cannot reuse a previous key. */
export async function readSharedTouchlineCurrentRankings(input: {
  admin: SupabaseClient; player: TouchlineActiveRankingState|null; coach: TouchLineCoachRankingState|null;
  catalogue: CoachCatalogue; scope: TouchlineCurrentLeagueScope|null;
}): Promise<CurrentPair> {
  const unavailable = (): CurrentPair => ({currentPlayerRanking:unavailableCurrentPlayerRanking(input.player,'current-read-unavailable',input.scope),currentCoachRanking:null});
  if (!input.scope) return unavailable();
  const key = touchlineCurrentRankingCacheKey({...input,scope:input.scope,environment:process.env});
  if (!key) return unavailable();
  const validate = (value:unknown): value is CurrentPair => {
    if (!value || typeof value!=='object' || Array.isArray(value)) return false;
    const pair=value as CurrentPair;
    const player=parseTouchlineCurrentPlayerRanking(pair.currentPlayerRanking,input.player);
    const coach=pair.currentCoachRanking===null?null:parseTouchlineCurrentCoachRanking(pair.currentCoachRanking,input.coach);
    return !!player && (pair.currentCoachRanking===null || !!coach)
      && player.scope?.seasonId===input.scope!.seasonId && player.scope.competitionId===input.scope!.competitionId
      && (!coach || coach.currentProjection?.scope.seasonId===input.scope!.seasonId && coach.currentProjection.scope.competitionId===input.scope!.competitionId);
  };
  try {
    return await cache.load(key,async()=>{
      const [currentPlayerRanking,currentCoachRanking]=await Promise.all([
        readTouchlineCurrentPlayerRanking(input.admin,input.player,input.scope),
        readTouchlineCurrentCoachRanking(input.admin,input.coach,input.catalogue,input.scope),
      ]);
      return {currentPlayerRanking,currentCoachRanking};
    },validate);
  } catch { return unavailable(); }
}
