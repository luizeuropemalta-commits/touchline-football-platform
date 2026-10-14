import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
test("verified existing access needs no admin; unprovisioned accounts remain closed", async () => {
  let adminCalls = 0;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  const mocks: Record<string, unknown> = {
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; return null; } },
    "@/lib/server/arena-user": { ensureArenaUserProfile: () => { throw Error("unexpected write"); } },
    "@/lib/touchlineArena/auth-access": {
      TOUCHLINE_ARENA_ACCESS_METADATA_KEY: "touchline_arena_access_v1",
      hasTouchLineArenaAccess: (user: { app_metadata?: { touchline_arena_access_v1?: boolean } }) => user.app_metadata?.touchline_arena_access_v1 === true,
    },
  };
  const source = readFileSync(new URL("../lib/server/touchline-arena-access.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in mocks, name); return mocks[name]; } });
  const ensureTouchlineArenaAccess = exports.ensureTouchlineArenaAccess;
  assert.ok(ensureTouchlineArenaAccess);
  const result = await ensureTouchlineArenaAccess({ app_metadata: { touchline_arena_access_v1: true } }) as { accessReady: boolean; amountTc: number };
  assert.equal(result.accessReady, true);
  assert.equal(result.amountTc, 0);
  assert.equal(adminCalls, 0);
  await assert.rejects(ensureTouchlineArenaAccess({ user_metadata: { touchline_arena_access_v1: true } }), /not configured/);
  assert.equal(adminCalls, 1);
});
