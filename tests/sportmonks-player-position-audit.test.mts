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

test("Sportmonks bulk player audit requests and returns detailed positions without exposing a token", async () => {
  clearFootballDataCache();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  let observedUrl: URL | null = null;

  process.env.SPORTMONKS_API_TOKEN = "position-audit-token";
  globalThis.fetch = (async (input) => {
    observedUrl = new URL(String(input));
    return new Response(JSON.stringify({
      data: [{
        id: 37701999,
        display_name: "Estêvão",
        position_id: 27,
        detailed_position_id: 156,
        position: { id: 27, name: "Attacker" },
        detailedPosition: { id: 156, name: "Right Wing" },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await new SportmonksFootballProvider().getPlayersByIds(["37701999"]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data[0]?.position, "Right Wing");
    assert.equal((result.data[0]?.source.raw as Record<string, unknown>).detailed_position_id, 156);
    assert.equal(observedUrl?.searchParams.get("filters"), "playerIds:37701999");
    assert.equal(observedUrl?.searchParams.get("include"), "position;detailedPosition");
    assert.equal(observedUrl?.searchParams.get("api_token"), "position-audit-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    clearFootballDataCache();
  }
});
