import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";

const approved = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const routes = [
  { path: "app/arena/page.tsx", seam: "renderRetiredArenaPage", destination: "/intro" },
  { path: "app/fantasy/page.tsx", seam: "renderFantasyAliasPage", destination: "/clubowner" },
  { path: "app/my-club/page.tsx", seam: "renderMyClubPage", destination: "/clubowner" },
] as const;
type Entry = (props: { searchParams: Promise<Record<string, unknown>> }, trustedDraftOptIn?: boolean) => Promise<unknown>;
class Redirect extends Error {
  readonly href: string;
  constructor(href: string) { super("test redirect boundary"); this.href = href; }
}

function load(route: (typeof routes)[number]) {
  const source = readFileSync(new URL(`../${route.path}`, import.meta.url), "utf8");
  const exports: { default?: Entry; testEntry?: Entry } = {};
  const dependencies: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "next/navigation": { redirect: (href: string): never => { throw new Redirect(href); } },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/root-locale": rootLocale,
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  // Expose only the proposed private page seam in the test VM. Before that seam
  // exists the actual default page runs unchanged and ignores the extra flag:
  // the RED is a lost locale, never a replacement normalizer or fabricated page.
  vm.runInNewContext(`${compiled}\nexports.testEntry = typeof ${route.seam} === "function" ? ${route.seam} : exports.default;`, {
    exports, URLSearchParams,
    require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected page dependency ${name}`); return dependencies[name]; },
  });
  assert.equal(typeof exports.default, "function"); assert.equal(typeof exports.testEntry, "function");
  return { publicEntry: exports.default!, trustedEntry: exports.testEntry!, source };
}

async function destination(entry: Entry, params: Record<string, unknown>, optIn?: boolean) {
  try { await entry({ searchParams: Promise.resolve(params) }, optIn); }
  catch (error) { if (error instanceof Redirect) return error.href; throw error; }
  assert.fail("Compatibility page must redirect; no new rendered route is allowed");
}

for (const route of routes) {
  test(`${route.path}: public and omitted internal opt-in retain EN/PT, query cannot enable drafts`, async () => {
    const page = load(route);
    for (const locale of approved) {
      const expected = `${route.destination}?lang=${locale === "pt-BR" ? "pt-BR" : "en-GB"}`;
      const params = { lang: locale, draftLocalesEnabled: "true", allowDraftLocale: "1" };
      assert.equal(await destination(page.publicEntry, params), expected);
      assert.equal(await destination(page.trustedEntry, params), expected);
      assert.equal(await destination(page.trustedEntry, params, false), expected);
    }
  });

  test(`${route.path}: trusted internal opt-in carries exactly eight approved languages`, async () => {
    const page = load(route);
    for (const locale of approved) {
      assert.equal(await destination(page.trustedEntry, { lang: locale }, true), `${route.destination}?lang=${locale}`);
    }
    for (const locale of [undefined, null, "", "ar", "AR-SA", " ar-SA", "ar-SA ", "pt-br", "constructor", "__proto__", "ru-RU"]) {
      assert.equal(await destination(page.trustedEntry, { lang: locale }, true), `${route.destination}?lang=en-GB`);
    }
  });

  test(`${route.path}: existing allowed query survives but arbitrary destinations never do`, async () => {
    const page = load(route);
    for (const optIn of [false, true]) {
      const result = new URL(await destination(page.trustedEntry, {
        lang: "pt-BR", intro: "first", skipIntro: "1", club: "42", returnTo: "https://outside.invalid", owner: "foreign", draftLocalesEnabled: "true",
      }, optIn), "https://local.invalid");
      assert.equal(result.pathname, route.destination);
      const expected = route.path.includes("/arena/") ? [["lang", "pt-BR"], ["intro", "first"], ["skipIntro", "1"]]
        : route.path.includes("/my-club/") ? [["lang", "pt-BR"], ["club", "42"]] : [["lang", "pt-BR"]];
      assert.deepEqual([...result.searchParams], expected);
      assert.equal(result.hash, "");
    }
    // A private seam is not an additional unsupported Next page export.
    const ast = ts.createSourceFile(route.path, page.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of ast.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== route.seam) continue;
      assert.ok(!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
    }
  });
}
