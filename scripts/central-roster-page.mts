import { randomUUID } from 'node:crypto';
import { createFixtureAuthorityHttpTransport } from '../lib/football-data/fixture-authority-http-server.ts';
import { createSportmonksFixtureAuthority } from '../lib/football-data/sportmonks-fixture-authority.ts';
import { observeSportmonksQuota } from '../lib/football-data/sportmonks-quota-observation.ts';
import { footballDataFetchJson } from '../lib/football-data/http.ts';

type Config = Readonly<{ apiBaseUrl: string; token: string; central: Readonly<{
  enabled: true; url: string; workerToken: string; accountScope: string;
}> }>;

/** CLI uses node --conditions=react-server --experimental-strip-types.
 * No content DB client, cache, retries, environment fallback or raw-body logs. */
export async function readCentralRosterPage(config: Config, teamId: string, page: number, fetchImpl: typeof fetch) {
  if (config?.central?.enabled !== true || !config.token || config.token === config.central.workerToken
    || !/^[1-9][0-9]{0,19}$/.test(teamId) || !Number.isSafeInteger(page) || page < 1 || page > 10
    || config.apiBaseUrl !== 'https://api.sportmonks.com/v3/football') throw new Error('Roster central binding unavailable.');
  const call = createFixtureAuthorityHttpTransport({ ...config.central, timeoutMs: 2500 }, fetchImpl);
  const requestId = randomUUID();
  const guard = createSportmonksFixtureAuthority(config.central.accountScope, call);
  const port = guard.createPort({ accountScope: config.central.accountScope, entity: 'PlayerTeam', endpoint: 'squad', requestId });
  const url = new URL(`${config.apiBaseUrl}/squads/teams/${teamId}`);
  url.searchParams.set('api_token', config.token);
  url.searchParams.set('include', 'player;position;detailedPosition');
  url.searchParams.set('per_page', '50'); url.searchParams.set('page', String(page));
  return footballDataFetchJson<Record<string, unknown>>(url, {
    provider: 'sportmonks', fetchImpl, method: 'GET', redirect: 'error', cache: 'no-store', timeoutMs: 15000,
    retry: { maxAttempts: 1, totalBudgetMs: 20000 },
    enforcement: {
      beforeAttempt: context => port.beforeAttempt(context),
      afterAttempt: context => port.afterAttempt({ ...context,
        observation: observeSportmonksQuota(requestId, 'squad', context.attempt, context.response) }),
    },
  });
}
