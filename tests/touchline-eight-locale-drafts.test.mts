import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { TOUCHLINE_APPROVED_LOCALES, TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { TOUCHLINE_CORE_DRAFT_STATE, TOUCHLINE_DRAFT_LOCALES, touchlineCoreDrafts } from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";
import { TOUCHLINE_AUTH_DRAFT_STATE, touchlineAuthDrafts } from "../lib/touchlineArena/locale-catalogues/auth-drafts.ts";
import { TOUCHLINE_RANKINGS_DRAFT_STATE, touchlineRankingsDrafts } from "../lib/touchlineArena/locale-catalogues/rankings-drafts.ts";

type SourceCopy = string | SourceCopy[] | { [key: string]: SourceCopy };

// Read the actual authoring source rather than duplicating a snapshot of its
// keys. No runtime evaluator or source-language fallback enters the drafts.
function sourceCatalogue(relativePath: string): SourceCopy {
  const source = ts.createSourceFile(relativePath, readFileSync(new URL(relativePath, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  function literal(node: ts.Expression): SourceCopy {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literal(element));
    assert.ok(ts.isObjectLiteralExpression(node), `Unsupported source value: ${node.getText(source)}`);
    const entries = node.properties.map((property) => {
      assert.ok(ts.isPropertyAssignment(property), "Source catalogue must have explicit properties");
      assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
      return [property.name.text, literal(property.initializer)] as const;
    });
    assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, "Duplicate source keys");
    return Object.fromEntries(entries);
  }
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "en" && declaration.initializer) {
        return literal(declaration.initializer);
      }
    }
  }
  throw new Error(`English source catalogue absent: ${relativePath}`);
}

const sources = {
  core: sourceCatalogue("../lib/touchlineArena/i18n.ts"),
  auth: sourceCatalogue("../lib/touchlineArena/auth-i18n.ts"),
  rankings: sourceCatalogue("../lib/touchlineArena/rankings-i18n.ts"),
};

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

