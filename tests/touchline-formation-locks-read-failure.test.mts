import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
// Read only the real handler source; never import its app/auth graph.
const source = readFileSync(new URL("../app/api/touchline-arena/formation-locks/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
type ResponseValue = { body: unknown; status: number };
type RequestValue = { json: () => Promise<unknown> };
type Fault = { code: string; message: string };

function fixture(options: { bytes: string | undefined; readFault?: Fault; writeFault?: Fault; denied?: boolean }) {
  let bytes = options.bytes;
  const calls: string[] = [];
  const target = path.join("/synthetic-touchline", "data", "touchline-arena-formation-locks.json");
  const denied = { body: { error: "Denied by fixture" }, status: 403 };
  const fs = {
    async readFile(file: string, encoding: string) {
      calls.push("read"); assert.equal(file, target); assert.equal(encoding, "utf8");
      if (options.readFault) throw options.readFault;
      if (bytes === undefined) throw { code: "ENOENT" };
      return bytes;
    },
    async mkdir(directory: string, config: unknown) {
      calls.push("mkdir"); assert.equal(directory, path.dirname(target)); assert.deepEqual(config, { recursive: true });
    },
    async writeFile(file: string, next: string, encoding: string) {
      calls.push("write"); assert.equal(file, target); assert.equal(encoding, "utf8");
      if (options.writeFault) throw options.writeFault;
      bytes = next;
    },
  };
  const compiledModule = { exports: {} as { POST: (request: RequestValue) => Promise<ResponseValue> } };
  const scopedRequire = (id: string) => {
    if (id === "node:fs/promises") return fs;
    if (id === "node:path") return path;
    if (id === "next/server") return { NextResponse: { json: (body: unknown, config?: { status?: number }) => ({ body, status: config?.status ?? 200 }) } };
    if (id === "@/lib/touchlineArena/api-access") return { requireLocalTouchlineEditor: () => {
      calls.push("guard"); return options.denied ? denied : null;
    } };
    throw new Error(`Unexpected handler dependency: ${id}`);
  };
  new Function("require", "module", "exports", "process", compiled)(
    scopedRequire, compiledModule, compiledModule.exports, { cwd: () => "/synthetic-touchline" },
  );
  return {
    calls, bytes: () => bytes,
    post: (body: unknown = { formationKey: "4-3-3", layout: {} }) => compiledModule.exports.POST({ json: async () => { calls.push("body"); return body; } }),
  };
}

const sentinel = JSON.stringify({ "4-4-2": { defender: [{ x: 10, y: 20, heightVh: 9 }] }, "3-5-2": {} });

test("read failures and malformed JSON fail closed without mkdir or writes", async () => {
  for (const input of [
    { bytes: sentinel, readFault: { code: "EIO", message: "secret synthetic path" } },
    { bytes: sentinel, readFault: { code: "EACCES", message: "secret synthetic permission" } },
    { bytes: '{"4-4-2": "retained malformed sentinel"' },
  ]) {
    const state = fixture(input);
    const result = await state.post();
    assert.deepEqual(result, { status: 500, body: { error: "Unable to read formation locks. No changes saved." } });
    assert.deepEqual(state.calls, ["guard", "body", "read"]);
    assert.equal(state.bytes(), input.bytes);
  }
});

test("ENOENT alone permits initial creation and valid locks retain other formations", async () => {
  const empty = fixture({ bytes: undefined });
  assert.deepEqual(await empty.post(), { status: 200, body: { ok: true, formationKey: "4-3-3", layout: {} } });
  assert.deepEqual(JSON.parse(empty.bytes()!), { "4-3-3": {} });
  assert.deepEqual(empty.calls, ["guard", "body", "read", "mkdir", "write"]);
  const existing = fixture({ bytes: sentinel });
  assert.equal((await existing.post()).status, 200);
  assert.deepEqual(JSON.parse(existing.bytes()!), { ...JSON.parse(sentinel), "4-3-3": {} });
  assert.deepEqual(existing.calls, ["guard", "body", "read", "mkdir", "write"]);
});

test("denied and invalid requests remain ahead of filesystem access", async () => {
  const denied = fixture({ bytes: sentinel, denied: true });
  assert.equal((await denied.post()).status, 403);
  assert.deepEqual(denied.calls, ["guard"]);
  assert.equal(denied.bytes(), sentinel);
  for (const body of [{ formationKey: "invalid", layout: {} }, { formationKey: "4-3-3", layout: null }, null]) {
    const state = fixture({ bytes: sentinel });
    assert.equal((await state.post(body)).status, 400);
    assert.deepEqual(state.calls, ["guard", "body"]);
    assert.equal(state.bytes(), sentinel);
  }
});

test("write rejection remains a rejection and never reports success", async () => {
  const fault = { code: "EIO", message: "synthetic write fault" };
  const state = fixture({ bytes: sentinel, writeFault: fault });
  await assert.rejects(state.post(), (error) => error === fault);
  assert.deepEqual(state.calls, ["guard", "body", "read", "mkdir", "write"]);
  assert.equal(state.bytes(), sentinel);
});
