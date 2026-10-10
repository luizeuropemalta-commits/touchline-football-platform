import 'server-only';
import { randomUUID } from 'node:crypto';
import { footballDataFetchJson } from './http.ts';
import { observeSportmonksQuota, sportmonksPrequeryEndpoint, SPORTMONKS_PREQUERY_ENDPOINTS,
  type SportmonksPrequeryEndpoint, type SportmonksQuotaObservation } from './sportmonks-quota-observation.ts';

type Admission = Readonly<{ caseId: string; workerId: string; requestId: string;
  endpoint: SportmonksPrequeryEndpoint; budgetMs: number }>;
type Completion = Readonly<Omit<Admission, 'budgetMs'> & { token: string; observation: SportmonksQuotaObservation }>;
/** Operator-only adapter to private SQL017 on the EXPLICIT central database.
 * Admission must COMMIT before resolving; no open caller transaction, retries,
 * public worker RPC, content DB fallback or caller-provided SQL is acceptable.
 * Cancellation may not undo a committed lease: any uncertain result stays lost.
 */
export type RecoveryOperatorPort = Readonly<{
  admit(args: Admission, signal: AbortSignal): Promise<unknown>;
  complete(args: Completion, signal: AbortSignal): Promise<unknown>;
}>;
export type RecoveryMeasurementResult = Readonly<{
  requestId: string;
  state: 'recorded' | 'denied' | 'unavailable' | 'already-used';
  observation?: SportmonksQuotaObservation;
}>;
type Config = Readonly<{ enabled: true; caseId: string; workerId: string; apiToken: string;
  relativePath: string; timeoutMs?: number }>;
const uuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === 'object'
  && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const unavailable = () => new Error('Recovery measurement unavailable.');
const MAX_RESPONSE_BYTES = 128 * 1024;

/** Each instance can run once. Recreating it does not bypass SQL's durable
 * unique(case,entity) admission. No response data or token leaves this module.
 * This performs no prepare/finalize/activation and is never a worker fallback.
 */
export function createRecoveryMeasurement(config: Config, operator: RecoveryOperatorPort, fetchImpl: typeof fetch = fetch) {
  const endpoint = sportmonksPrequeryEndpoint(config?.relativePath);
  const timeout = config?.timeoutMs ?? 15000;
  if (config?.enabled !== true || !uuid(config.caseId) || typeof config.workerId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(config.workerId)
    || typeof config.apiToken !== 'string' || !/^[A-Za-z0-9._~-]{16,512}$/.test(config.apiToken)
    || !endpoint || !Number.isInteger(timeout) || timeout < 100 || timeout > 15000
    || typeof operator?.admit !== 'function' || typeof operator?.complete !== 'function' || typeof fetchImpl !== 'function') throw unavailable();
  const requestId = randomUUID(), caseId = config.caseId, workerId = config.workerId;
  const admit = operator.admit.bind(operator), complete = operator.complete.bind(operator);
  const url = new URL(`https://api.sportmonks.com/v3/football${config.relativePath}`);
  url.searchParams.set('api_token', config.apiToken);
  url.searchParams.set('per_page', '1');
  // No include/pagination/search query injection, redirect, alternate host or retry.
  let used = false;
  return Object.freeze({ async run(signal?: AbortSignal): Promise<RecoveryMeasurementResult> {
    if (used) return Object.freeze({ requestId, state: 'already-used' });
    used = true;
    let observation: SportmonksQuotaObservation | undefined, stopped = false, admitted = false;
    const boundedFetch: typeof fetch = async (input, init) => {
      if (!admitted || stopped || init?.signal?.aborted) throw unavailable();
      admitted = false; // Burn HTTP permission before calling even a throwing transport.
      const response = await fetchImpl(input, init);
      const reader = response.body?.getReader();
      if (!reader) throw unavailable();
      const chunks: Uint8Array[] = []; let bytes = 0;
      let rejectAborted!: () => void;
      const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = () => reject(unavailable()); });
      // Observe even an abort before the first read; never await a stream's
      // potentially non-cooperative cancellation hook.
      void aborted.catch(() => {});
      const onAbort = () => { void reader.cancel().catch(() => {}); rejectAborted(); };
      init?.signal?.addEventListener('abort', onAbort, { once: true });
      if (init?.signal?.aborted) onAbort();
      try {
        const declared = response.headers.get('content-length');
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) throw unavailable();
        while (true) {
          if (stopped || init?.signal?.aborted) throw unavailable();
          const chunk = await Promise.race([reader.read(), aborted]);
          if (stopped || init?.signal?.aborted) throw unavailable();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) throw unavailable();
          chunks.push(chunk.value);
        }
        const body = new Uint8Array(bytes); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
        const rate = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
          ? (decoded as Record<string, unknown>).rate_limit : undefined;
        const headers = new Headers({ 'content-type': 'application/json' });
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) headers.set('retry-after', retryAfter);
        // Discard football payload before shared HTTP detaches/clones its body.
        return new Response(JSON.stringify({ rate_limit: rate }), { status: response.status, headers });
      } finally { init?.signal?.removeEventListener('abort', onAbort); void reader.cancel().catch(() => {}); }
    };
    try {
      const response = await footballDataFetchJson<unknown>(url, {
        provider: 'sportmonks', fetchImpl: boundedFetch, method: 'GET', redirect: 'error', cache: 'no-store',
        signal, timeoutMs: timeout, retry: { maxAttempts: 1, totalBudgetMs: timeout + 3000 },
        enforcement: {
          async beforeAttempt(context) {
            if (context.attempt !== 1 || stopped || context.signal.aborted) throw unavailable();
            const answer = await admit({ caseId, workerId, requestId, endpoint,
              budgetMs: Math.floor(context.remainingBudgetMs) }, context.signal);
            if (stopped || context.signal.aborted) throw unavailable();
            if (exact(answer, ['allowed']) && answer.allowed === false) return { allowed: false };
            if (!exact(answer, ['allowed', 'token']) || answer.allowed !== true || !uuid(answer.token)) throw unavailable();
            admitted = true;
            return { allowed: true, token: answer.token };
          },
          async afterAttempt(context) {
            if (context.attempt !== 1 || stopped || context.signal.aborted || !uuid(context.token)) throw unavailable();
            const current = observeSportmonksQuota(requestId, SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].operation, 1, context.response);
            const answer = await complete({ caseId, workerId, requestId, endpoint, token: context.token,
              observation: current }, context.signal);
            if (stopped || context.signal.aborted || !exact(answer, ['persisted']) || answer.persisted !== true) throw unavailable();
            observation = current;
            return { persisted: true };
          },
        },
      });
      if (signal?.aborted) return Object.freeze({ requestId, state: 'unavailable' });
      if (observation) return Object.freeze({ requestId, state: 'recorded', observation });
      return Object.freeze({ requestId, state: response.requestDisposition === 'deferred-before-http' ? 'denied' : 'unavailable' });
    } catch { return Object.freeze({ requestId, state: 'unavailable' }); }
    finally { stopped = true; admitted = false; }
  } });
}
