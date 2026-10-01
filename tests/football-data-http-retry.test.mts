import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { footballDataFetchJson } from "../lib/football-data/http.ts";

const originalFetch = globalThis.fetch;

test("completed-attempt observer sees 429 and success before retry decisions", async () => {
  const order: string[] = [];
  const observed: Array<{ attempt: number; status: number; fetchedAt: string }> = [];
  const retry = testRetryPolicy();
  let calls = 0;
  globalThis.fetch = (async (_url, init) => {
    assert.equal(Object.hasOwn(init ?? {}, "onAttemptCompleted"), false);
    calls += 1;
    order.push(`fetch:${calls}`);
    return jsonResponse(calls === 1 ? 429 : 200, { "Retry-After": "2" });
  }) as typeof fetch;

  const result = await footballDataFetchJson<{ status: number }>(
    new URL("https://sportmonks.test/observed-retry"),
    {
      provider: "sportmonks",
      retry: {
        ...retry.policy,
        sleep: async (delayMs) => {
          order.push("sleep");
          await retry.policy.sleep(delayMs);
        },
      },
      onAttemptCompleted: ({ attempt, response }) => {
        order.push(`observe:${attempt}`);
        observed.push({ attempt, status: response.status, fetchedAt: response.fetchedAt });
        // Deliberate observer mutation must not alter retries or returned data.
        response.headers.set("Retry-After", "999");
        if (response.data) response.data.status = 999;
      },
    },
  );

  assert.deepEqual(order, ["fetch:1", "observe:1", "sleep", "fetch:2", "observe:2"]);
  assert.deepEqual(observed.map(({ attempt, status }) => [attempt, status]), [[1, 429], [2, 200]]);
  assert.deepEqual(retry.waits, [2_000]);
  assert.deepEqual(result.data, { status: 200 });
  assert.equal(result.headers.get("Retry-After"), "2");
  assert.equal(observed[1]?.fetchedAt, result.fetchedAt);
  assert.ok(observed.every(({ fetchedAt }) => Number.isFinite(Date.parse(fetchedAt))));
});

test("throwing and rejected observers preserve the no-observer retry outcome", async () => {
  for (const mode of ["absent", "throw", "reject", "pending"] as const) {
    const retry = testRetryPolicy();
    let calls = 0;
    let observations = 0;
    globalThis.fetch = (async (_url, init) => {
      assert.equal(Object.hasOwn(init ?? {}, "onAttemptCompleted"), false);
      assert.equal(Object.hasOwn(init ?? {}, "retry"), false);
      calls += 1;
      return jsonResponse(calls === 1 ? 429 : 200, { "Retry-After": "1" });
    }) as typeof fetch;

    const result = await footballDataFetchJson<{ status: number }>(
      new URL("https://sportmonks.test/observer-isolation"),
      {
        provider: "sportmonks",
        retry: retry.policy,
        ...(mode === "absent" ? {} : {
          onAttemptCompleted: () => {
            observations += 1;
            if (mode === "throw") throw new Error("observer private failure");
            if (mode === "reject") return Promise.reject(new Error("observer private rejection"));
            return new Promise<void>(() => {});
          },
        }),
      },
    );
    // Let a rejected callback settle; node:test also detects unhandled rejection.
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(result.ok, true, mode);
    assert.equal(result.status, 200, mode);
    assert.deepEqual(result.data, { status: 200 }, mode);
    assert.equal(result.error, undefined, mode);
    assert.equal(calls, 2, mode);
    assert.equal(observations, mode === "absent" ? 0 : 2, mode);
    assert.deepEqual(retry.waits, [1_000], mode);
  }
});

