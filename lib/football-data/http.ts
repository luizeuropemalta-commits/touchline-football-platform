import type { FootballDataErrorCode, FootballDataProviderName } from "@/lib/football-data/types";

export type FootballDataTimeoutProfile = "live" | "interactive" | "background";

const DEFAULT_TIMEOUT_MS: Record<FootballDataTimeoutProfile, number> = {
  live: 2_000,
  interactive: 3_000,
  background: 15_000,
};

/**
 * One timeout policy for every provider adapter. Live and user-facing reads
 * must fail fast so callers can keep serving their last verified snapshot.
 */
export function footballDataTimeoutMs(profile: FootballDataTimeoutProfile) {
  const envName = `FOOTBALL_DATA_${profile.toUpperCase()}_TIMEOUT_MS`;
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured >= 100 && configured <= 60_000
    ? configured
    : DEFAULT_TIMEOUT_MS[profile];
}

export type FootballDataHttpResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Headers;
  fetchedAt: string;
  /** Internal proof: explicit authority denial before this operation started any fetch. */
  requestDisposition?: "deferred-before-http";
};

export type FootballDataRetryPolicy = {
  /** Includes request time and backoff waits across every attempt. */
  totalBudgetMs: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  /** Injectable wall clock, waiter and entropy keep retry tests deterministic. */
  now?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

export type FootballDataCompletedAttempt<T> = Readonly<{
  /** One-based actual attempt; no event is emitted for a pre-request abort. */
  attempt: number;
  /** Detached response, retaining its original completion timestamp. */
  response: Readonly<FootballDataHttpResponse<T>>;
}>;

export type FootballDataAttemptContext = Readonly<{
  attempt: number;
  signal: AbortSignal;
  remainingBudgetMs: number;
}>;

/** Internal awaited authority, distinct from best-effort telemetry. Implementations
 * must honor signal and fence late persistence using their admission token. A
 * stopped HTTP caller cannot undo a callback's already committed external write.
 */
export type FootballDataAttemptEnforcement<T> = Readonly<{
  beforeAttempt(context: FootballDataAttemptContext):
    | { allowed: false } | { allowed: true; token: string }
    | Promise<{ allowed: false } | { allowed: true; token: string }>;
  afterAttempt(context: FootballDataAttemptContext & FootballDataCompletedAttempt<T> & { token: string }):
    { persisted: true } | Promise<{ persisted: true }>;
}>;

type FootballDataFetchInit<T> = RequestInit & {
  timeoutMs?: number;
  provider: FootballDataProviderName;
  retry?: FootballDataRetryPolicy;
  /** Internal bounded observation only: do not log/persist raw responses or do I/O.
   * Invoked before retry selection. Returned promises are observed, never awaited.
   */
  onAttemptCompleted?: (attempt: FootballDataCompletedAttempt<T>) => void | Promise<void>;
  enforcement?: FootballDataAttemptEnforcement<T>;
};

type EnforcementState<T> = {
  port: FootballDataAttemptEnforcement<T>;
  signal: AbortSignal;
  remaining(): number;
  assertCurrent(): void;
};

function enforcementUnavailable<T>(): FootballDataHttpResponse<T> {
  return { ok: false, status: 0, error: "Football data request enforcement unavailable.",
    headers: new Headers(), fetchedAt: new Date().toISOString() };
}

function detachedAttempt<T>(attempt: number, response: FootballDataHttpResponse<T>): FootballDataCompletedAttempt<T> {
  return Object.freeze({ attempt, response: Object.freeze({ ...response,
    data: structuredClone(response.data), headers: new Headers(response.headers) }) });
}

function retryAfterDelayMs(value: string | null, now: number) {
  if (!value) return 0;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds * 1_000 : 0;
  }
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 0;
}

