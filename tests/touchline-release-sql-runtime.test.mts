import assert from "node:assert/strict";
import test from "node:test";
import { releaseSqlEnvironment } from "../scripts/release-sql-runtime.mjs";

const fixture = () => {
  const calls: string[] = [];
  return {
    calls,
    resolveRuntime: () => "/test/pglite/dist/index.js",
    load: async (url: string) => {
      calls.push(url);
      return { PGlite: class {}, pgcrypto: {}, pg_trgm: {} };
    },
  };
};

test("missing paths receive one validated installed runtime and SQL proofs cannot skip", async () => {
  const deps = fixture();
  const source = { TOUCHLINE_RUN_LOCALE_BROWSER_TESTS: "1" };
  const env = await releaseSqlEnvironment(source, deps);
  for (const family of ["FANTASY", "STUDIO", "GOLDEN_BOOT", "COMPANY"]) {
    assert.equal(env[`TOUCHLINE_${family}_PGLITE_MODULE`], "/test/pglite/dist/index.js");
  }
  assert.equal(env.TOUCHLINE_AVATAR_QA_COMPATIBILITY, "1");
  assert.equal(env.TOUCHLINE_RUN_LOCALE_BROWSER_TESTS, "1");
  assert.deepEqual(source, { TOUCHLINE_RUN_LOCALE_BROWSER_TESTS: "1" });
  assert.deepEqual(deps.calls, ["file:///test/pglite/dist/index.js", "file:///test/pglite/dist/contrib/pgcrypto.js", "file:///test/pglite/dist/contrib/pg_trgm.js"]);
});

test("explicit distinct absolute paths are preserved and each is validated", async () => {
  const deps = fixture();
  deps.resolveRuntime = () => { throw new Error("must not resolve fallback"); };
  const source = Object.fromEntries(["FANTASY", "STUDIO", "GOLDEN_BOOT", "COMPANY"].map(family => [`TOUCHLINE_${family}_PGLITE_MODULE`, `/test/${family}/index.js`]));
  const env = await releaseSqlEnvironment(source, deps);
  for (const [key, value] of Object.entries(source)) assert.equal(env[key], value);
  assert.equal(deps.calls.length, 6);
});

test("invalid explicit paths never silently fall back", async () => {
  for (const path of ["relative.js", "file:///test/index.js", " "]) {
    await assert.rejects(releaseSqlEnvironment({ TOUCHLINE_FANTASY_PGLITE_MODULE: path }, fixture()), /absolute path/);
  }
  await assert.rejects(releaseSqlEnvironment({ TOUCHLINE_FANTASY_PGLITE_MODULE: "/missing/index.js" }, {
    ...fixture(), load: async () => { throw new Error("missing explicit runtime"); },
  }), /missing explicit runtime/);
});

test("missing installed runtime or invalid exports fail before test execution", async () => {
  await assert.rejects(releaseSqlEnvironment({}, { ...fixture(), resolveRuntime: () => { throw new Error("not installed"); } }), /not installed/);
  await assert.rejects(releaseSqlEnvironment({}, { ...fixture(), load: async () => ({}) }), /no PGlite/);
  await assert.rejects(releaseSqlEnvironment({}, { ...fixture(), load: async () => ({ PGlite: class {} }) }), /extension missing/);
});

test("explicit compatibility disable is rejected rather than producing skipped proofs", async () => {
  for (const flag of ["", "0", "true"]) {
    await assert.rejects(releaseSqlEnvironment({ TOUCHLINE_AVATAR_QA_COMPATIBILITY: flag }, fixture()), /requires/);
  }
});