test("observer reports a completed transport failure but not a pre-request abort", async () => {
  let calls = 0;
  const observed: Array<{ attempt: number; status: number; fetchedAt: string }> = [];
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("network unavailable");
  }) as typeof fetch;
  const onAttemptCompleted = ({ attempt, response }: {
    attempt: number;
    response: { status: number; fetchedAt: string };
  }) => { observed.push({ attempt, status: response.status, fetchedAt: response.fetchedAt }); };
  const result = await footballDataFetchJson(new URL("https://sportmonks.test/observe-failure"), {
    provider: "sportmonks",
    onAttemptCompleted,
  });
  assert.equal(result.status, 0);
  assert.equal(result.error, "network unavailable");
  assert.deepEqual(observed, [{ attempt: 1, status: 0, fetchedAt: result.fetchedAt }]);

  const controller = new AbortController();
  controller.abort();
  await footballDataFetchJson(new URL("https://sportmonks.test/pre-abort"), {
    provider: "sportmonks",
    signal: controller.signal,
    onAttemptCompleted,
  });
  assert.equal(calls, 1);
  assert.equal(observed.length, 1);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({ status }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function testRetryPolicy(overrides: Record<string, unknown> = {}) {
  let now = 1_800_000_000_000;
  const waits: number[] = [];
  return {
    waits,
    policy: {
      maxAttempts: 3,
      totalBudgetMs: 10_000,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitterRatio: 0,
      now: () => now,
      sleep: async (delayMs: number) => {
        waits.push(delayMs);
        now += delayMs;
      },
      random: () => 0.5,
      ...overrides,
    },
  };
}

test("retries a 503 and returns the succeeding SportMonks response", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(503) : jsonResponse(200);
  }) as typeof fetch;
  const retry = testRetryPolicy();

  const result = await footballDataFetchJson<{ status: number }>(new URL("https://sportmonks.test/fixtures"), {
    provider: "sportmonks",
    timeoutMs: 500,
    retry: retry.policy,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data?.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(retry.waits, [100]);
});

test("honours Retry-After delta-seconds before retrying a 429", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(429, { "retry-after": "3" }) : jsonResponse(200);
  }) as typeof fetch;
  const retry = testRetryPolicy();

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/rate-limit"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(retry.waits, [3_000]);
});

test("honours Retry-After HTTP-date before retrying a 429", async () => {
  let calls = 0;
  const retry = testRetryPolicy();
  const retryAt = new Date(1_800_000_004_000).toUTCString();
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(429, { "retry-after": retryAt }) : jsonResponse(200);
  }) as typeof fetch;

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/rate-limit-date"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(retry.waits, [4_000]);
});

test("does not retry permanent 4xx responses", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(422);
  }) as typeof fetch;
  const retry = testRetryPolicy();

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/invalid"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.status, 422);
  assert.equal(calls, 1);
  assert.deepEqual(retry.waits, []);
});

test("keeps retries opt-in when the HTTP caller omits a retry policy", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(503);
  }) as typeof fetch;

  const result = await footballDataFetchJson(new URL("https://another-provider.test/temporary"), {
    provider: "sportmonks",
  });

  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

test("does not retry an unrelated transport failure", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("network unavailable");
  }) as typeof fetch;
  const retry = testRetryPolicy();

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/network"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /network unavailable/);
  assert.equal(calls, 1);
  assert.deepEqual(retry.waits, []);
});

test("retries an attempt that reaches its request timeout", async () => {
  let calls = 0;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    if (calls === 2) return Promise.resolve(jsonResponse(200));
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }) as typeof fetch;
  const retry = testRetryPolicy({ baseDelayMs: 1 });

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/timeout"), {
    provider: "sportmonks",
    timeoutMs: 20,
    retry: retry.policy,
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(retry.waits, [1]);
});

test("returns the final retryable failure after attempts are exhausted", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(503);
  }) as typeof fetch;
  const retry = testRetryPolicy({ maxAttempts: 3 });

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/exhausted"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(calls, 3);
  assert.deepEqual(retry.waits, [100, 200]);
});

test("uses stable deterministic jitter for the same request and attempt", async () => {
  const observedRuns: number[][] = [];

  for (let run = 0; run < 2; run += 1) {
    globalThis.fetch = (async () => jsonResponse(503)) as typeof fetch;
    const retry = testRetryPolicy({ maxAttempts: 3, jitterRatio: 0.25, random: () => 0.75 });
    await footballDataFetchJson(new URL("https://sportmonks.test/jitter"), {
      provider: "sportmonks",
      retry: retry.policy,
    });
    observedRuns.push(retry.waits);
  }

  assert.deepEqual(observedRuns[0], observedRuns[1]);
  assert.notDeepEqual(observedRuns[0], [100, 200]);
  assert.ok(observedRuns[0]!.every((delay, index) => {
    const base = 100 * (2 ** index);
    return delay >= base * 0.75 && delay <= base * 1.25;
  }));
});

