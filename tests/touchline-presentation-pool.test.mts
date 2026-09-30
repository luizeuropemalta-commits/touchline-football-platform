import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

function harness() {
  const pending: Array<{ ids: string[]; resolve: (value: Map<string, unknown>) => void; reject: (error: Error) => void }> = [];
  let active = 0;
  let peak = 0;
  const source = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineArena/complete-catalogue-read-server.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const load = runInNewContext(`${source}\nloadCompleteTouchlineCataloguePresentations;`, {
    loadTouchlinePublishedCardPresentations: ({ playerIds }: { playerIds: string[] }) => {
      active++; peak = Math.max(peak, active);
      return new Promise<Map<string, unknown>>((resolve, reject) => pending.push({
        ids: playerIds,
        resolve: value => { active--; resolve(value); },
        reject: error => { active--; reject(error); },
      }));
    },
  });
  const ids = Array.from({ length: 451 }, (_, index) => `player-${String(index).padStart(4, "0")}`);
  return { load: (input = ids) => load(input, {}), pending, ids, peak: () => peak };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("presentation pool refills a free slot without waiting for a slow sibling and merges in input order", async () => {
  const h = harness(); const result = h.load();
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve(new Map(h.pending[1].ids.map(id => [id, { id }])));
  await flush();
  assert.equal(h.pending.length, 3, "third batch must start while first is pending");
  h.pending[2].resolve(new Map(h.pending[2].ids.map(id => [id, { id }])));
  await flush();
  assert.equal(h.pending.length, 4);
  h.pending[3].resolve(new Map(h.pending[3].ids.map(id => [id, { id }])));
  h.pending[0].resolve(new Map(h.pending[0].ids.map(id => [id, { id }])));
  const cards = await result;
  assert.deepEqual([...cards.keys()], h.ids);
  assert.equal(h.peak(), 2);
  assert.ok(h.pending.every(batch => batch.ids.length <= 150));
});

test("presentation pool rejects failed publication reads and starts no new batch after failure", async () => {
  const h = harness(); const result = h.load();
  const rejection = assert.rejects(result, /publication unavailable/);
  h.pending[0].reject(new Error("publication unavailable"));
  await flush();
  h.pending[1].resolve(new Map());
  await rejection; await flush();
  assert.equal(h.pending.length, 2);
});

test("empty presentation input makes no read", async () => {
  const h = harness();
  assert.equal((await h.load([])).size, 0);
  assert.equal(h.pending.length, 0);
});

test("a second in-flight rejection remains observed after the first failure", async () => {
  const h = harness(); const result = h.load();
  const rejection = assert.rejects(result, /first failure/);
  h.pending[0].reject(new Error("first failure"));
  await rejection;
  h.pending[1].reject(new Error("late failure"));
  await flush();
  assert.equal(h.pending.length, 2);
});
