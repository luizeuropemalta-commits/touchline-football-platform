import { requestClubCollection } from './club-collection-request.ts';
import { projectExchangeHistory, type ExchangeHistorySnapshot } from './exchange-history-presentation.ts';

export type ExchangeHistoryScope = Readonly<{
  ready: boolean;
  accountId?: string;
  seasonId?: string;
  collectionRevision?: number;
}>;

/** The expected context fences a read; the server still authenticates the owner.
 * No retries, writes, persisted wallet or fabricated empty history. */
export async function readExchangeHistory(scope: ExchangeHistoryScope, signal?: AbortSignal,
  request = requestClubCollection): Promise<ExchangeHistorySnapshot | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!scope.ready || !scope.accountId || !uuid.test(scope.accountId) || !scope.seasonId || !uuid.test(scope.seasonId)
    || !Number.isSafeInteger(scope.collectionRevision) || scope.collectionRevision! < 0 || signal?.aborted) return null;
  try {
    const { response, payload } = await request(`/api/touchline-fantasy/exchange/history?expectedSeasonId=${encodeURIComponent(scope.seasonId)}`, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', signal,
      headers: { 'X-Touchline-Account': scope.accountId },
    }, 20_000);
    if (signal?.aborted || !response.ok || payload?.ok !== true) return null;
    return projectExchangeHistory(payload.history, scope);
  } catch { return null; }
}
