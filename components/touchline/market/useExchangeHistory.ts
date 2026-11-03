"use client";
import { useEffect, useState } from 'react';
import { readExchangeHistory, type ExchangeHistoryScope } from '@/lib/touchlineFantasy/exchange-history-client';
import type { ExchangeHistorySnapshot } from '@/lib/touchlineFantasy/exchange-history-presentation';

export type ExchangeHistoryRead =
  | { status: 'idle' | 'loading' | 'unavailable'; history: null }
  | { status: 'ready'; history: ExchangeHistorySnapshot };

/** Mount only within the opened panel. Closed panels never poll or retain reads. */
export function useExchangeHistory(enabled: boolean, scope: ExchangeHistoryScope): ExchangeHistoryRead {
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
  if (!enabled || !ready) return { status: 'idle', history: null };
  // No response for this account/season/revision is still loading, not an outage.
  if (result?.key !== key) return { status: 'loading', history: null };
  return result.history
    ? { status: 'ready', history: result.history }
    : { status: 'unavailable', history: null };
}
