import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { isTouchlineProvisionalColumnsUnavailable } from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
const turn = () => new Promise(resolve => setImmediate(resolve));
function harness(table = "football_players", columns = "id") {
  const path = "lib/touchlineArena/complete-catalogue-read-server.ts";
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = stripTypeScriptTypes(source).replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const factory = runInNewContext(`${code}\ncreateCompleteTouchlineCatalogueAdmin;`, { isTouchlineProvisionalColumnsUnavailable, console: { warn() {} } });
  const calls: Array<{ batch: number; offset: number; release: (response?: unknown) => void }> = [];
  let active = 0, peak = 0;
  const admin = { from() {
    let batch = 0, offset = 0;
    const q = { select() { return q; }, in(_key: string, ids: string[]) { batch = Math.floor(Number(ids[0]) / 150); return q; }, order() { return q; }, range(start: number) { offset = start; return q; }, then(yes: (x: unknown) => unknown, no: (x: unknown) => unknown) {
      active++; peak = Math.max(peak, active);
      return new Promise(resolve => calls.push({ batch, offset, release(response) { active--; resolve(response ?? { data: [{ id: String(batch) }], count: 1, error: null }); } })).then(yes, no);
    } }; return q;
  } };
  const result = Promise.resolve(factory(admin).from(table).select(columns).in("player_id", Array.from({ length: 601 }, (_, i) => String(i).padStart(4, "0"))));
  return { calls, result, peak: () => peak };
}
test("five partitions refill at most two slots and merge in input order", async () => {
  const h = harness(); await turn(); assert.equal(h.calls.length, 2);
  h.calls[1].release(); await turn(); assert.equal(h.calls[2].batch, 2);
  h.calls[2].release(); await turn(); h.calls[3].release(); await turn(); h.calls[4].release(); h.calls[0].release();
  const result = await h.result; assert.equal(h.peak(), 2);
  assert.deepEqual(Array.from(result.data, (row: { id: string }) => row.id), ["0", "1", "2", "3", "4"]);
});
test("failure drains sibling and stops new partitions, supplementary rows discarded", async () => {
  for (const table of ["football_players", "football_player_season_statistics", "touchline_card_editorial_overrides"]) {
    const h = harness(table, table.includes("overrides") ? "id,provenance_status" : "id");
    let done = false;
    const result = h.result.then(value => ({ value }), error => ({ error })).finally(() => { done = true; });
    await turn(); assert.equal(h.calls.length, 2);
    h.calls[1].release({ data: null, count: null, error: { code: "42703", message: "provenance_status does not exist" } });
    await turn(); assert.equal(done, false); assert.equal(h.calls.length, 2);
    h.calls[0].release(); const outcome = await result;
    if (table === "football_players") assert.ok("error" in outcome);
    else { assert.ok("value" in outcome); assert.equal(outcome.value.data, null); assert.ok(outcome.value.error); }
  }
});
test("pages remain sequential and count drift outranks a sibling compatibility fallback", async () => {
  const h = harness("touchline_card_editorial_overrides", "id,provenance_status");
  const rejected = assert.rejects(h.result, /COUNT_CHANGED/);
  await turn();
  h.calls[0].release({ data: Array.from({ length: 150 }, (_, i) => ({ id: `row${i}` })), count: 151, error: null });
  await turn(); assert.equal(h.calls[2].batch, 0); assert.equal(h.calls[2].offset, 150);
  h.calls[1].release({ data: null, count: null, error: { code: "42703", message: "provenance_status does not exist" } });
  h.calls[2].release({ data: [{ id: "last" }], count: 152, error: null }); await rejected;
  assert.equal(h.calls.length, 3);
});
test("cross-partition duplicate IDs remain fatal", async () => {
  const h = harness(); const rejected = assert.rejects(h.result, /DUPLICATE_ROW/);
  for (let index = 0; index < 5; index++) { await turn(); h.calls[index].release({ data: [{ id: "same" }], count: 1, error: null }); }
  await rejected;
});

test("cross-partition duplicates outrank later recoverable stats and schema errors", async () => {
  for (const table of ["football_player_season_statistics", "touchline_card_editorial_overrides"]) {
    const h = harness(table, table.includes("overrides") ? "id,provenance_status" : "id");
    const rejected = assert.rejects(h.result, /DUPLICATE_ROW/);
    await turn();
    h.calls[0].release({ data: [{ id: "same" }], count: 1, error: null });
    await turn();
    h.calls[1].release({ data: [{ id: "same" }], count: 1, error: null });
    await turn();
    h.calls[2].release({ data: null, count: null, error: { code: "42703", message: "provenance_status does not exist" } });
    await turn();
    h.calls[3].release();
    await rejected;
    assert.equal(h.calls.length, 4);
  }
});
