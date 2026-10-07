import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Execute the real page through its data-loading seam. Stop at locale lookup,
// before presentation: any attempted earlier JSX/owner-link work must fail.
function harness(input: {
  client: () => unknown;
  ranking: () => unknown;
  catalogue: (state: unknown) => unknown;
}) {
  const reachedPresentation = new Error("presentation reached");
  let presentationCalls = 0;
  const dependencies: Record<string, Record<string, unknown>> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "@/lib/supabase/server": { createClient: input.client },
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: input.ranking },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: input.catalogue },
    "@/lib/touchlineArena/ranked-card-catalog": { compareTouchLineRankedCards: () => 0 },
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: () => { presentationCalls++; throw reachedPresentation; } },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale: () => { presentationCalls++; throw reachedPresentation; } },
  };
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => dependencies[name] ?? new Proxy({}, {
    get: (_target, key) => () => assert.fail(`unexpected presentation call: ${name}.${String(key)}`),
  }) });
  return {
    run: () => (exports.default as (props: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({ lang: "en-GB" }) }),
    reachedPresentation,
    presentationCalls: () => presentationCalls,
  };
}

test("public snapshot and complete catalogue advance while client/auth waits, preserving snapshot identity", async () => {
  const client = deferred<unknown>(), auth = deferred<unknown>(), ranking = deferred<unknown>();
  const snapshot = { seasonId: "season-a", players: [{ playerId: "canonical-a" }] };
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  let rankingCalls = 0, catalogueCalls = 0, authCalls = 0, sortedCount = 0;
  cards.sort = function (compare) { sortedCount = this.length; return Array.prototype.sort.call(this, compare); };
  const h = harness({ client: () => client.promise, ranking: () => { rankingCalls++; return ranking.promise; },
    catalogue: state => { catalogueCalls++; assert.equal(state, snapshot); return Promise.resolve(cards); } });
  const pending = h.run();
  const checked = assert.rejects(pending, error => error === h.reachedPresentation);
  await setImmediate();
  assert.equal(rankingCalls, 1); assert.equal(catalogueCalls, 0);
  ranking.resolve(snapshot); await setImmediate();
  assert.equal(catalogueCalls, 1); assert.equal(h.presentationCalls(), 0);
  client.resolve({ auth: { getUser: () => { authCalls++; return auth.promise; } } });
  await setImmediate(); assert.equal(authCalls, 1); assert.equal(h.presentationCalls(), 0);
  auth.resolve({ data: { user: { email: "owner@example.test" } } });
  await checked;
  assert.equal(sortedCount, 4, "all catalogue rows reach the unchanged presentation calculation");
});

test("early public rejection is observed while auth waits; original public error survives", async () => {
  const auth = deferred<unknown>(); const failure = new Error("public read failed");
  const h = harness({ client: async () => ({ auth: { getUser: () => auth.promise } }),
    ranking: () => Promise.reject(failure), catalogue: () => assert.fail("catalogue after failed snapshot") });
  const checked = assert.rejects(h.run(), error => error === failure);
  await setImmediate(); await setImmediate();
  assert.equal(h.presentationCalls(), 0);
  auth.resolve({ data: { user: null } }); await checked;
});

test("auth rejection retains precedence and late catalogue rejection remains observed", async () => {
  const auth = deferred<unknown>(), catalogue = deferred<unknown>();
  const failure = new Error("identity failed");
  const h = harness({ client: async () => ({ auth: { getUser: () => auth.promise } }),
    ranking: async () => ({ seasonId: "season-a" }), catalogue: () => catalogue.promise });
  const checked = assert.rejects(h.run(), error => error === failure);
  await setImmediate(); auth.reject(failure); await checked;
  catalogue.reject(new Error("late catalogue failure")); await setImmediate(); await setImmediate();
  assert.equal(h.presentationCalls(), 0);
});

test("null client remains anonymous and synchronous public failures preserve identity", async () => {
  for (const failedBranch of ["ranking", "catalogue"] as const) {
    const failure = new Error(failedBranch);
    const h = harness({ client: () => null,
      ranking: () => { if (failedBranch === "ranking") throw failure; return { seasonId: "season-a" }; },
      catalogue: () => { throw failure; } });
    await assert.rejects(h.run(), error => error === failure);
    assert.equal(h.presentationCalls(), 0);
  }
});