function retryDelayMs(
  attempt: number,
  response: FootballDataHttpResponse<unknown>,
  policy: Required<Pick<FootballDataRetryPolicy, "baseDelayMs" | "maxDelayMs" | "jitterRatio">>,
  now: number,
  random: () => number,
) {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** (attempt - 1)));
  const randomValue = random();
  const randomUnit = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const jitterUnit = randomUnit * 2 - 1;
  const jittered = Math.min(
    policy.maxDelayMs,
    Math.max(0, Math.round(exponential * (1 + jitterUnit * policy.jitterRatio))),
  );
  return Math.max(jittered, retryAfterDelayMs(response.headers.get("retry-after"), now));
}

function responseIsRetryable(response: FootballDataHttpResponse<unknown>, timedOut: boolean) {
  return timedOut || response.status === 429 || response.status >= 500;
}

function abortError(provider: FootballDataProviderName, signal: AbortSignal) {
  const reason = signal.reason;
  return reason instanceof Error ? reason.message : `${provider} request aborted`;
}

function abortedResponse<T>(provider: FootballDataProviderName, signal: AbortSignal): FootballDataHttpResponse<T> {
  return {
    ok: false,
    status: 0,
    error: abortError(provider, signal),
    headers: new Headers(),
    fetchedAt: new Date().toISOString(),
  };
}

function defaultRetrySleep(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForRetryDelay(
  delayMs: number,
  signal: AbortSignal | undefined,
  sleep: NonNullable<FootballDataRetryPolicy["sleep"]>,
) {
  if (!signal) {
    await sleep(delayMs);
    return;
  }
  if (signal.aborted) throw signal.reason;

  let removeAbortListener = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });
  try {
    await Promise.race([sleep(delayMs, signal), aborted]);
  } finally {
    removeAbortListener();
  }
}

export function footballDataHttpResponseCanBeCached(
  response: Pick<FootballDataHttpResponse<unknown>, "ok" | "status">,
) {
  return response.ok && response.status >= 200 && response.status < 300;
}

export async function footballDataFetchJson<T>(
  url: URL,
  init: FootballDataFetchInit<T>,
): Promise<FootballDataHttpResponse<T>> {
  if (init.enforcement === undefined) return fetchJsonCore(url, init);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort = () => {};
  let removeStopped = () => {};
  let closed = false;
  try {
    const { enforcement, ...provided } = init;
    if (!enforcement || typeof enforcement.beforeAttempt !== "function"
      || typeof enforcement.afterAttempt !== "function") return enforcementUnavailable();
    const snapshot = { ...provided, retry: provided.retry ? { ...provided.retry } : undefined };
    const total = snapshot.retry?.totalBudgetMs ?? snapshot.timeoutMs ?? footballDataTimeoutMs("background");
    if (!Number.isFinite(total) || total <= 0 || total > 2_147_483_647) return enforcementUnavailable();
    const now = snapshot.retry?.now ?? Date.now;
    const logicalStart = now(), monotonicStart = performance.now();
    if (!Number.isFinite(logicalStart)) return enforcementUnavailable();
    const state: EnforcementState<T> = {
      // Capture methods before awaiting; caller mutation cannot replace authority.
      port: { beforeAttempt: enforcement.beforeAttempt.bind(enforcement), afterAttempt: enforcement.afterAttempt.bind(enforcement) },
      signal: controller.signal,
      remaining() {
        const logicalNow = now();
        if (!Number.isFinite(logicalNow)) return 0;
        return total - Math.max(performance.now() - monotonicStart, logicalNow - logicalStart, 0);
      },
      assertCurrent() {
        if (closed || controller.signal.aborted || this.remaining() <= 0) throw new Error("ENFORCEMENT_STOPPED");
      },
    };
    const external = snapshot.signal;
    const stop = () => controller.abort();
    if (external?.aborted) return enforcementUnavailable();
    external?.addEventListener("abort", stop, { once: true });
    removeAbort = () => external?.removeEventListener("abort", stop);
    const stopped = new Promise<never>((_resolve, reject) => {
      const rejectStopped = () => reject(new Error("ENFORCEMENT_STOPPED"));
      controller.signal.addEventListener("abort", rejectStopped, { once: true });
      removeStopped = () => controller.signal.removeEventListener("abort", rejectStopped);
    });
    timer = setTimeout(stop, total);
    const work = fetchJsonCore(url, { ...snapshot, signal: controller.signal }, state);
    const result = await Promise.race([work, stopped]);
    state.assertCurrent();
    return result;
  } catch {
    return enforcementUnavailable();
  } finally {
    closed = true;
    if (timer) clearTimeout(timer);
    removeAbort();
    removeStopped();
    controller.abort();
  }
}

