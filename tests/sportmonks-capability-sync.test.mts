import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { TouchlineProviderCapabilities } from "../lib/football-data/types.ts";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { syncSportmonksProviderCapabilities } = await import("../lib/football-data/capability-sync.ts");

const capabilities: TouchlineProviderCapabilities = {
  provider: "sportmonks",
  fetchedAt: "2026-08-19T12:00:00.000Z",
  resources: [
    { id: "fixtures", name: "Fixtures", available: true },
    { id: "lineups", endpoint: "lineups", available: true },
    { id: "odds", name: "Odds", available: false },
  ],
  enrichments: [
    { id: "events", name: "Events" },
    { id: "facts", name: "Match Facts", available: false },
  ],
};

test("capability sync persists the provider contract and returns only available labels", async () => {
  let persisted: TouchlineProviderCapabilities | null = null;
  const result = await syncSportmonksProviderCapabilities({
    provider: { getSubscriptionCapabilities: async () => ({ ok: true, provider: "sportmonks", data: capabilities, fetchedAt: capabilities.fetchedAt }) },
    persist: async (value) => {
      persisted = value;
      return { persisted: true };
    },
  });

  assert.equal(persisted, capabilities);
  assert.equal(result.ok, true);
  assert.equal(result.resourceCount, 3);
  assert.equal(result.enrichmentCount, 2);
  assert.deepEqual(result.availableResources, ["Fixtures", "lineups"]);
  assert.deepEqual(result.availableEnrichments, ["Events"]);
  assert.deepEqual(result.errors, []);
});

test("capability sync never persists a rejected provider entitlement response", async () => {
  let persistenceCalls = 0;
  const result = await syncSportmonksProviderCapabilities({
    provider: {
      getSubscriptionCapabilities: async () => ({
        ok: false as const,
        provider: "sportmonks" as const,
        fetchedAt: "2026-08-19T12:00:00.000Z",
        error: { provider: "sportmonks" as const, code: "provider_error" as const, message: "Sportmonks denied the resource." },
      }),
    },
    persist: async () => {
      persistenceCalls += 1;
      return { persisted: true };
    },
  });

  assert.equal(persistenceCalls, 0);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["Sportmonks denied the resource."]);
});
