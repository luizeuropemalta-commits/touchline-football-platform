import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readGameweekPlayerAvailability } from "../lib/touchlineArena/player-availability-reader.ts";

const playerId = "10000000-0000-4000-8000-000000000001";
const card = { id: playerId, canonicalPlayerId: playerId, providerPlayerId: "42" };
const fixture = { provider: "sportmonks", season_id: "season", round_id: "round", provider_fixture_id: "100", status: "Not Started" };
const item = { provider: "sportmonks", fixtureId: "100", playerId: "42", completed: false, category: "injury" };
const feed = { provider: "sportmonks", provider_fixture_id: "100", fixture_payload: { provider: "sportmonks", providerId: "100", status: "Not Started" }, sidelined_payload: [item] };
function database(options: { fixtures?: unknown[]; feeds?: unknown[]; fail?: string; wrongWeek?: boolean } = {}) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const admin = { from(table: string) {
    const filters: [string, unknown][] = []; calls.push({ table, filters });
    const query = { select: () => query, eq: (k: string, v: unknown) => { filters.push([k,v]); return query; },
      in: (k: string,v: unknown) => { filters.push([k,v]); return query; }, maybeSingle: () => query,
      then(resolve: (v: unknown) => unknown) {
        const data = table === "touchline_fantasy_gameweeks" ? { id: options.wrongWeek ? "other" : "week", season_id: "season", round_id: "round" }
          : table === "football_fixtures" ? options.fixtures ?? [fixture] : options.feeds ?? [feed];
        return Promise.resolve({ data, error: options.fail === table ? {} : null }).then(resolve);
      } };
    return query;
  } };
  return { admin: admin as unknown as SupabaseClient, calls };
}
const read = (options: Parameters<typeof database>[0] = {}, catalogue = [card]) => readGameweekPlayerAvailability(database(options).admin,"season","week",[playerId],catalogue);

test("persisted confirmed absence maps exact selected canonical UUID, with only scoped reads", async () => {
  const db = database();
  const result = await readGameweekPlayerAvailability(db.admin,"season","week",[playerId],[card]);
  assert.equal(result?.length,1); assert.equal(result?.[0]?.playerId,playerId);
  assert.equal(result?.[0]?.fixtureId,"100"); assert.equal(result?.[0]?.badge.reason,"injury");
  assert.deepEqual(db.calls[1]?.filters,[["provider","sportmonks"],["season_id","season"],["round_id","round"]]);
  assert.deepEqual(db.calls[2]?.filters,[["provider","sportmonks"],["provider_fixture_id",["100"]]]);
  assert.deepEqual(await readGameweekPlayerAvailability(db.admin,"season","week",[],[card]),[]);
});

test("confirmed suspension uses explicit provider reason, never match cards or generic category", async () => {
  for (const [reason, expected] of [["five yellow cards","five-yellows"],["ten yellow cards","ten-yellows"],["red card","red-card"],["suspended",null]] as const) {
    const result = await read({ feeds: [{ ...feed, sidelined_payload: [{...item,category:"suspension",reason}], events_payload:[{type:"Redcard"}] }] });
    assert.equal(result?.[0]?.badge.reason ?? null,expected);
  }
});

test("terminal/unknown/wrong scope fixture and stale terminal feed cannot produce current badge", async () => {
  for (const status of ["FT","Finished","Cancelled","Postponed","unknown",null]) {
    assert.deepEqual(await read({ fixtures: [{...fixture,status}] }),[]);
    assert.deepEqual(await read({ feeds: [{...feed,fixture_payload:{...feed.fixture_payload,status}}] }),[]);
  }
  for (const delta of [{season_id:"other"},{round_id:"other"},{provider:"other"}]) assert.deepEqual(await read({fixtures:[{...fixture,...delta}]}),[]);
});

test("malformed, conflicting, duplicated and other fixture records fail closed", async () => {
  for (const payload of [null,[null], [item,null], [{...item,category:42}], [{...item,completed:true}], [{...item,fixtureId:"101"}], [{...item,provider:"other"}], [item,item], [item,{...item,completed:true}], []]) {
    assert.deepEqual(await read({feeds:[{...feed,sidelined_payload:payload}]}),[]);
  }
  assert.deepEqual(await read({feeds:[feed,feed]}),[]);
  assert.deepEqual(await read({fixtures:[fixture,{...fixture,status:"FT"}]}),[]);
  assert.deepEqual(await read({feeds:[{...feed,fixture_payload:{...feed.fixture_payload,providerId:"101"}}]}),[]);
});

test("canonical binding must be unique in both directions; no guessing on double fixture", async () => {
  assert.deepEqual(await read({},[card,card]),[]);
  assert.deepEqual(await read({},[{...card,canonicalPlayerId:"other"}]),[]);
  assert.deepEqual(await read({},[card,{...card,id:"other",canonicalPlayerId:"other"}]),[]);
  assert.deepEqual(await read({fixtures:[fixture,{...fixture,provider_fixture_id:"101"}],feeds:[feed,{...feed,provider_fixture_id:"101",fixture_payload:{...feed.fixture_payload,providerId:"101"},sidelined_payload:[{...item,fixtureId:"101"}]}]}),[]);
});

test("read failures or mismatched gameweek return unavailable, not fabricated absence", async () => {
  for(const fail of ["touchline_fantasy_gameweeks","football_fixtures","football_fantasy_fixture_feeds"]) assert.equal(await read({fail}),null);
  assert.equal(await read({wrongWeek:true}),null);
});
