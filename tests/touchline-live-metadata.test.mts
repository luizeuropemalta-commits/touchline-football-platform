import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
const releasePolicy: { isTouchLineSiteLocalesEnabled?: (path?: string) => boolean } = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: releasePolicy, process: { env: {} } });


function compile(path: string, requireModule: (name: string) => unknown) {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8") + (path.endsWith("app/live/page.tsx") ? "\nexport { generateLiveMetadata };" : "");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: requireModule });
  return exports;
}

const locale = i18n;
const page = compile("../app/live/page.tsx", name => {
  if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
  if (name === "@/lib/touchlineArena/i18n") return locale;
  if (name === "@/lib/touchlineArena/catalogue-locale") return catalogueLocale;
  if (name === "@/lib/touchlineArena/match-centre-i18n") return matchCopy;
  return new Proxy({}, { get: () => () => assert.fail("Metadata must not load fixtures, auth or network") });
});

for (const [lang, title] of [
  ["en-GB", "Live | TouchLine England"],
  ["pt-BR", "Ao vivo | TouchLine England"],
  [undefined, "Live | TouchLine England"],
  ["unknown", "Live | TouchLine England"],
  [["en-GB", "pt-BR"], "Live | TouchLine England"],
] as const) {
  test(`Live metadata respects requested locale ${JSON.stringify(lang)}`, async () => {
    assert.equal(typeof page.generateMetadata, "function");
    const generate = page.generateMetadata as (props: { searchParams: Promise<object> }) => Promise<{ title: string; description: string }>;
    const result = await generate({ searchParams: Promise.resolve({ lang }) });
    assert.equal(result.title, title);
    assert.match(result.description, title.startsWith("Live") ? /Live matches/ : /partidas/);
    assert.equal(page.metadata, undefined, "Do not retain conflicting static metadata");
  });
}

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const metadataText = {
  "en-GB": ["Live | TouchLine England", "Live matches, events and statistics from TouchLine England."],
  "pt-BR": ["Ao vivo | TouchLine England", "Central premium de partidas, eventos e estatísticas ao vivo da TouchLine England."],
  "es-ES": ["En directo | TouchLine England", "Partidos, eventos y estadísticas en directo de TouchLine England."],
  "it-IT": ["In diretta | TouchLine England", "Partite, eventi e statistiche in diretta di TouchLine England."],
  "fr-FR": ["En direct | TouchLine England", "Matchs, événements et statistiques en direct de TouchLine England."],
  "ar-SA": ["مباشر | TouchLine England", "مباريات وأحداث وإحصاءات مباشرة من TouchLine England."],
  "tr-TR": ["Canlı | TouchLine England", "TouchLine England canlı maçları, olayları ve istatistikleri."],
  "de-DE": ["Live | TouchLine England", "Live-Spiele, Ereignisse und Statistiken von TouchLine England."],
} as const;
type MetadataInput = { searchParams: Promise<{ lang?: string | string[] }> };
type MetadataResult = { title: string; description: string };

function metadataFixture(future = false, sentinel = false) {
  const requested: unknown[][] = [], forbidden: string[] = [];
  const fixturePage = compile("../app/live/page.tsx", name => {
    if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
  if (name === "@/lib/touchlineArena/i18n") return i18n;
    if (name === "@/lib/touchlineArena/catalogue-locale") return { resolveTouchlineCatalogueLocale: (input?: string | null, enabled = false) => { requested.push(["normalize", input]); return catalogueLocale.resolveTouchlineCatalogueLocale(input, enabled); } };
    if (name === "@/lib/touchlineArena/match-centre-i18n") return { getTouchlineMatchCentreCopy: (input: string, enabled = false) => {
      requested.push(["copy", input]);
      if (sentinel) return { metadataTitle: `TITLE:${input}`, metadataDescription: `DESCRIPTION:${input}` };
      return matchCopy.getTouchlineMatchCentreCopy(input, enabled);
    } };
    return new Proxy({}, { get: (_, key) => () => {
      forbidden.push(`${name}:${String(key)}`); throw Error("Metadata must not call auth, headers, fixtures, redirects or rendering");
    } });
  });
  assert.equal(fixturePage.metadata, undefined);
  const generate = fixturePage.generateMetadata as (input: MetadataInput) => Promise<MetadataResult>;
  const draft = fixturePage.generateLiveMetadata as (input: MetadataInput, enabled: boolean) => Promise<MetadataResult>;
  return { generate: (input: MetadataInput) => future ? draft(input, true) : generate(input), requested, forbidden };
}

test("real Live metadata forwards the complete future locale to its catalogue without title collapse", async () => {
  const fixture = metadataFixture(true, true);
  for (const locale of locales) {
    fixture.requested.length = 0;
    const result = await fixture.generate({ searchParams: Promise.resolve({ lang: [locale, "pt-BR"] }) });
    assert.equal(result.title, `TITLE:${locale}`); assert.equal(result.description, `DESCRIPTION:${locale}`);
    assert.deepEqual(fixture.requested, [["normalize", locale], ["copy", locale]]);
  }
  assert.deepEqual(fixture.forbidden, []);
});

test("real Live metadata preserves exact EN/PT, first array value, gated fallbacks and only two fields", async () => {
  const fixture = metadataFixture();
  for (const lang of [undefined, "", "unknown", "constructor", "__proto__", ...locales, [], ["pt-BR", "en-GB"], ["", "pt-BR"], ["ar-SA", "pt-BR"]]) {
    fixture.requested.length = 0;
    const first = Array.isArray(lang) ? lang[0] : lang;
    const [title, description] = metadataText[first === "pt-BR" ? "pt-BR" : "en-GB"];
    const result = await fixture.generate({ searchParams: Promise.resolve({ lang }) });
    assert.deepEqual(Object.keys(result).sort(), ["description", "title"]);
    assert.equal(result.title, title); assert.equal(result.description, description);
    assert.deepEqual(fixture.requested, [["normalize", first], ["copy", first === "pt-BR" ? "pt-BR" : "en-GB"]]);
    assert.deepEqual(fixture.forbidden, []);
  }
});

test("real draft catalogues feed eight metadata outputs in isolation while public gates stay closed", async () => {
  const fixture = metadataFixture(true);
  for (const locale of locales) {
    const result = await fixture.generate({ searchParams: Promise.resolve({ lang: locale }) });
    const [title, description] = metadataText[locale];
    assert.equal(result.title, title); assert.equal(result.description, description);
    assert.deepEqual(Object.keys(result).sort(), ["description", "title"]);
    assert.match(title, / \| TouchLine England$/); assert.match(description, /TouchLine England/);
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(i18n.normalizeTouchLineLocale(locale), "en-GB");
      assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
    }
  }
  assert.deepEqual(fixture.forbidden, []);
});

test("Live metadata awaits searchParams and propagates rejection without starting page work", async () => {
  const fixture = metadataFixture();
  let resolve!: (input: { lang: string }) => void;
  const searchParams = new Promise<{ lang: string }>(done => { resolve = done; });
  let settled = false;
  const pending = fixture.generate({ searchParams }).then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); assert.deepEqual(fixture.requested, []); assert.deepEqual(fixture.forbidden, []);
  resolve({ lang: "pt-BR" });
  assert.equal((await pending).title, "Ao vivo | TouchLine England");
  fixture.requested.length = 0;
  const failure = new Error("search params unavailable");
  await assert.rejects(fixture.generate({ searchParams: Promise.reject(failure) }), error => error === failure);
  assert.deepEqual(fixture.requested, []); assert.deepEqual(fixture.forbidden, []);
});
