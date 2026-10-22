import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const cases = [
  { route: "card-layout-master", filename: "master-shirt-back-layout.json", error: "Could not save card layout." },
  { route: "coach-card-layout", filename: "coach-card-layout.json", error: "Não foi possível salvar o Card Mestre do treinador." },
] as const;
type Case = typeof cases[number];
type Reply = { status: number; body: Record<string, unknown> };
const sentinel = "PRIVATE_FS_SENTINEL /private/synthetic/layout.json EACCES";

function fixture(config: Case, options: { fault?: "mkdir" | "write"; denied?: boolean } = {}) {
  // Only source text is read. No handler/app import, public JSON or real write.
  const source = readFileSync(new URL(`../app/api/touchline-arena/${config.route}/route.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const target = path.join("/synthetic-touchline", "public", "touchlineArena/card-layouts", config.filename);
  const calls: string[] = [];
  let storedBytes = "existing fake file sentinel";
  const coachLayout = { layers: { synthetic: true }, portraitScale: 1, nameSize: 2, crestSize: 3, neonStrength: 4 };
  const guardReply = { status: 403, body: { ok: false, error: "Synthetic guard rejection" } };
  const compiledModule = { exports: {} as { POST: (req: { json: () => Promise<unknown> }) => Promise<Reply> } };
  const scopedRequire = (id: string) => {
    if (id === "node:path") return path;
    if (id === "node:fs/promises") return {
      mkdir: async (directory: string, settings: unknown) => {
        calls.push("mkdir"); assert.equal(directory, path.dirname(target)); assert.deepEqual(settings, { recursive: true });
        if (options.fault === "mkdir") throw new Error(sentinel);
      },
      writeFile: async (file: string, bytes: string, encoding: string) => {
        calls.push("write"); assert.equal(file, target); assert.equal(encoding, "utf8");
        if (options.fault === "write") throw new Error(sentinel);
        storedBytes = bytes;
      },
    };
    if (id === "next/server") return { NextResponse: { json: (body: Record<string, unknown>, settings?: { status?: number }) => ({ body, status: settings?.status ?? 200 }) } };
    if (id === "@/lib/touchlineArena/api-access") return { requireLocalTouchlineEditor: () => {
      calls.push("guard"); return options.denied ? guardReply : null;
    } };
    if (id === "@/public/touchlineArena/card-layouts/master-shirt-back-layout.json") return {
      layout: new Proxy({}, { get: () => ({ x: 1, y: 2, scale: 1 }) }),
    };
    if (id === "@/lib/touchlineArena/coach-card-layout") return {
      TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY: "synthetic-key",
      TOUCHLINE_COACH_CARD_LAYOUT_VERSION: 1,
      normalizeTouchlineCoachCardLayout: (input: unknown) => {
        assert.deepEqual(input, { backName: { x: 12, y: 24, scale: 1 } }); return coachLayout;
      },
    };
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", "process", compiled)(
    scopedRequire, compiledModule, compiledModule.exports, { cwd: () => "/synthetic-touchline" },
  );
  return { calls, bytes: () => storedBytes, guardReply, coachLayout,
    post: () => compiledModule.exports.POST({ json: async () => {
      calls.push("body"); return { layout: { backName: { x: 12, y: 24, scale: 1 } }, storageKey: "synthetic-key" };
    } }),
  };
}

for (const config of cases) {
  test(`${config.route}: filesystem failures return only the fixed public error`, async () => {
    for (const fault of ["mkdir", "write"] as const) {
      const state = fixture(config, { fault });
      const result = await state.post();
      assert.deepEqual(result, { status: 500, body: { ok: false, error: config.error } });
      assert.ok(!JSON.stringify(result).includes(sentinel));
      assert.deepEqual(state.calls, fault === "mkdir" ? ["guard", "body", "mkdir"] : ["guard", "body", "mkdir", "write"]);
      assert.equal(state.bytes(), "existing fake file sentinel");
    }
  });
  test(`${config.route}: guard denial remains before body and filesystem`, async () => {
    const state = fixture(config, { denied: true });
    assert.equal(await state.post(), state.guardReply);
    assert.deepEqual(state.calls, ["guard"]);
    assert.equal(state.bytes(), "existing fake file sentinel");
  });
  test(`${config.route}: allowed success still writes the expected payload`, async () => {
    const state = fixture(config);
    const result = await state.post();
    assert.equal(result.status, 200); assert.equal(result.body.ok, true);
    assert.equal(result.body.path, `/touchlineArena/card-layouts/${config.filename}`);
    assert.deepEqual(state.calls, ["guard", "body", "mkdir", "write"]);
    const payload = JSON.parse(state.bytes());
    assert.equal(payload.storageKey, "synthetic-key");
    assert.ok(Number.isFinite(Date.parse(payload.updatedAt)));
    if (config.route === "card-layout-master") {
      assert.equal(result.body.locked, false);
      assert.deepEqual(payload.layout, result.body.layout);
      assert.deepEqual(payload.layout.backName, { x: 12, y: 24, scale: 1 });
    } else {
      assert.equal(payload.version, 1);
      assert.deepEqual(result.body.layout, state.coachLayout);
      assert.deepEqual(payload.layout, state.coachLayout.layers);
      for (const key of ["portraitScale", "nameSize", "crestSize", "neonStrength"] as const) assert.equal(payload[key], state.coachLayout[key]);
    }
  });
}
