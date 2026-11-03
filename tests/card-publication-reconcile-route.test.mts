import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual route with explicit auth/database boundaries; no network.
const source = readFileSync(new URL("../app/api/admin/manual-card-editorial/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const id = "11111111-1111-4111-8111-111111111111";
function fixture(options: { owner?: boolean; memberships?: number; published?: boolean; receipt?: unknown } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const timestamp = "2026-10-31T00:00:00Z";
  const data: Record<string, unknown> = {
    football_players: { id, provider_player_id: "123", current_club_id: id, source_updated_at: timestamp, nationality: "Egypt" },
    football_squad_members: Array.from({ length: options.memberships ?? 1 }, () => ({ id, club_id: id, competition_id: id, source_updated_at: timestamp, status: "active", provider: "sportmonks" })),
    football_clubs: { id, competition_id: id, source_updated_at: timestamp, provider: "sportmonks", logo_url: "club.svg" },
    football_competitions: { id, provider_competition_id: "8", provider: "sportmonks", source_updated_at: timestamp },
    touchline_card_publications: options.published === false ? null : { publication_status: "published" },
  };
  const admin = {
    from(table: string) {
      assert.ok(Object.hasOwn(data, table));
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: data[table], error: null }),
        returns: async () => ({ data: data[table], error: null }),
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: Object.hasOwn(options,"receipt") ? options.receipt : [{ card_state: "COMPLETE", missing_fields: [], publication_id: id, publication_status: "published", overrides_changed: false, publication_synced: true }], error: null };
    },
  };
  const boundaries: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/admin/owner": { isOwnerEmail: () => options.owner !== false },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id, email: "owner@example.invalid" } } }) } }) },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => true },
    "@/lib/touchlineArena/country-flags": { touchlineCountryCode3FromName: () => "EGY" },
  };
  const routeModule = { exports: {} as { POST: (request: unknown) => Promise<Response> } };
  new Function("require", "module", "exports", compiled)((name: string) => boundaries[name] ?? {}, routeModule, routeModule.exports);
  return { calls, async run(fields?: unknown) {
    return routeModule.exports.POST({ url: "https://fixture.invalid/api?action=reconcile-publication", headers: new Headers({ origin: "https://fixture.invalid", "content-type": "application/json" }), nextUrl: new URL("https://fixture.invalid/api?action=reconcile-publication"), json: async () => ({ playerId: id, fields }) });
  } };
}

test("reconciliation ignores injected edits and delegates an empty patch to the atomic RPC", async () => {
  const f = fixture();
  assert.equal((await f.run({ displayName: "Changed", shirtNumber: null, marketValue: 1 })).status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, "touchline_apply_card_editorial_review");
  assert.deepEqual(f.calls[0].args.p_field_overrides, {});
  assert.equal(f.calls[0].args.p_actor_id, id);
});

test("reconciliation rejects non-owner, ambiguous membership and unpublished cards without invoking RPC", async () => {
  for (const [options, status] of [[{ owner: false }, 403], [{ memberships: 2 }, 409], [{ memberships: 0 }, 409], [{ published: false }, 409]] as const) {
    const f = fixture(options);
    assert.equal((await f.run()).status, status);
    assert.equal(f.calls.length, 0);
  }
});

test("reconciliation cannot confirm a malformed RPC row",async()=>{
 for(const receipt of [[{}],[{card_state:"COMPLETE",missing_fields:[],overrides_changed:false,publication_synced:"true"}]]) {
  const f=fixture({receipt});const r=await f.run();assert.equal(r.status,503);assert.equal(f.calls.length,1);
 }
});


test("editorial receipt rejects inconsistent publication confirmation", async () => {
 const base={card_state:"COMPLETE",missing_fields:[],publication_id:id,publication_status:"published",overrides_changed:false,publication_synced:true};
 for (const row of [
  {...base,publication_id:null,publication_status:null},
  {...base,publication_status:"unexpected"},
  {...base,publication_status:"archived"},
  {...base,card_state:"REVIEW_REQUIRED",missing_fields:["shirt_number"]},
  {...base,missing_fields:["shirt_number"]},
  {...base,card_state:"REVIEW_REQUIRED",publication_synced:false},
 ]) assert.equal((await fixture({receipt:[row]}).run()).status,503);
});
test("editorial receipt preserves unchanged and incomplete review outcomes", async () => {
 for (const row of [
  {card_state:"COMPLETE",missing_fields:[],publication_id:id,publication_status:"published",overrides_changed:false,publication_synced:false},
  {card_state:"REVIEW_REQUIRED",missing_fields:["shirt_number"],publication_id:null,publication_status:null,overrides_changed:true,publication_synced:false},
  {card_state:"REVIEW_REQUIRED",missing_fields:["shirt_number"],publication_id:id,publication_status:"archived",overrides_changed:false,publication_synced:false},
 ]) assert.equal((await fixture({receipt:[row]}).run()).status,200);
});
