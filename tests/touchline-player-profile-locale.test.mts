import ts from "typescript";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("player profile authors all eight locale variants for the remaining visible chrome", () => {
  assert.match(source, /^function getTouchlinePlayerProfileCopy\(locale\?: string \| null, draftLocalesEnabled = false\): ProfileCopy/m);
  assert.match(source, /const locale = resolveTouchlineCatalogueLocale\(/);
  assert.match(source, /\.\.\.getTouchlinePlayerProfileCopy\(locale, draftLocalesEnabled\)/);
  for (const locale of locales.slice(2)) {
    assert.match(source, new RegExp(`"${locale}": \\{`), locale);
  }

  for (const key of ["eyebrow", "position", "born", "height", "weight", "nationality", "foot", "contract", "currentClub", "openClub", "career", "season", "current", "rankGroup", "touchlineData"]) {
    const matches = source.match(new RegExp(`${key}:`, "g")) ?? [];
    assert.ok(matches.length >= 8, `${key}:${matches.length}`);
  }
});

test("player profile authors official-data and TouchLine-card chrome in every draft catalogue", () => {
  const expected = {
    "es-ES": ["Datos oficiales de fútbol", "Tarjeta TouchLine"],
    "it-IT": ["Dati ufficiali sul calcio", "Carta TouchLine"],
    "fr-FR": ["Données du football réel", "Carte TouchLine"],
    "ar-SA": ["بيانات كرة القدم الرسمية", "بطاقة TouchLine"],
    "tr-TR": ["Resmî futbol verileri", "TouchLine kartı"],
    "de-DE": ["Offizielle Fußballdaten", "TouchLine-Karte"],
  } as const;

  for (const [locale, [officialData, touchlineCard]] of Object.entries(expected)) {
    const catalogue = source.match(new RegExp(`"${locale}": \\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? "";
    assert.match(catalogue, new RegExp(`officialData: "${officialData}"`), `${locale}:officialData`);
    assert.match(catalogue, new RegExp(`touchlineCard: "${touchlineCard}"`), `${locale}:touchlineCard`);
  }
});

test("profile keeps factual identity and existing domain catalogues outside chrome translation", () => {
  for (const fact of ["card.name", "club.name", "official.player?.preferredFoot", "official.player?.contractUntil"]) assert.match(source, new RegExp(fact.replace(/[.?]/g, "\\$&")), fact);
  assert.match(source, /localizedCountryLabel\([^,]+, locale, draftLocalesEnabled\)/);
  assert.match(source, /localizedPositionLabel\([^,]+, locale, draftLocalesEnabled\)/);
  assert.match(source, /getTouchlinePlayerPerformanceCopy\(locale, draftLocalesEnabled\)/);
  assert.match(source, /getTouchlineCardMatchFactLabels\(locale, draftLocalesEnabled\)/);
  assert.match(source, /TOUCHLINE_POSITION_RANKING_LABELS\[competition\.positionGroup\]/);
});

test("locale authorship does not open the EN/PT completeness gate or alter social/feed contracts", () => {
  assert.doesNotMatch(source, /isTouchLineLocaleComplete\([^)]*\)\s*\{[^}]*true/s);
  assert.ok(source.includes("return renderPlayerProfilePage(props, isTouchLineSiteLocalesEnabled(\"/touchline-players/[player]\"))"));
  assert.match(source, /PlayerProfilePageProps, draftLocalesEnabled = false/);
  assert.match(source, /const locale = resolveTouchlineCatalogueLocale\(/);
  assert.match(source, /<TouchlineSocialFeed/);
  assert.match(source, /posts=\{playerSocialPosts\}/);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
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
