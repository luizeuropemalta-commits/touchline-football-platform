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

test("Sportmonks squad audit requests nested player detailed positions without exposing a token", async () => {
  clearFootballDataCache();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  const observedUrls: URL[] = [];

  process.env.SPORTMONKS_API_TOKEN = "position-audit-token";
  globalThis.fetch = (async (input) => {
    const observedUrl = new URL(String(input));
    observedUrls.push(observedUrl);
    if (observedUrl.pathname.endsWith("/extended")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: [{
        player: {
          id: 37701999,
          display_name: "Estêvão",
          position_id: 27,
          detailed_position_id: 156,
          position: { id: 27, name: "Attacker" },
          detailedPosition: { id: 156, name: "Right Wing" },
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await new SportmonksFootballProvider().getSquad("18");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data[0]?.player.position, "Right Wing");
    assert.equal(result.data[0]?.player.broadPosition, "Attacker");
    assert.equal(result.data[0]?.player.broadPositionId, "27");
    assert.equal(result.data[0]?.player.detailedPosition, "Right Wing");
    assert.equal(result.data[0]?.player.detailedPositionId, "156");
    assert.equal(result.data[0]?.broadPosition, "Attacker");
    assert.equal(result.data[0]?.detailedPosition, "Right Wing");
    const rawPlayer = (result.data[0]?.raw as Record<string, unknown>).player as Record<string, unknown>;
    assert.equal(rawPlayer.detailed_position_id, 156);
    const squadUrl = observedUrls.find((url) => !url.pathname.endsWith("/extended"));
    assert.match(squadUrl?.searchParams.get("include") ?? "", /player\.detailedPosition/);
    assert.ok(observedUrls.every((url) => url.searchParams.get("api_token") === "position-audit-token"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    clearFootballDataCache();
  }
});
