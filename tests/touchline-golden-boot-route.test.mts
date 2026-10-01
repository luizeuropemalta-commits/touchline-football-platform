import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function route(payload: unknown, fail = false) {
  let reads = 0;
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/touchlineArena/golden-boot-server": {
      async loadTouchlineGoldenBoot() { reads++; if (fail) throw Error("PRIVATE server error"); return payload; },
    },
  };
  const source = readFileSync(new URL("../app/api/touchline-awards/golden-boot/route.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInThisContext(`(function(exports,require){${js}\n})`)(exports, (key: string) => {
    assert.ok(Object.hasOwn(imports, key), `Unexpected dependency: ${key}`); return imports[key];
  });
  return { exports, get: exports.GET as () => Promise<Response>, reads: () => reads };
}

test("GoldenBoot public route is read-only and cannot cache an award", async () => {
  const payload = { authority: { status: "unavailable" }, servedAtMs: 1790881200000 };
  const h = route(payload);
  assert.deepEqual(Object.keys(h.exports).sort(), ["GET", "dynamic", "runtime"]);
  assert.equal(h.exports.dynamic, "force-dynamic");
  assert.equal(h.exports.runtime, "nodejs");
  const result = await h.get();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), payload);
  assert.equal(h.reads(), 1);
  for (const name of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"])
    assert.match(result.headers.get(name) ?? "", /no-store/);
});

test("disabled/unavailable loader produces null rather than an old award", async () => {
  const h = route(null);
  assert.equal(await (await h.get()).json(), null);
  assert.equal(h.reads(), 1);
});

test("unexpected loader rejection is sanitized and non-cacheable", async () => {
  const h = route(null, true);
  const result = await h.get();
  assert.equal(result.status, 503);
  assert.equal(await result.text(), "null");
  assert.match(result.headers.get("Cache-Control") ?? "", /no-store/);
});
