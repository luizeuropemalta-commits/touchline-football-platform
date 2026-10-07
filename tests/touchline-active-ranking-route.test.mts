import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

function handler(load: () => Promise<unknown>): () => Promise<Response> {
  const source = stripTypeScriptTypes(readFileSync(new URL("../app/api/touchline-arena/card-ranking/active/route.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  return runInNewContext(`${source}\nGET;`, { NextResponse: Response, loadTouchLineActiveRanking: load });
}

test("ranking API keeps published and genuinely absent states distinct from failure", async () => {
  for (const state of [{ phase: "ranked", snapshotId: "published" }, { phase: "preseason" }]) {
    const response = await handler(async () => state)();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  }
});

test("ranking API returns uncached unavailable state without disclosing read failure", async () => {
  let unavailable = true;
  const get = handler(async () => {
    if (unavailable) throw new Error("PRIVATE database details");
    return { phase: "ranked", snapshotId: "recovered" };
  });
  const response = await get();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "ranking_unavailable" });
  for (const header of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"])
    assert.match(response.headers.get(header) ?? "", /no-store/);
  unavailable = false;
  const recovered = await get();
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), { phase: "ranked", snapshotId: "recovered" });
});
