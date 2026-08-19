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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedProvider(
  mockFetch: typeof fetch,
  run: (provider: InstanceType<typeof SportmonksFootballProvider>) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  const originalBaseUrl = process.env.SPORTMONKS_BASE_URL;

  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = "pagination-test-token";
  process.env.SPORTMONKS_BASE_URL = "https://api.sportmonks.test/v3/football";
  globalThis.fetch = mockFetch;

  try {
    await run(new SportmonksFootballProvider());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    if (originalBaseUrl === undefined) delete process.env.SPORTMONKS_BASE_URL;
    else process.env.SPORTMONKS_BASE_URL = originalBaseUrl;
    clearFootballDataCache();
  }
}

test("the non-paginated squad endpoint preserves more than 25 members", async () => {
  const requestedUrls: URL[] = [];
  const players = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    display_name: `Player ${index + 1}`,
    position: { id: 25, name: "Midfielder" },
  }));

  await withMockedProvider((async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requestedUrls.push(url);
    if (url.pathname.endsWith("/extended")) return jsonResponse({ data: players });
    return jsonResponse({
      data: players.map((player, index) => ({
        id: 1_000 + index,
        player_id: player.id,
        jersey_number: index + 1,
        player,
        position: { id: 25, name: "Midfielder" },
      })),
    });
  }) as typeof fetch, async (provider) => {
    const result = await provider.getSquad("9");

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.length, 30);
    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls.every((url) => !url.searchParams.has("page")));
  });
});

test("the extended squad relation preserves provider nationality and country for canonical persistence", async () => {
  await withMockedProvider((async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/extended")) {
      return jsonResponse({
        data: [{
          id: 9001,
          player_id: 101,
          player: { id: 101, display_name: "Provider Player" },
          nationality: { id: 56, name: "England" },
          nationality_id: 56,
        }],
      });
    }
    return jsonResponse({
      data: [{
        id: 5001,
        player_id: 101,
        jersey_number: 7,
        player: { id: 101, display_name: "Provider Player" },
        position: { id: 25, name: "Midfielder" },
      }],
    });
  }) as typeof fetch, async (provider) => {
    const result = await provider.getSquad("9");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.player.nationality, "England");
    assert.equal(result.data[0]?.player.countryId, "56");
  });
});

test("player search follows has_more until the requested limit exceeds the first 25 results", async () => {
  const requestedPages: number[] = [];

  await withMockedProvider((async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    const start = page === 1 ? 1 : 26;
    const count = page === 1 ? 25 : 15;
    return jsonResponse({
      data: Array.from({ length: count }, (_, index) => ({
        id: start + index,
        display_name: `Search Player ${start + index}`,
      })),
      pagination: {
        count,
        per_page: 40,
        current_page: page,
        has_more: page === 1,
      },
    });
  }) as typeof fetch, async (provider) => {
    const result = await provider.searchPlayers({ query: "Search Player", limit: 40 });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.length, 40);
    assert.deepEqual(requestedPages, [1, 2]);
  });
});

test("competition pagination is capped even if has_more never becomes false", async () => {
  const requestedPages: number[] = [];

  await withMockedProvider((async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    return jsonResponse({
      data: [{ id: page, name: `League ${page}` }],
      pagination: {
        count: 1,
        per_page: 50,
        current_page: page,
        has_more: true,
      },
    });
  }) as typeof fetch, async (provider) => {
    const result = await provider.getCompetitions();

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.length, 4);
    assert.deepEqual(requestedPages, [1, 2, 3, 4]);
  });
});

test("a repeated provider page stops pagination without duplicating its items", async () => {
  let requestCount = 0;

  await withMockedProvider((async () => {
    requestCount += 1;
    return jsonResponse({
      data: [{ id: 7, display_name: "Repeated Player" }],
      pagination: {
        count: 1,
        per_page: 50,
        current_page: 1,
        has_more: true,
      },
    });
  }) as typeof fetch, async (provider) => {
    const result = await provider.searchPlayers({ query: "Repeated", limit: 100 });

    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data.map((player) => player.providerId), ["7"]);
    assert.equal(requestCount, 2);
  });
});

test("a later-page rate limit preserves providerFailure semantics", async () => {
  let requestCount = 0;

  await withMockedProvider((async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return jsonResponse({
        data: [{ id: 8, name: "First League" }],
        pagination: { current_page: 1, has_more: true },
      });
    }
    return jsonResponse({
      message: "rate limited",
      rate_limit: { remaining: 0, resets_in_seconds: 9, requested_entity: "leagues" },
    }, 429);
  }) as typeof fetch, async (provider) => {
    const result = await provider.getCompetitions();

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "rate_limited");
      assert.equal(result.error.remaining, 0);
      assert.equal(result.error.retryAfterSeconds, 9);
      assert.equal(result.error.requestedEntity, "leagues");
    }
    assert.equal(requestCount, 2);
  });
});
