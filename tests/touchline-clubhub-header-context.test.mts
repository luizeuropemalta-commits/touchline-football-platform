import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import type { ReactElement } from "react";
import type { AccountLocaleContext } from "../lib/touchlineArena/account-locale-context-server";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const profile = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const directory = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/touchline-clubs/touchline-clubs.module.css", import.meta.url), "utf8");
const ast = ts.createSourceFile("club.tsx", profile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["loadClubHubViewerAccess", "ClubHubBrandHeader"];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
const constants = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ["CLUB_HUB_VIEWER_ACCESS_TIMEOUT_MS", "CLUB_HUB_PUBLIC_VIEWER_ACCESS"].includes(declaration.name.getText(ast))));
assert.equal(functions.length, 2); assert.equal(constants.length, 2);
function harness(result: unknown, client = true, stalled = false) {
  let calls = 0;
  let deadline: (() => void) | undefined;
  const exports: { read?: (club: string, source: string) => Promise<{ userId: string | null; accountLocaleContext: AccountLocaleContext }>; header?: (props: unknown) => Promise<ReactElement<Record<string, unknown>>> } = {};
  runInNewContext(ts.transpileModule(`${constants.map(node => node.getText(ast)).join("\n")}\n${functions.map(node => node.getText(ast)).join("\n")}\nexport {loadClubHubViewerAccess as read,ClubHubBrandHeader as header};`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports, AuthSessionMissingError, hasTouchLineArenaAccess,
    createClient: async () => client ? { auth: { getUser: async () => { calls++; return stalled ? new Promise(() => {}) : result; } } } : null,
    isOwnerEmail: () => false,
    traceClubHubLoader: (_club: string, _name: string, operation: () => Promise<unknown>) => operation(),
    setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 1_800); deadline = callback; },
    TouchlineBrandHeader: () => null,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
  });
  return { ...exports, calls: () => calls, expire: () => deadline?.() };
}
const user = { id: "11111111-1111-4111-8111-111111111111", app_metadata: { touchline_arena_access_v1: true } };

test("ClubHub header consumes existing verified viewer promise without additional auth", async () => {
  const h = harness({ data: { user }, error: null });
  const viewerAccessPromise = h.read!("arsenal", "direct");
  const header = await h.header!({ locale: "pt-BR", href: "/touchline-clubs/arsenal?lang=pt-BR", viewerAccessPromise });
  const viewer = await viewerAccessPromise;
  assert.equal(h.calls(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(header.props.accountLocaleContext)), { mode: "account", accountId: user.id });
  assert.equal(viewer.userId, user.id);
  assert.equal(header.props.locale, "pt-BR");
  assert.equal(header.props.draftLocalesEnabled, false);
});

test("ClubHub viewer context distinguishes canonical missing session and fails closed on errors/mirror/timeout", async () => {
  for (const [result, expected] of [
    [{ data: { user: null }, error: null }, "guest"],
    [{ data: { user: null }, error: new AuthSessionMissingError() }, "guest"],
    [{ data: { user: null }, error: { name: "AuthSessionMissingError" } }, "unavailable"],
    [{ data: { user }, error: new Error("offline") }, "unavailable"],
    [{ data: { user: { ...user, id: "invalid" } }, error: null }, "unavailable"],
    [{ data: { user: { ...user, app_metadata: {} } }, error: null }, "unavailable"],
    [{ data: {}, error: null }, "unavailable"],
  ] as const) {
    const h = harness(result); assert.equal((await h.read!("arsenal", "direct")).accountLocaleContext.mode, expected); assert.equal(h.calls(), 1);
  }
  const mirror = harness(null); assert.equal((await mirror.read!("arsenal", "qa-mirror")).accountLocaleContext.mode, "unavailable"); assert.equal(mirror.calls(), 0);
  const absent = harness(null, false); assert.equal((await absent.read!("arsenal", "direct")).accountLocaleContext.mode, "unavailable"); assert.equal(absent.calls(), 0);
  const slow = harness(null, true, true); const pending = slow.read!("arsenal", "direct"); slow.expire(); assert.equal((await pending).accountLocaleContext.mode, "unavailable");
});

test("directory and profile mount one brand/control surface outside padded content and keep nav audio off", () => {
  assert.equal((directory.match(/loadAccountLocaleContext\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(directory, /AccountLocaleMenu/);
  assert.match(directory, /<TouchlineBrandHeader[^>]+accountLocaleContext=\{accountLocaleContext\}/);
  assert.match(directory, /<TouchlineBrandHeader[^>]+\/>\s*<div className=\{styles\.content\}>/);
  assert.match(directory, /showAudioControl=\{false\}/);
  assert.match(css, /\.content\s*\{\s*padding: clamp/);
  assert.doesNotMatch(css.match(/\.shell\s*\{[^}]*\}/)?.[0] ?? "", /padding:/);
  assert.match(profile, /<Suspense fallback=\{<TouchlineBrandHeader/);
  assert.match(profile, /<ClubHubBrandHeader[^>]+viewerAccessPromise=\{viewerAccessPromise\}/);
  assert.match(profile, /<\/Suspense>\s*<div className="club-hub-content">/);
  assert.match(profile, /showAudioControl=\{false\}/);
  assert.doesNotMatch(profile, /loadAccountLocaleContext/);
  assert.equal((profile.match(/supabase\.auth\.getUser\(\)/g) ?? []).length, 1);
  for (const [source, renderer] of [[profile, "renderClubHubPage"], [directory, "renderTouchlineClubsPage"]] as const) {
    const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const entry = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
    assert.ok(entry?.body);
    assert.equal(entry.body.statements.length, 1);
    const statement = entry.body.statements[0];
    assert.ok(ts.isReturnStatement(statement) && statement.expression && ts.isCallExpression(statement.expression));
    assert.equal(statement.expression.expression.getText(tree), renderer);
    assert.deepEqual(statement.expression.arguments.map(arg => arg.getText(tree)), ["props", `isTouchLineSiteLocalesEnabled("${renderer === "renderClubHubPage" ? "/touchline-clubs/[club]" : "/touchline-clubs"}")`], "public entry delegates to trusted policy");
    const isolated = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === renderer);
    assert.ok(isolated);
    assert.equal(isolated.parameters[1].name.getText(tree), "draftLocalesEnabled");
    assert.equal(isolated.parameters[1].initializer?.getText(tree), "false");
    assert.match(isolated.body?.getText(tree) ?? "", /resolveTouchlineCatalogueLocale\((?:lang|params\.lang), draftLocalesEnabled\)/);
  }
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-clubs/[club]")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
