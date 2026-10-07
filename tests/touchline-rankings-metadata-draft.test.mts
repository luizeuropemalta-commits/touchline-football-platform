import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as rankings from "../lib/touchlineArena/rankings-i18n.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const source = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
const titles = {
  "en-GB": "TouchLine Rankings", "pt-BR": "Rankings TouchLine",
  "es-ES": "Clasificaciones de TouchLine", "it-IT": "Classifiche TouchLine",
  "fr-FR": "Classements TouchLine", "ar-SA": "الترتيبات في TouchLine",
  "tr-TR": "TouchLine Sıralamaları", "de-DE": "TouchLine-Ranglisten",
};
type Metadata = { title: string; description?: string };
type Generator = (props: { searchParams: Promise<Record<string, unknown>> }, enabled?: boolean) => Promise<Metadata>;
function harness() {
  let forbiddenCalls = 0;
  const forbidden = (name: string) => { forbiddenCalls++; assert.fail(`Metadata must not invoke ${name}`); };
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(`${source}\nexports.internalMetadata = typeof generateRankingsMetadata === "function" ? generateRankingsMetadata : undefined;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
      if (name === "@/lib/touchlineArena/rankings-i18n") return rankings;
      if (name === "@/lib/touchlineArena/catalogue-locale") return catalogue;
      // Only module loading is permitted for all other collaborators. Any
      // attempted auth, loader, React render or network work is a failure.
      return new Proxy({}, { get: (_, key) => () => forbidden(`${name}.${String(key)}`) });
    },
    fetch: () => forbidden("fetch"),
  });
  function generator(name: string): Generator {
    assert.equal(typeof exports[name], "function", `${name} must exist`);
    return exports[name] as Generator;
  }
  return { generator, forbiddenCalls: () => forbiddenCalls };
}

test("private Rankings metadata reuses all eight real catalogue titles and descriptions without reads", async () => {
  const h = harness();
  const generate = h.generator("internalMetadata");
  for (const [locale, title] of Object.entries(titles)) {
    const result = await generate({ searchParams: Promise.resolve({ lang: locale }) }, true);
    assert.equal(result.title, title);
    assert.equal(result.description, rankings.getTouchLineRankingsCopy(locale, true).tablesDescription);
    assert.deepEqual(Object.keys(result).sort(), ["description", "title"]);
  }
  assert.equal(h.forbiddenCalls(), 0);
});

test("public and default private metadata preserve the exact title-only contract despite forged opt-in", async () => {
  const h = harness();
  for (const lang of [undefined, "invalid", ...Object.keys(titles)]) {
    const props = { searchParams: Promise.resolve({ lang, draftLocalesEnabled: true, draft: "true" }) };
    for (const [name, enabled] of [["generateMetadata", undefined], ["internalMetadata", undefined], ["internalMetadata", false]] as const) {
      const result = await h.generator(name)(props, enabled);
      assert.equal(result.title, "TouchLine Rankings");
      assert.deepEqual(Object.keys(result), ["title"]);
      assert.equal(result.description, undefined);
    }
  }
  assert.equal(h.forbiddenCalls(), 0);
});

test("public metadata uses eight real catalogues only under trusted runtime ON without reads", async () => {
  const h = harness();
  try {
    releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = "true";
    for (const [lang, title] of Object.entries(titles)) {
      const result = await h.generator("generateMetadata")({ searchParams: Promise.resolve({ lang }) });
      assert.equal(result.title, title);
      assert.equal(result.description, rankings.getTouchLineRankingsCopy(lang, true).tablesDescription);
    }
    assert.equal(h.forbiddenCalls(), 0);
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});

test("Next metadata wrapper cannot export or implicitly enable the private seam", () => {
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(ts.isFunctionDeclaration);
  const wrapper = functions.find(node => node.name?.text === "generateMetadata");
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.expression.getText(ast), "generateRankingsMetadata");
  assert.equal(call.arguments.length, 2);
  assert.equal(call.arguments[1].getText(ast), 'isTouchLineSiteLocalesEnabled("/rankings")');
  const internal = functions.find(node => node.name?.text === "generateRankingsMetadata");
  assert.ok(internal);
  assert.equal(internal.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(internal.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
  assert.equal(ast.statements.some(node => ts.isVariableStatement(node)
    && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === "metadata")), false);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/rankings")');
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
