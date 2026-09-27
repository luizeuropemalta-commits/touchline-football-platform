import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  parseTouchlineCanonicalProfileLink,
  touchlinePlayerProfileHref,
} from "../lib/touchlineArena/player-links.ts";

const CARD_ID = "123e4567-e89b-42d3-a456-426614174000";
const resolverSource = readFileSync(new URL("../lib/touchlineArena/canonical-public-player-profile-server.ts", import.meta.url), "utf8");
const resolverCode = stripTypeScriptTypes(resolverSource)
  .replace(/^import[^\n]*;\s*$/gm, "")
  .replace("export async function resolveTouchlineCanonicalPublicPlayerProfile", "async function resolveTouchlineCanonicalPublicPlayerProfile");

function canonicalResolver(input: {
  adminAvailable?: boolean;
  databaseError?: boolean;
  missingPlayer?: boolean;
  providerPlayerId?: string | null;
  projectionStatus?: "ready" | "error";
  projectionPlayerId?: string;
  currentClubStatus?: "verified" | "unavailable";
  membershipStatus?: "verified" | "unavailable";
  published?: boolean;
} = {}) {
  const reads: Array<{ column: string; value: unknown }> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "football_players");
      const response = {
        data: input.missingPlayer ? null : { id: CARD_ID, provider_player_id: input.providerPlayerId === undefined ? "987" : input.providerPlayerId },
        error: input.databaseError ? new Error("database unavailable") : null,
      };
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { reads.push({ column, value }); return query; },
        maybeSingle: async () => response,
      };
      return query;
    },
  };
  const resolve = runInNewContext(`${resolverCode}\nresolveTouchlineCanonicalPublicPlayerProfile;`, {
    createAdminClient: () => input.adminAvailable === false ? null : admin,
    loadTouchlinePublicPlayerProjections: async () => ({
      status: input.projectionStatus ?? "ready",
      projections: [{
        providerPlayerId: "987",
        identity: { status: "verified", value: { playerId: input.projectionPlayerId ?? CARD_ID, name: "Erling Haaland" } },
        currentClub: { status: input.currentClubStatus ?? "verified", value: { competitionProviderId: "8" } },
        membership: { status: input.membershipStatus ?? "verified", value: { position: "Centre Forward" } },
      }],
    }),
    loadTouchlinePublishedCardPresentations: async () => input.published === false ? new Map() : new Map([[CARD_ID, { tierKey: "diamond-gold" }]]),
    Promise,
  }, { timeout: 1000 }) as (value: { canonicalPlayerId: string }) => Promise<unknown>;
  return { reads, resolve };
}

test("published card links carry the opaque canonical selector without a provider id", () => {
  const href = touchlinePlayerProfileHref({
    canonicalPlayerId: CARD_ID,
    name: "Erling Haaland",
    clubName: "Manchester City",
  }, "pt-BR");
  const url = new URL(href, "https://touchline.test");
  assert.equal(url.searchParams.get("cardId"), CARD_ID);
  assert.equal(url.searchParams.get("playerId"), null);
});

test("Gameweek emits the canonical selector only from an editorial presentation", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
  assert.match(source, /canonicalPlayerId: card\.editorialCard \? exact\.canonicalPlayerId : null/);
});

test("canonical selector fails closed for invalid, conflicting, and distinct repeated values", () => {
  assert.deepEqual(parseTouchlineCanonicalProfileLink({}), { status: "absent" });
  assert.deepEqual(parseTouchlineCanonicalProfileLink({ cardId: CARD_ID.toUpperCase() }), {
    status: "valid", canonicalPlayerId: CARD_ID,
  });
  for (const searchParams of [
    { cardId: "haaland" },
    { cardId: ` ${CARD_ID}` },
    { cardId: [CARD_ID] },
    { cardId: [CARD_ID, CARD_ID] },
    { cardId: [CARD_ID, "123e4567-e89b-42d3-a456-426614174001"] },
    { cardId: CARD_ID, playerId: "123" },
  ]) assert.deepEqual(parseTouchlineCanonicalProfileLink(searchParams), { status: "invalid" });
});

test("canonical resolver is UUID-bound and requires public projection plus publication gates", () => {
  const source = resolverSource;
  assert.match(source, /\.eq\("id", playerId\)/);
  assert.match(source, /\.eq\("provider", "sportmonks"\)/);
  assert.match(source, /loadTouchlinePublicPlayerProjections/);
  assert.match(source, /identityValue\.playerId\.trim\(\)\.toLowerCase\(\) !== playerId/);
  assert.match(source, /projection\.currentClub\.status !== "verified"/);
  assert.match(source, /projection\.membership\.status !== "verified"/);
  assert.match(source, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(source, /resolveTouchLinePlayerProfile|requestedName/);
});

test("canonical resolver reads the exact UUID and fails closed on projection or publication mismatch", async () => {
  const valid = canonicalResolver();
  assert.deepEqual(JSON.parse(JSON.stringify(await valid.resolve({ canonicalPlayerId: CARD_ID }))), {
    canonicalPlayerId: CARD_ID,
    providerPlayerId: "987",
    projection: {
      providerPlayerId: "987",
      identity: { status: "verified", value: { playerId: CARD_ID, name: "Erling Haaland" } },
      currentClub: { status: "verified", value: { competitionProviderId: "8" } },
      membership: { status: "verified", value: { position: "Centre Forward" } },
    },
    editorialCard: { tierKey: "diamond-gold" },
  });
  assert.deepEqual(valid.reads, [
    { column: "id", value: CARD_ID },
    { column: "provider", value: "sportmonks" },
  ]);

  assert.equal(await canonicalResolver({ projectionPlayerId: "123e4567-e89b-42d3-a456-426614174001" }).resolve({ canonicalPlayerId: CARD_ID }), null);
  assert.equal(await canonicalResolver({ published: false }).resolve({ canonicalPlayerId: CARD_ID }), null);
  for (const input of [
    { adminAvailable: false },
    { databaseError: true },
    { missingPlayer: true },
    { providerPlayerId: "not-a-provider-id" },
    { projectionStatus: "error" as const },
    { currentClubStatus: "unavailable" as const },
    { membershipStatus: "unavailable" as const },
  ]) assert.equal(await canonicalResolver(input).resolve({ canonicalPlayerId: CARD_ID }), null, JSON.stringify(input));
});