function verifyCopy(source: SourceCopy, translated: unknown, path: string) {
  if (typeof source === "string") {
    assert.equal(typeof translated, "string", path);
    assert.ok(typeof translated === "string");
    assert.ok(translated.trim().length > 0, `${path}: empty translation`);
    assert.doesNotMatch(translated, /\bTODO\b|\bFIXME\b/, path);
    assert.doesNotMatch(translated, /\[(?:translate|missing)\]/i, path);
    assert.deepEqual(placeholders(translated), placeholders(source), `${path}: interpolation mismatch`);
    // Short shared words and approved product names can legitimately match.
    // Entire English sentences cannot be used as an untranslated fallback.
    if (source.length > 40) assert.notEqual(translated, source, `${path}: English sentence fallback`);
    return;
  }
  if (Array.isArray(source)) {
    assert.ok(Array.isArray(translated), `${path}: expected list`);
    assert.equal(translated.length, source.length, `${path}: list coverage`);
    source.forEach((child, index) => verifyCopy(child, translated[index], `${path}[${index}]`));
    return;
  }
  assert.ok(translated && typeof translated === "object" && !Array.isArray(translated), `${path}: expected group`);
  assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort(), `${path}: key coverage`);
  for (const [key, value] of Object.entries(source)) {
    verifyCopy(value, (translated as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

test("the six complete draft sets complement the two existing locales without publishing them", () => {
  const expected = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  assert.deepEqual([...TOUCHLINE_DRAFT_LOCALES], expected);
  for (const drafts of [touchlineCoreDrafts, touchlineAuthDrafts, touchlineRankingsDrafts]) {
    assert.deepEqual(Object.keys(drafts).sort(), [...expected].sort());
  }
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map((locale) => locale.code), ["en-GB", "pt-BR", ...expected]);
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(TOUCHLINE_CORE_DRAFT_STATE, "draft");
  assert.equal(TOUCHLINE_AUTH_DRAFT_STATE, "draft");
  assert.equal(TOUCHLINE_RANKINGS_DRAFT_STATE, "draft");
  for (const locale of expected) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(resolveTouchLinePresentationLocale(locale), "en-GB");
  }
});

for (const locale of TOUCHLINE_DRAFT_LOCALES) {
  test(`${locale}: core has every current source key and identical interpolation contract`, () => {
    verifyCopy(sources.core, touchlineCoreDrafts[locale], `${locale}.core`);
  });
  test(`${locale}: auth preserves every nested form/state/list entry`, () => {
    verifyCopy(sources.auth, touchlineAuthDrafts[locale], `${locale}.auth`);
  });
  test(`${locale}: rankings cover the full current dictionary`, () => {
    verifyCopy(sources.rankings, touchlineRankingsDrafts[locale], `${locale}.rankings`);
  });
  test(`${locale}: names, product brands, contract placeholders and rule numbers remain intact`, () => {
    const core = touchlineCoreDrafts[locale];
    const auth = touchlineAuthDrafts[locale];
    const rankings = touchlineRankingsDrafts[locale];
    assert.equal(core.marketTransfer, "Market Transfer");
    assert.equal(core.touchlineMarketTransfer, "TouchLine Market Transfer");
    assert.equal(core.clubHub, "ClubHub");
    assert.equal(core.playerProfile, locale === "es-ES" ? "Perfil del jugador" : "PlayerProfile");
    const cinematicTitle = `${auth.layout.cinematicTitleTop} ${auth.layout.cinematicTitleBottom}`;
    assert.equal(cinematicTitle.match(/TouchLine/g)?.length, 1);
    if (locale === "tr-TR") assert.equal(cinematicTitle, "TouchLine’a giriş yapın");
    else assert.equal(auth.layout.cinematicTitleBottom, "TouchLine");
    assert.equal(auth.layout.standardTitleTop, "TouchLine");
    assert.equal(auth.layout.squadValue, "XI");
    assert.equal(auth.form.firstNamePlaceholder, "Alex");
    assert.equal(auth.form.lastNamePlaceholder, "Oliveira");
    assert.equal(auth.form.fullNamePlaceholder, "Alex Oliveira");
    assert.equal(auth.form.emailPlaceholder, {
      "es-ES": "nombre@example.com",
      "it-IT": "nome@example.com",
      "fr-FR": "nom@example.com",
      "ar-SA": "ism@example.com",
      "tr-TR": "ad@example.com",
      "de-DE": "vorname@example.com",
    }[locale]);
    assert.match(auth.form.continueWithGoogle, /Google/);
    assert.match(auth.form.continueWithApple, /Apple/);
    assert.match(auth.form.continueWithFacebook, /Facebook/);
    assert.match(auth.form.passwordPlaceholder, /\b8\b/);
    assert.match(auth.layout.rights, /© 2026 TouchLine/);
    assert.match(core.fixtureNeedsElevenStarters, /\b11\b/);
    assert.match(core.premierClubs, /26\/27/);
    assert.match(rankings.seasonSelectionRule, /\b11\b/);
    assert.equal(rankings.touchLineXi, "TouchLine XI");
    assert.equal(rankings.ownerLeagueTable, "ClubOwner Table");
    assert.deepEqual(placeholders(core.contractTerminationWarning), ["incoming", "outgoing"]);
    assert.deepEqual(placeholders(core.checkoutCompleted), ["count", "total"]);
  });
}

test("translation columns identify each language and Arabic has actual Arabic copy", () => {
  assert.deepEqual(TOUCHLINE_DRAFT_LOCALES.map((locale) => touchlineCoreDrafts[locale].language),
    ["Idioma", "Lingua", "Langue", "اللغة", "Dil", "Sprache"]);
  for (const text of [touchlineCoreDrafts["ar-SA"].contractTerminationWarning,
    touchlineAuthDrafts["ar-SA"].form.terms, touchlineRankingsDrafts["ar-SA"].rankingDescription]) {
    assert.match(text, /[\u0600-\u06ff]/);
  }
  // This asserts text coverage, not rendered RTL or native linguistic review.
});

test("coverage oracle rejects missing keys, wrong list lengths, placeholders and copied English sentences", () => {
  assert.doesNotThrow(() => verifyCopy("Close all", "Cerrar todo", "valid-Spanish"));
  assert.throws(() => verifyCopy({ title: "Title" }, {}, "missing"));
  assert.throws(() => verifyCopy(["One", "Two"], ["Uno"], "list"));
  assert.throws(() => verifyCopy("Hello {name}", "Hola {player}", "placeholder"));
  assert.throws(() => verifyCopy("Hello", "", "empty"));
  for (const marker of ["TODO", "FIXME", "[translate]", "[TRANSLATE]", "[missing]", "[MISSING]"]) {
    assert.throws(() => verifyCopy("Hello", marker, "explicit-marker"));
  }
  const sentence = "This full English sentence must not be a translation fallback.";
  assert.throws(() => verifyCopy(sentence, sentence, "fallback"));
});
