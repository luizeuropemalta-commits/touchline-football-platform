import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineFantasyMarketWorkflowCopy, TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { touchLineT } from "../lib/touchlineArena/i18n.ts";
import { getTouchLineMarketCopy } from "../lib/touchlineArena/market-i18n.ts";
const releasePolicy: { isTouchLineSiteLocalesEnabled?: (path?: string) => boolean } = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: releasePolicy, process: { env: {} } });


function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Market Transfer copy is centralized with Portuguese and English parity", () => {
  const english = getTouchLineMarketCopy("en-GB");
  const portuguese = getTouchLineMarketCopy("pt-BR");

  assert.deepEqual(Object.keys(portuguese), Object.keys(english));
  assert.equal(english.productName, "Market Transfer");
  assert.equal(portuguese.productName, "Market Transfer");
  assert.equal(english.fullProductName, "TouchLine Market Transfer");
  assert.equal(portuguese.fullProductName, "TouchLine Market Transfer");
  assert.equal(touchLineT("en-GB", "marketTransfer"), "Market Transfer");
  assert.equal(touchLineT("pt-BR", "marketTransfer"), "Market Transfer");
});

test("incomplete locales receive the complete English Market Transfer fallback", () => {
  assert.equal(getTouchLineMarketCopy("fr-FR").searchPlaceholder, "Search player, position or country");
  assert.equal(getTouchLineMarketCopy("ar-SA").ariaClearSearch, "Clear search");
  assert.equal(getTouchLineMarketCopy("unknown").fullProductName, "TouchLine Market Transfer");
});

test("card and copy counts use locale-aware singular and plural labels", () => {
  const english = getTouchLineMarketCopy("en-GB");
  const portuguese = getTouchLineMarketCopy("pt-BR");

  assert.equal(english.cardsFound(1), "1 card found");
  assert.equal(english.cardsFound(2), "2 cards found");
  assert.equal(english.copiesAvailable(1), "1 copy available");
  assert.equal(english.copiesAvailable(2), "2 copies available");
  assert.equal(portuguese.cardsFound(1), "1 card encontrado");
  assert.equal(portuguese.cardsFound(2), "2 cards encontrados");
  assert.equal(portuguese.copiesAvailable(1), "1 cópia disponível");
  assert.equal(portuguese.copiesAvailable(2), "2 cópias disponíveis");
});

test("Portuguese remaining-player copy agrees with zero, one and multiple players", () => {
  const portuguese = getTouchLineMarketCopy("pt-BR");
  assert.equal(portuguese.playersRemaining(0), "Faltam 0 jogadores para completar o elenco");
  assert.equal(portuguese.playersRemaining(1), "Falta 1 jogador para completar o elenco");
  assert.equal(portuguese.playersRemaining(2), "Faltam 2 jogadores para completar o elenco");
});

test("the Market game route resolves lang for metadata and the real client", () => {
  const marketPage = source("app/clubowner/page.tsx");

  assert.match(marketPage, /lang\?: string \| string\[\]/);
  assert.match(marketPage, /generateMetadata/);
  assert.match(marketPage, /marketLocale\(searchParams, draftLocalesEnabled\)/);
  assert.match(marketPage, /getTouchlineFantasyMarketWorkflowCopy\(locale, draftLocalesEnabled\)/);
  assert.match(marketPage, /<FantasyGameweekClient[^>]*locale=\{locale\}/);
  assert.match(marketPage, /touchLineAuthEntryHref\("\/login", locale, destination, draftLocalesEnabled\)/);
  assert.match(marketPage, /title: "ClubOwner · TouchLine"/);
  assert.match(marketPage, /<ClubOwnerMarketHeader[^>]*locale=\{locale\}/);
});