test("uses per-operation entropy while keeping jitter within its configured cap", async () => {
  const waits: number[] = [];
  for (const randomValue of [0, 1]) {
    globalThis.fetch = (async () => jsonResponse(503)) as typeof fetch;
    const retry = testRetryPolicy({
      maxAttempts: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 1_000,
      jitterRatio: 0.5,
      random: () => randomValue,
    });
    await footballDataFetchJson(new URL("https://sportmonks.test/entropy"), {
      provider: "sportmonks",
      retry: retry.policy,
    });
    waits.push(retry.waits[0]!);
  }
  assert.deepEqual(waits, [500, 1_000]);
});

test("does not begin a retry whose wait would exceed the total budget", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(429, { "retry-after": "5" });
  }) as typeof fetch;
  const retry = testRetryPolicy({ totalBudgetMs: 4_999 });

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/budget"), {
    provider: "sportmonks",
    retry: retry.policy,
  });

  assert.equal(result.status, 429);
  assert.equal(calls, 1);
  assert.deepEqual(retry.waits, []);
});

test("counts time spent fetching against the total retry budget", async () => {
  let calls = 0;
  let now = 2_000;
  globalThis.fetch = (async () => {
    calls += 1;
    now += 950;
    return jsonResponse(503);
  }) as typeof fetch;
  const waits: number[] = [];

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/fetch-budget"), {
    provider: "sportmonks",
    retry: {
      maxAttempts: 3,
      totalBudgetMs: 1_000,
      baseDelayMs: 100,
      jitterRatio: 0,
      now: () => now,
      sleep: async (delayMs) => { waits.push(delayMs); },
    },
  });

  assert.equal(result.status, 503);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("falls back to normal backoff for invalid or past Retry-After values", async () => {
  for (const retryAfter of ["not-a-date", new Date(1_799_999_999_000).toUTCString()]) {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(429, { "retry-after": retryAfter }) : jsonResponse(200);
    }) as typeof fetch;
    const retry = testRetryPolicy();

    const result = await footballDataFetchJson(new URL("https://sportmonks.test/stale-retry-after"), {
      provider: "sportmonks",
      retry: retry.policy,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(retry.waits, [100]);
  }
});

test("returns timeout from the final allowed attempt without starting another one", async () => {
  let calls = 0;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }) as typeof fetch;
  const retry = testRetryPolicy({ maxAttempts: 2, baseDelayMs: 1 });

  const result = await footballDataFetchJson(new URL("https://sportmonks.test/final-timeout"), {
    provider: "sportmonks",
    timeoutMs: 10,
    retry: retry.policy,
  });

  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /timed out/i);
  assert.equal(calls, 2);
  assert.deepEqual(retry.waits, [1]);
});

test("active request cancellation is returned immediately and never retried", async () => {
  let calls = 0;
  const controller = new AbortController();
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }) as typeof fetch;
  const retry = testRetryPolicy();
  const pending = footballDataFetchJson(new URL("https://sportmonks.test/cancel-active"), {
    provider: "sportmonks",
    signal: controller.signal,
    retry: retry.policy,
  });
  controller.abort(new Error("caller cancelled"));

  const result = await pending;
  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /caller cancelled/);
  assert.equal(calls, 1);
  assert.deepEqual(retry.waits, []);
});

test("cancellation during backoff interrupts the wait and prevents another attempt", async () => {
  let calls = 0;
  let backoffStarted!: () => void;
  const backoff = new Promise<void>((resolve) => { backoffStarted = resolve; });
  const controller = new AbortController();
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(503);
  }) as typeof fetch;

  const pending = footballDataFetchJson(new URL("https://sportmonks.test/cancel-backoff"), {
    provider: "sportmonks",
    signal: controller.signal,
    retry: {
      maxAttempts: 3,
      totalBudgetMs: 10_000,
      baseDelayMs: 1_000,
      jitterRatio: 0,
      sleep: async () => {
        backoffStarted();
        await new Promise(() => {});
      },
    },
  });
  await backoff;
  controller.abort(new Error("cancelled in backoff"));

  const result = await pending;
  assert.equal(result.status, 0);
  assert.match(result.error ?? "", /cancelled in backoff/);
  assert.equal(calls, 1);
});
