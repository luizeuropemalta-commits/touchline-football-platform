import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sanitizeProviderPayloadForPersistence } from "../lib/football-data/provider-payload-sanitize.ts";

const fantasyStore = await readFile(
  new URL("../lib/football-data/fantasy-store.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../supabase/migrations/030_sportmonks_persistence_server_boundary.sql", import.meta.url),
  "utf8",
);

test("deep persistence sanitization removes raw data, credentials and provider media without mutation", () => {
  const previousToken = process.env.SPORTMONKS_API_TOKEN;
  process.env.SPORTMONKS_API_TOKEN = "private-sportmonks-token";

  const payload = {
    fixture: {
      id: "fixture-1",
      provider: "sportmonks",
      providerId: "1",
      logoUrl: "https://cdn.sportmonks.com/images/teams/9.png",
      source: {
        provider: "sportmonks",
        providerId: "1",
        raw: {
          api_token: "private-sportmonks-token",
          image_path: "https://cdn.sportmonks.com/images/players/1.png",
        },
      },
    },
    lineups: [{ playerName: "Safe Player", raw_data: { licensed: true } }],
    capabilities: [{ name: "Scores", token: "private-sportmonks-token" }],
    arbitraryProviderMedia: "https://cdn.sportmonks.com/images/leagues/8.png",
    localAsset: "/touchlineArena/shared/club-logos/2026-27/manchester-city.png",
  };

  try {
    const sanitized = sanitizeProviderPayloadForPersistence(payload);
    const serialized = JSON.stringify(sanitized);

    assert.equal(sanitized.fixture.id, "fixture-1");
    assert.equal(sanitized.fixture.source.providerId, "1");
    assert.equal(sanitized.lineups[0].playerName, "Safe Player");
    assert.equal(sanitized.localAsset, payload.localAsset);
    assert.doesNotMatch(
      serialized,
      /private-sportmonks-token|raw_data|"raw"|image_path|logoUrl|sportmonks\.com/i,
    );

    assert.ok(payload.fixture.source.raw);
    assert.equal(payload.fixture.logoUrl, "https://cdn.sportmonks.com/images/teams/9.png");
  } finally {
    if (previousToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = previousToken;
  }
});

test("fixture feeds and provider capabilities are sanitized before every upsert", () => {
  assert.match(
    fantasyStore,
    /const sanitizedFeed = sanitizeProviderPayloadForPersistence\(feed\)/,
  );
  assert.match(fantasyStore, /fixture_payload: sanitizedFeed\.fixture/);
  assert.match(fantasyStore, /lineups_payload: sanitizedFeed\.lineups/);
  assert.match(fantasyStore, /events_payload: sanitizedFeed\.events/);
  assert.match(
    fantasyStore,
    /const sanitizedCapabilities = sanitizeProviderPayloadForPersistence\(capabilities\)/,
  );
  assert.match(fantasyStore, /resources_payload: sanitizedCapabilities\.resources/);
  assert.match(fantasyStore, /enrichments_payload: sanitizedCapabilities\.enrichments/);
  assert.doesNotMatch(fantasyStore, /fixture_payload: feed\.|resources_payload: capabilities\./);
  assert.match(fantasyStore, /provisional-schema-unavailable/);
});

test("forward migration removes browser policies and grants while preserving service-role access", () => {
  assert.match(migration, /from pg_policies/);
  assert.match(
    migration,
    /tablename in \([\s\S]*?'football_fantasy_fixture_feeds'[\s\S]*?'football_provider_capabilities'/,
  );
  assert.match(
    migration,
    /revoke all privileges[\s\S]*?football_fantasy_fixture_feeds[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all privileges[\s\S]*?football_provider_capabilities[\s\S]*?from public, anon, authenticated/,
  );
  assert.equal((migration.match(/to service_role;/g) || []).length, 2);
  assert.doesNotMatch(migration, /grant\s+select[\s\S]*?to\s+authenticated/i);
});