type Params = { lang?: string | string[]; club?: string | string[] };
type MetadataResult = { title: string; description: string };
function metadataFixture(review = false) {
  const requested: Array<[string, unknown, boolean]> = [], forbidden: string[] = [];
  const exports: { generateMetadata?: (input: { searchParams: Promise<Params> }) => Promise<MetadataResult>; generateClubOwnerMetadata?: (input: { searchParams: Promise<Params> }, enabled?: boolean) => Promise<MetadataResult>; marketLocale?: (input: Promise<Params>, enabled?: boolean) => Promise<string> } = {};
  const publicPage = source("app/clubowner/page.tsx");
  assert.match(publicPage, /return generateClubOwnerMetadata\(props, isTouchLineSiteLocalesEnabled\("\/clubowner"\)\)/);
  // Exercise the real private seam without rewriting the production gate.
  const js = ts.transpileModule(`${publicPage}\nexport { marketLocale, generateClubOwnerMetadata };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports, require: (name: string) => {
    if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
    if (name === "@/lib/touchlineArena/catalogue-locale") return { resolveTouchlineCatalogueLocale: (value: string | undefined, enabled = false) => {
      requested.push(["normalize", value, enabled]); return resolveTouchlineCatalogueLocale(value, enabled);
    } };
    if (name === "@/lib/touchlineFantasy/market-workflow-i18n") return { getTouchlineFantasyMarketWorkflowCopy: (locale: string, enabled = false) => {
      requested.push(["copy", locale, enabled]);
      return getTouchlineFantasyMarketWorkflowCopy(locale, enabled);
    } };
    // Auth/avatar/snapshot/navigation/components are unavailable in metadata.
    // Fail on invocation, not module import; execute the full actual route.
    return new Proxy({}, { get: (_, key) => () => { forbidden.push(`${name}:${String(key)}`); throw Error("Unexpected metadata side effect"); } });
  } });
  assert.ok(exports.generateMetadata); assert.ok(exports.marketLocale); assert.ok(exports.generateClubOwnerMetadata);
  return {
    generateMetadata: review
      ? (input: { searchParams: Promise<Params> }) => exports.generateClubOwnerMetadata!(input, true)
      : exports.generateMetadata,
    marketLocale: (input: Promise<Params>) => exports.marketLocale!(input, review),
    requested, forbidden,
  };
}

test("real metadata and marketLocale preserve array-first, empty/unknown fallback and exact title/description-only output", async () => {
  const fixture = metadataFixture();
  for (const lang of [undefined, "", "unknown", "en-GB", "pt-BR", [], ["pt-BR", "en-GB"], ["", "pt-BR"], ...Object.keys(TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES)]) {
    fixture.requested.length = 0;
    const first = Array.isArray(lang) ? lang[0] : lang, locale = first === "pt-BR" ? "pt-BR" : "en-GB";
    const params = Promise.resolve({ lang, club: ["unchanged-club", "other"] });
    assert.equal(await fixture.marketLocale(params), locale);
    const result = await fixture.generateMetadata({ searchParams: params });
    assert.deepEqual(Object.keys(result).sort(), ["description", "title"]);
    assert.equal(result.title, "ClubOwner · TouchLine");
    assert.equal(result.description, locale === "pt-BR" ? "Gerencie seu XI TouchLine por posição." : "Manage your TouchLine XI by position.");
    assert.deepEqual(fixture.requested, [["normalize", first, false], ["normalize", first, false], ["copy", locale, false]]);
    assert.deepEqual(fixture.forbidden, []);
  }
});

test("real metadata waits for searchParams and propagates rejection without auth, avatar or snapshot work", async () => {
  const fixture = metadataFixture();
  let resolve!: (params: Params) => void;
  const searchParams = new Promise<Params>(done => { resolve = done; });
  let settled = false;
  const result = fixture.generateMetadata({ searchParams }).then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); assert.deepEqual(fixture.requested, []); assert.deepEqual(fixture.forbidden, []);
  resolve({ lang: "pt-BR" });
  assert.equal((await result).description, "Gerencie seu XI TouchLine por posição.");
  fixture.requested.length = 0;
  const failure = Error("search params rejected");
  await assert.rejects(fixture.generateMetadata({ searchParams: Promise.reject(failure) }), error => error === failure);
  await assert.rejects(fixture.marketLocale(Promise.reject(failure)), error => error === failure);
  assert.deepEqual(fixture.requested, []); assert.deepEqual(fixture.forbidden, []);
});

test("internal locale seam reaches real eight-locale metadata while the public gate stays off", async () => {
  const fixture = metadataFixture(true);
  const expected = {
    "en-GB": "Manage your TouchLine XI by position.",
    "pt-BR": "Gerencie seu XI TouchLine por posição.",
    "es-ES": "Gestiona tu XI de TouchLine por posición.",
    "it-IT": "Gestisci il tuo XI TouchLine per posizione.",
    "fr-FR": "Gérez votre XI TouchLine par poste.",
    "ar-SA": "أدِر تشكيلة XI الخاصة بك في TouchLine حسب المركز.",
    "tr-TR": "TouchLine XI kadronuzu pozisyona göre yönetin.",
    "de-DE": "Verwalte deine TouchLine-XI nach Position.",
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES).sort());
  for (const [locale, description] of Object.entries(expected)) {
    fixture.requested.length = 0;
    const result = await fixture.generateMetadata({ searchParams: Promise.resolve({ lang: [locale, "pt-BR"] }) });
    assert.equal(result.description, description); assert.equal(result.title, "ClubOwner · TouchLine");
    assert.deepEqual(fixture.requested, [["normalize", locale, true], ["copy", locale, true]]);
  }
  assert.deepEqual(fixture.forbidden, []);
});

test("shared Market Transfer navigation contains no retired product name", () => {
  const sources = [
    source("lib/touchlineArena/i18n.ts"),
    source("lib/touchlineArena/auth-i18n.ts"),
    source("app/clubowner/page.tsx"),
  ];

  for (const fileSource of sources) {
    assert.doesNotMatch(fileSource, /Transfer Market|Mercado de Transferências/i);
  }
});
