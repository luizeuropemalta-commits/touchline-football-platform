import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { resolveTouchlineGlobalNavigationSurface } from "../lib/touchlineArena/global-navigation.ts";
import { touchlineCardEnginePlayerHref } from "../lib/touchlineArena/card-engine-links.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("app/touchline-players/[player]/page.tsx");
const ast = ts.createSourceFile("profile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const promiseStatements: string[] = [], editInitializers: string[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === "currentUserPromise")) {
    promiseStatements.push(node.getText(ast));
  }
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "cardEngineHref") editInitializers.push(node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(promiseStatements.length, 1, "actual auth request seam must be unique");
assert.equal(editInitializers.length, 1, "actual editorial-link decision must be unique");
const start = source.indexOf("  const authResult = await currentUserPromise;");
const end = source.indexOf("  const editorialCard =", start);
assert.ok(start > 0 && end > start, "actual receipt/context/navigation statements must remain present");
const compiled = ts.transpileModule(`export async function run() {
  ${promiseStatements[0]}
  ${source.slice(start, end)}
  return { currentUser, accountLocaleContext, navigationSurface, cardEngineHref: (${editInitializers[0]}) };
}`, { compilerOptions: options }).outputText;

const ownerEmail = "owner@example.test";
const accountId = "11111111-1111-4111-8111-111111111111";
const canonicalPlayerId = "22222222-2222-4222-8222-222222222222";
// Execute the real owner policy with an isolated environment, not the host env.
const ownerExports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(read("lib/admin/owner.ts"), { compilerOptions: options }).outputText, {
  exports: ownerExports, process: { env: { TOUCHLINE_OWNER_EMAILS: ownerEmail } },
});
type Result = {
  currentUser: unknown;
  accountLocaleContext: { mode: string; accountId?: string };
  navigationSurface: string;
  cardEngineHref: string | null;
};
function fixture(getUser: () => Promise<unknown>) {
  let calls = 0;
  const exports: { run?: () => Promise<Result> } = {};
  runInNewContext(compiled, {
    exports, AuthSessionMissingError, hasTouchLineArenaAccess,
    resolveTouchlineGlobalNavigationSurface, touchlineCardEnginePlayerHref,
    isOwnerEmail: ownerExports.isOwnerEmail,
    canonicalPlayerId, locale: "pt-BR",
    createClient: async () => ({ auth: { getUser: () => { calls += 1; return getUser(); } } }),
  });
  assert.ok(exports.run);
  return { run: exports.run, calls: () => calls };
}
const user = (email: string) => ({ id: accountId, email, app_metadata: { touchline_arena_access_v1: true } });

for (const email of [ownerEmail, "customer@example.test"]) {
  test(`player profile rejects identity from an error-bearing ${email === ownerEmail ? "owner" : "customer"} auth envelope`, async () => {
    const h = fixture(async () => ({ data: { user: user(email) }, error: new Error("PRIVATE_AUTH_FAILURE") }));
    const result = await h.run();
    assert.equal(h.calls(), 1);
    assert.equal(result.accountLocaleContext.mode, "unavailable");
    assert.equal(result.currentUser, null, "unverified identity cannot reach any downstream capability");
    assert.equal(result.navigationSurface, "public", "no owner or customer authenticated navigation");
    assert.equal(result.cardEngineHref, null, "no Admin/editorial shortcut from an error-bearing receipt");
  });
}

test("valid error-null identities preserve account context, customer navigation and owner editorial access", async () => {
  for (const email of [ownerEmail, "customer@example.test"]) {
    const identity = user(email);
    const h = fixture(async () => ({ data: { user: identity }, error: null }));
    const result = await h.run();
    assert.equal(h.calls(), 1);
    assert.equal(result.currentUser, identity);
    assert.equal(result.accountLocaleContext.mode, "account");
    assert.equal(result.accountLocaleContext.accountId, accountId);
    assert.equal(result.navigationSurface, email === ownerEmail ? "auth" : "authenticated");
    assert.equal(result.cardEngineHref, email === ownerEmail
      ? `/admin/manual-card-editorial?playerId=${canonicalPlayerId}&lang=pt-BR#manual-card-editor` : null);
  }
});

test("MissingSession remains anonymous and rejected auth retains its original failure", async () => {
  const guest = fixture(async () => ({ data: { user: null }, error: new AuthSessionMissingError() }));
  const result = await guest.run();
  assert.equal(guest.calls(), 1);
  assert.equal(result.currentUser, null);
  assert.equal(result.accountLocaleContext.mode, "guest");
  assert.equal(result.navigationSurface, "public");
  assert.equal(result.cardEngineHref, null);
  const failure = new Error("ORIGINAL_AUTH_FAILURE");
  const rejected = fixture(async () => { throw failure; });
  await assert.rejects(rejected.run(), error => error === failure);
  assert.equal(rejected.calls(), 1);
});

test("contradictory MissingSession and incomplete envelopes cannot supply identity or a guest context", async () => {
  // Runtime auth results cross a service boundary. Missing error is not proof
  // of successful verification, even when data contains an owner identity.
  for (const receipt of [
    { data: { user: user(ownerEmail) }, error: new AuthSessionMissingError() },
    { data: { user: user(ownerEmail) } },
    { data: { user: null } },
  ]) {
    const h = fixture(async () => receipt);
    const result = await h.run();
    assert.equal(h.calls(), 1);
    assert.equal(result.currentUser, null);
    assert.equal(result.accountLocaleContext.mode, "unavailable");
    assert.equal(result.navigationSurface, "public");
    assert.equal(result.cardEngineHref, null);
  }
});

test("absent receipts remain unavailable while an explicit verified anonymous receipt is guest", async () => {
  for (const { receipt, mode } of [
    { receipt: null, mode: "unavailable" },
    { receipt: undefined, mode: "unavailable" },
    { receipt: { data: { user: null }, error: null }, mode: "guest" },
  ]) {
    const h = fixture(async () => receipt);
    const result = await h.run();
    assert.equal(h.calls(), 1);
    assert.equal(result.currentUser, null);
    assert.equal(result.accountLocaleContext.mode, mode);
    assert.equal(result.navigationSurface, "public");
    assert.equal(result.cardEngineHref, null);
  }
});