async function fetchJsonCore<T>(
  url: URL,
  init: FootballDataFetchInit<T>,
  enforcementState?: EnforcementState<T>,
): Promise<FootballDataHttpResponse<T>> {
  const {
    provider,
    timeoutMs = footballDataTimeoutMs("background"),
    retry,
    onAttemptCompleted,
    enforcement: _enforcement,
    signal: externalSignal,
    ...requestInit
  } = init;
  // Never forward this internal port to fetch, including malformed JS callers.
  void _enforcement;
  const retrySignal = externalSignal ?? undefined;
  const now = retry?.now ?? Date.now;
  const sleep = retry?.sleep ?? defaultRetrySleep;
  const random = retry?.random ?? Math.random;
  const maxAttempts = retry ? Math.max(1, Math.trunc(retry.maxAttempts ?? 3)) : 1;
  const totalBudgetMs = retry ? Math.max(1, Math.trunc(retry.totalBudgetMs)) : timeoutMs;
  const retryPolicy = {
    baseDelayMs: Math.max(0, Math.trunc(retry?.baseDelayMs ?? 100)),
    maxDelayMs: Math.max(0, Math.trunc(retry?.maxDelayMs ?? 1_000)),
    jitterRatio: Math.min(1, Math.max(0, retry?.jitterRatio ?? 0.2)),
  };
  const startedAt = now();
  let lastResponse: FootballDataHttpResponse<T> | undefined;
  let fetchesStarted = 0;

  if (retrySignal?.aborted) return abortedResponse(provider, retrySignal);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    enforcementState?.assertCurrent();
    if (retrySignal?.aborted) return abortedResponse(provider, retrySignal);
    let remainingBudgetMs = totalBudgetMs - (now() - startedAt);
    if (attempt > 1 && remainingBudgetMs <= 0) break;

    let token: string | undefined;
    if (enforcementState) {
      const admission = await enforcementState.port.beforeAttempt(Object.freeze({ attempt,
        signal: enforcementState.signal, remainingBudgetMs: enforcementState.remaining() }));
      enforcementState.assertCurrent();
      if (admission?.allowed === false && Object.keys(admission).length === 1 && fetchesStarted === 0) {
        return { ...enforcementUnavailable<T>(), requestDisposition: "deferred-before-http" };
      }
      if (!admission || admission.allowed !== true || typeof admission.token !== "string"
        || admission.token.length < 1 || admission.token.length > 512
        || admission.token.trim() !== admission.token || /[\u0000-\u001f\u007f]/.test(admission.token)) {
        throw new Error("ENFORCEMENT_DENIED");
      }
      token = admission.token;
      remainingBudgetMs = Math.min(totalBudgetMs - (now() - startedAt), enforcementState.remaining());
    }

    const controller = new AbortController();
    let timedOut = false;
    const forwardExternalAbort = () => controller.abort(retrySignal?.reason);
    if (retrySignal?.aborted) forwardExternalAbort();
    else retrySignal?.addEventListener("abort", forwardExternalAbort, { once: true });
    const attemptTimeoutMs = Math.max(1, Math.min(timeoutMs, remainingBudgetMs));
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`${provider} request timed out`));
    }, attemptTimeoutMs);

    try {
      fetchesStarted += 1;
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(requestInit.headers ?? {}),
        },
        next: { revalidate: 0 },
      });

      let data: T | undefined;
      let error: string | undefined;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        const text = await response.text();
        error = text.slice(0, 500);
      }
      lastResponse = {
        ok: response.ok,
        status: response.status,
        data,
        error,
        headers: response.headers,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastResponse = {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : `${provider} request failed`,
        headers: new Headers(),
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
      retrySignal?.removeEventListener("abort", forwardExternalAbort);
    }

    enforcementState?.assertCurrent();

    if (onAttemptCompleted) {
      try {
        const observation = Object.freeze({
          attempt,
          response: Object.freeze({
            ...lastResponse,
            data: structuredClone(lastResponse.data),
            headers: new Headers(lastResponse.headers),
          }),
        });
        // An observer cannot mutate the request result or Retry-After headers.
        // Neither synchronous failure nor asynchronous rejection changes retry.
        void Promise.resolve(onAttemptCompleted(observation)).catch(() => undefined);
      } catch {
        // Observation is best-effort; cloning/callback errors are not HTTP errors.
      }
    }

    if (enforcementState) {
      enforcementState.assertCurrent();
      const completion = await enforcementState.port.afterAttempt(Object.freeze({
        ...detachedAttempt(attempt, lastResponse), token: token!, signal: enforcementState.signal,
        remainingBudgetMs: enforcementState.remaining(),
      }));
      enforcementState.assertCurrent();
      if (!completion || completion.persisted !== true) throw new Error("ENFORCEMENT_NOT_PERSISTED");
    }

    if (
      lastResponse.ok
      || !retry
      || attempt >= maxAttempts
      || !responseIsRetryable(lastResponse, timedOut)
      || (retrySignal?.aborted && !timedOut)
    ) {
      return lastResponse;
    }

    const delayMs = retryDelayMs(attempt, lastResponse, retryPolicy, now(), random);
    const budgetAfterAttemptMs = Math.min(totalBudgetMs - (now() - startedAt), enforcementState?.remaining() ?? Infinity);
    if (delayMs >= budgetAfterAttemptMs) return lastResponse;
    if (retrySignal?.aborted) return abortedResponse(provider, retrySignal);
    try {
      await waitForRetryDelay(delayMs, retrySignal, sleep);
    } catch {
      if (retrySignal?.aborted) return abortedResponse(provider, retrySignal);
      return lastResponse;
    }
    if (retrySignal?.aborted) return abortedResponse(provider, retrySignal);
  }

  return lastResponse ?? {
    ok: false,
    status: 0,
    error: `${provider} request budget exhausted`,
    headers: new Headers(),
    fetchedAt: new Date().toISOString(),
  };
}

export function providerId(provider: FootballDataProviderName, id: string | number | undefined | null) {
  return `${provider}:${String(id ?? "unknown")}`;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function footballDataErrorHttpStatus(status: number | undefined, fallback = 502): number {
  if (Number.isInteger(status) && status !== undefined && status >= 400 && status <= 599) {
    return status;
  }
  return fallback;
}

export function resultOk<T>(
  provider: FootballDataProviderName,
  data: T,
  raw?: unknown,
  cached = false,
  fetchedAt = new Date().toISOString(),
) {
  return {
    ok: true as const,
    data,
    provider,
    cached,
    fetchedAt,
    raw,
  };
}

export function resultError(
  provider: FootballDataProviderName,
  code: FootballDataErrorCode,
  message: string,
  status?: number,
  details: {
    retryAfterSeconds?: number;
    remaining?: number;
    requestedEntity?: string;
  } = {},
) {
  return {
    ok: false as const,
    provider,
    fetchedAt: new Date().toISOString(),
    error: { provider, code, message, status, ...details },
  };
}
