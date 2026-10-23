import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import React from "react";
import * as jsx from "react/jsx-runtime";
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

// Execute the real page through its data-loading seam. Failure cases stop at
// locale lookup; the successful case inspects the real server/client boundary.
function harness(input: {
  client: () => unknown;
  ranking: () => unknown;
  catalogue: (state: unknown) => unknown;
  renderBoundary?: boolean;
}) {
  const reachedPresentation = new Error("presentation reached");
  let presentationCalls = 0;
  const publicationType = () => null;
  const resolveLocale = () => {
    presentationCalls++;
    if (!input.renderBoundary) throw reachedPresentation;
    return "en-GB";
  };
  const dependencies: Record<string, Record<string, unknown>> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "@/lib/supabase/server": { createClient: input.client },
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: input.ranking },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: input.catalogue },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale: resolveLocale },
    "react/jsx-runtime": jsx,
    "@/components/touchline/TouchlinePlayerCardRankingsPublication": { default: publicationType },
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: (state: unknown) => state },
    "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
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
    publicationType,
  };
}

test("public snapshot and complete catalogue advance while client/auth waits, preserving snapshot identity", async () => {
  const client = deferred<unknown>(), auth = deferred<unknown>(), ranking = deferred<unknown>();
  const snapshot = { seasonId: "season-a", players: [{ playerId: "canonical-a" }] };
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  let rankingCalls = 0, catalogueCalls = 0, authCalls = 0;
  cards.sort = () => assert.fail("the server must not mutate or pre-rank the complete catalogue");
  const h = harness({ renderBoundary: true, client: () => client.promise, ranking: () => { rankingCalls++; return ranking.promise; },
    catalogue: state => { catalogueCalls++; assert.equal(state, snapshot); return Promise.resolve(cards); } });
  const pending = h.run();
  await setImmediate();
  assert.equal(rankingCalls, 1); assert.equal(catalogueCalls, 0);
  ranking.resolve(snapshot); await setImmediate();
  assert.equal(catalogueCalls, 1); assert.equal(h.presentationCalls(), 0);
  client.resolve({ auth: { getUser: () => { authCalls++; return auth.promise; } } });
  await setImmediate(); assert.equal(authCalls, 1); assert.equal(h.presentationCalls(), 0);
  auth.resolve({ data: { user: { email: "owner@example.test" } } });
  const tree = await pending;
  const descendants = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] =>
    React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
      ? [child, ...descendants(child.props.children as React.ReactNode)] : []);
  const publications = descendants(tree as React.ReactNode).filter(node => node.type === h.publicationType);
  assert.equal(publications.length, 1, "one shared projection boundary receives the complete catalogue");
  assert.equal(publications[0].props.catalogue, cards, "all rows retain identity without top3/top20 pre-slicing");
  assert.equal((publications[0].props.catalogue as unknown[]).length, 4);
  assert.equal(publications[0].props.seedRanking, snapshot, "catalogue and publication share the same resolved snapshot");
  assert.equal(publications[0].props.canEditCardEngine, false, "unverified owner email cannot unlock controls");
  assert.equal(h.presentationCalls(), 1);
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
