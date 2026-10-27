"use client";
import { useEffect, useState } from 'react';
import { readExchangeHistory, type ExchangeHistoryScope } from '@/lib/touchlineFantasy/exchange-history-client';
import type { ExchangeHistorySnapshot } from '@/lib/touchlineFantasy/exchange-history-presentation';

/** Mount only within the opened panel. Closed panels never poll or retain reads. */
export function useExchangeHistory(enabled: boolean, scope: ExchangeHistoryScope) {
  const { ready, accountId, seasonId, collectionRevision } = scope;
  const key = JSON.stringify([accountId, seasonId, collectionRevision]);
  const [result, setResult] = useState<{ key: string; history: ExchangeHistorySnapshot | null } | null>(null);
  useEffect(() => {
    if (!enabled || !ready) return;
    const controller = new AbortController();
    void readExchangeHistory({ ready, accountId, seasonId, collectionRevision }, controller.signal).then(history => {
      if (!controller.signal.aborted) setResult({ key, history });
    });
    return () => controller.abort();
  }, [enabled, ready, accountId, seasonId, collectionRevision, key]);
  return enabled && ready && result?.key === key ? result.history : null;
}
