import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as editorial from "../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import * as compatibility from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";

const source = readFileSync(
  new URL("../lib/touchlineArena/card-publication-read-model.ts", import.meta.url),
  "utf8",
);
const squadRoute = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);

test("publication rejects a membership belonging to another requested player", async () => {
  const first = "10000000-0000-4000-8000-000000000001";
  const second = "10000000-0000-4000-8000-000000000002";
  const competition = "20000000-0000-4000-8000-000000000001";
  const club = "30000000-0000-4000-8000-000000000001";
  const membership = "40000000-0000-4000-8000-000000000001";
  const exported: Record<string, unknown> = {};
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Same realm preserves the real editorial parser's plain-object validation.
  vm.runInThisContext(`(function(exports, require) { ${javascript}\n })`)(exported, (id: string) => {
    if (id === "server-only") return {};
    if (id === "next/cache") return { unstable_noStore() {} };
    if (id === "@/lib/supabase/admin") return { createAdminClient() { throw Error("No database access allowed"); } };
    if (id === "./editorial-card-profile.ts") return editorial;
    if (id === "./card-engine-provisional-policy.ts") return provisional;
    if (id === "./card-engine-provisional-schema-compat.ts") return compatibility;
    throw Error(`Unexpected import ${id}`);
  });
  const read = exported.loadTouchlinePublishedCardPresentations as (input: unknown) => Promise<Map<string, unknown>>;
  async function load(memberOwner: string, requiredScope?: unknown, requiredBindings?: unknown, duringRead?: () => void) {
    const tables: Record<string, Record<string, unknown>[]> = {
      touchline_card_publications: [{ player_id: first, current_membership_id: membership, competition_id: competition, effective_season: "2026-27", publication_status: "published", calculated_tier: "ruby-red", calculated_nominal_price_gbp: 10, last_reviewed_at: "2026-10-01T10:00:00Z" }],
      football_player_market_values: [{ player_id: first, market_value_eur: 2500000, verified_season: "2026-27", status: "verified", confidence: "verified" }],
      football_players: [{ id: first, current_club_id: club }, { id: second, current_club_id: club }],
      football_squad_members: [{ id: membership, player_id: memberOwner, club_id: club, competition_id: competition, status: "active", jersey_number: 13 }],
      touchline_card_editorial_overrides: [],
    };
    // Both players are actually published, so the batched membership query
    // can legitimately return the other player's row.
    tables.touchline_card_publications!.push({ ...tables.touchline_card_publications![0], player_id: second });
    tables.football_player_market_values!.push({ ...tables.football_player_market_values![0], player_id: second });
    return read({ playerIds: [first, second], requiredScope, requiredBindings, providedAdmin: { from(table: string) {
      assert.ok(Object.hasOwn(tables, table));
      let selected = tables[table]!;
      let columns: string[] = [];
      const query = {
        select(value: string) { columns = value.split(","); return query; },
        eq(key: string, value: unknown) { selected = selected.filter(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { selected = selected.filter(row => values.includes(row[key])); return query; },
        then(resolve: (value: unknown) => unknown) {
          duringRead?.();
          const data = selected.map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    } } });
  }
  assert.equal((await load(first)).has(first), true, "Valid publication must remain visible");
  assert.equal((await load(second)).has(first), false, "Another player's active membership cannot authorize this card");
  assert.equal((await load(first, { competitionId: competition, effectiveSeason: "2026-27" })).has(first), true);
  assert.equal((await load(first, { competitionId: competition, effectiveSeason: "2025-26" })).size, 0, "A previous season cannot authorize an award now");
  assert.equal((await load(first, { competitionId: second, effectiveSeason: "2026-27" })).size, 0, "A different competition cannot authorize this card");
  for (const invalid of [null, {}, { competitionId: "league", effectiveSeason: "2026-27" }, { competitionId: competition, effectiveSeason: "" }]) {
    assert.equal((await load(first, invalid)).size, 0, "An explicitly invalid scope must not become an unscoped read");
  }
  const bindings = () => new Map([first, second].map(id => [id, { clubId: club, membershipId: membership }]));
  assert.equal((await load(first, undefined, bindings())).has(first), true);
  for (const changed of [{ clubId: competition, membershipId: membership }, { clubId: club, membershipId: competition }]) {
    const expected = bindings(); expected.set(first, changed);
    assert.equal((await load(first, undefined, expected)).has(first), false, "A changed identity binding must revoke the mapped card");
  }
  for (const invalid of [null, {}, new Map(), new Map([[first, { clubId: club, membershipId: membership }]]), new Map([[first, { clubId: "invalid", membershipId: membership }], [second, { clubId: club, membershipId: membership }]])]) {
    assert.equal((await load(first, undefined, invalid)).size, 0, "Incomplete or malformed binding cannot become an unrestricted read");
  }
  const mutableScope = { competitionId: competition, effectiveSeason: "2026-27" };
  const mutableBindings = bindings();
  assert.equal((await load(first, mutableScope, mutableBindings, () => {
    mutableScope.effectiveSeason = "2025-26";
    mutableBindings.get(first)!.clubId = competition;
  })).has(first), true, "The requested scope and bindings are captured before asynchronous reads");
});

test("the shared read model exposes only a published, current canonical card classification", () => {
  assert.match(source, /^import "server-only";/m);
  assert.match(source, /touchline_card_publications/);
  assert.match(source, /\.eq\("publication_status", "published"\)/);
  assert.match(source, /football_player_market_values/);
  assert.match(source, /football_squad_members/);
  assert.match(source, /text\(membership\.status\) !== "active"/);
  assert.match(source, /verifiedMarketValue/);
  assert.match(source, /provisionalMarketValue/);
  assert.match(source, /text\(value\.status\) === "verified"/);
  assert.match(source, /text\(value\.confidence\) === "verified"/);
  assert.match(source, /TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR/);
  assert.match(source, /touchline_card_engine_provisional_defaults/);
  assert.match(source, /TOUCHLINE_PROVISIONAL_MISSING_SHIRT/);
  assert.match(source, /calculated_nominal_price_gbp/);
  assert.match(source, /currency: "GBP"/);
  assert.doesNotMatch(source, /calculated_price_tc/);
  assert.match(source, /unstable_noStore/);
  assert.doesNotMatch(source, /unstable_cache|revalidateTag/);
  assert.doesNotMatch(source, /fetch\s*\(|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
});

test("the shared publication policy chunks large canonical player sets before querying PostgREST", () => {
  assert.match(source, /const PLAYER_ID_QUERY_CHUNK_SIZE = 150/);
  assert.match(source, /readPublishedTouchlineCardsChunk/);
  assert.match(source, /Promise\.all\(chunks\.map/);
  assert.match(source, /chunkResults\.some\(\(result\) => result === null\)/);
});

test("the public card reader falls back to the legacy override projection only when provisional columns are absent", () => {
  assert.match(source, /isTouchlineProvisionalColumnsUnavailable/);
  assert.match(source, /select\("player_id,field_key,effective_value,status"\)/);
  assert.match(source, /compatibleOverridesResponse/);
});

test("the public Premier League roster asks the single publication policy instead of a local card catalogue", () => {
  assert.match(squadRoute, /loadTouchlinePublishedCardPresentations/);
  assert.doesNotMatch(squadRoute, /editorial-card-catalog|findTouchlineEditorialCardPresentation/);
});
