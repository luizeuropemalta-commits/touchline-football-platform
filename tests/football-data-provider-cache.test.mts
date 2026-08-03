import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { clearFootballDataCache } from "../lib/football-data/cache.ts";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");

test("Sportmonks retries failed responses and keeps the successful response fetch time", async () => {
  clearFootballDataCache();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  let requestCount = 0;

  process.env.SPORTMONKS_API_TOKEN = "test-token";
  globalThis.fetch = (async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(JSON.stringify({
        message: "rate limited",
        rate_limit: { remaining: 0, resets_in_seconds: 12, requested_entity: "players" },
      }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: { id: 7, display_name: "Touchline Player" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const provider = new SportmonksFootballProvider();
    const failed = await provider.getPlayerById("7");
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.error.code, "rate_limited");
      assert.equal(failed.error.remaining, 0);
      assert.equal(failed.error.retryAfterSeconds, 12);
      assert.equal(failed.error.requestedEntity, "players");
    }

    const loaded = await provider.getPlayerById("7");
    assert.equal(loaded.ok, true);
    assert.equal(loaded.cached, false);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const cached = await provider.getPlayerById("7");
    assert.equal(cached.ok, true);
    assert.equal(cached.cached, true);
    assert.equal(cached.fetchedAt, loaded.fetchedAt);
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    clearFootballDataCache();
  }
});

test("Sportmonks classifies entitlement, missing-resource, and invalid-request failures", async () => {
  clearFootballDataCache();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  const responses = [
    { status: 403, code: "provider_error", message: /subscribed league and feature entitlement/i },
    { status: 404, code: "not_found", message: /not available/i },
    { status: 422, code: "invalid_request", message: /invalid filter/i },
  ] as const;
  let index = 0;

  process.env.SPORTMONKS_API_TOKEN = "test-token";
  globalThis.fetch = (async () => {
    const response = responses[index++]!;
    return new Response(JSON.stringify({
      message: response.status === 404 ? "Resource not available" : "Invalid filter",
    }), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const provider = new SportmonksFootballProvider();
    for (let responseIndex = 0; responseIndex < responses.length; responseIndex += 1) {
      const expected = responses[responseIndex]!;
      const result = await provider.getPlayerById(String(100 + responseIndex));
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.status, expected.status);
        assert.equal(result.error.code, expected.code);
        assert.match(result.error.message, expected.message);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    clearFootballDataCache();
  }
});
