import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyPaths, closePreservingFailure, manifest, matrixPath, matrixSql, provisionNamedDatabase, runAvatarQaCompatibility } from "../scripts/avatar-qa-compatibility-harness.mjs";

test("avatar QA compatibility keeps real business dependencies and canonical SQL guards", () => {
  const source = readFileSync(new URL(`../${matrixPath}`,import.meta.url),"utf8");
  assert.equal(matrixSql(source),source.replace("\\set ON_ERROR_STOP on\n",""));
  assert.throws(() => matrixSql(source + "\n\\connect production\n"),/Unexpected psql/);
  assert.ok(applyPaths.includes("supabase/migrations/027_touchline_tc_wallet_integrity.sql"));
  assert.ok(applyPaths.includes("supabase/migrations/026_touchline_market_contract_release.sql"));
  assert.ok(applyPaths.includes("supabase/migrations/028_touchline_release_lineup_integrity.sql"));
  assert.equal(manifest().length,21);
});

test("database lifecycle uses default postgres before creating and dumping named database", async () => {
  const events: string[] = [];
  const dump = new Blob(["synthetic lifecycle test, not SQL proof"]);
  class FakeLifecycle {
    constructor(options: { database?: string }) { assert.equal(options.database,undefined); events.push("default"); }
    async query() { events.push("identity"); return { rows:[{db:"postgres"}] }; }
    async exec(sql: string) { events.push(sql); }
    async dumpDataDir(compression: string) { assert.equal(compression,"none"); events.push("dump"); return dump; }
    async close() { events.push("close"); }
  }
  const name = `touchline_avatar_qa_test_${"a".repeat(32)}`;
  assert.equal(await provisionNamedDatabase(FakeLifecycle,name,{}),dump);
  assert.deepEqual(events,["default","identity",`create database ${name}`,"dump","close"]);
});

test("cleanup errors retain the original initialization failure", async () => {
  const primary = new Error("original initialization failure");
  const cleanup = new Error("cleanup failure");
  await assert.rejects(closePreservingFailure({close:async()=>{throw cleanup;}},primary),(error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause,primary);
    assert.deepEqual(error.errors,[primary,cleanup]);
    return true;
  });
});

const enabled = process.env.TOUCHLINE_AVATAR_QA_COMPATIBILITY === "1";
test("canonical avatar QA057 SQL matrix on disposable real business schema", { skip: !enabled }, async () => {
  const result = await runAvatarQaCompatibility({ runtime:process.env.TOUCHLINE_FANTASY_PGLITE_MODULE,authorize:true });
  assert.equal(result.status,"passed_limited_scope");
});
