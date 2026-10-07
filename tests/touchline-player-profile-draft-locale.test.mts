import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("profile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statements = page.statements.filter(statement =>
  ts.isFunctionDeclaration(statement)
    ? ["getTouchlinePlayerProfileCopy", "localizedPreferredFoot", "localizedTransferType", "localizedProfileRankingGroup", "formatTransferDate"].includes(statement.name?.text ?? "")
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ["copy", "profileChromeDrafts"].includes(declaration.name.getText(page))),
);
const exports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(statements.map(statement => statement.getText(page)).join("\n") + `
export { getTouchlinePlayerProfileCopy, localizedPreferredFoot, localizedTransferType, localizedProfileRankingGroup, formatTransferDate };
`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, normalizeTouchLineLocale, resolveTouchlineCatalogueLocale });
const getCopy = exports.getTouchlinePlayerProfileCopy as (locale?: string | null, draft?: boolean) => Record<string, string>;

const drafts = [
  ["es-ES", "Perfil del jugador + perfil de la tarjeta"],
  ["it-IT", "Profilo del giocatore + profilo della carta"],
  ["fr-FR", "Profil du joueur + profil de la carte"],
  ["ar-SA", "ملف اللاعب + ملف البطاقة"],
  ["tr-TR", "Oyuncu profili + kart profili"],
  ["de-DE", "Spielerprofil + Kartenprofil"],
] as const;

test("player profile chrome requires explicit draft opt-in for all six draft languages", () => {
  for (const [locale, title] of drafts) {
    assert.equal(getCopy(locale).eyebrow, getCopy("en-GB").eyebrow);
    assert.equal(getCopy(locale, false).eyebrow, getCopy("en-GB").eyebrow);
    assert.equal(getCopy(locale, true).eyebrow, title);
  }
});

test("profile chrome opt-in preserves established copy and fails closed for unsupported input", () => {
  for (const locale of ["en-GB", "pt-BR", "not-a-locale", "ar", undefined, null]) {
    assert.equal(JSON.stringify(getCopy(locale, true)), JSON.stringify(getCopy(locale)));
  }
});

test("partial chrome review does not activate a half-translated player route", () => {
  const routes = page.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement)
    && Boolean(statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)),
  );
  assert.equal(routes.length, 1, "inspect the actual default-exported route");
  assert.ok(routes[0].body);
  const wrapperCall = routes[0].body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(wrapperCall && ts.isCallExpression(wrapperCall));
  assert.equal(wrapperCall.expression.getText(page), "renderPlayerProfilePage");
  assert.equal(wrapperCall.arguments[1]?.getText(), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
  const renderer = page.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderPlayerProfilePage");
  assert.ok(renderer?.body);
  assert.equal(renderer.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  const calls: ts.CallExpression[] = [];
  const localeDeclarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "locale") {
      localeDeclarations.push(node);
    }
    node.forEachChild(visit);
  };
  visit(renderer.body);
  assert.equal(localeDeclarations.length, 1);
  const initializer = localeDeclarations[0].initializer;
  assert.ok(initializer && ts.isCallExpression(initializer));
  assert.equal(renderer.parameters[1].name.getText(page), "draftLocalesEnabled");
  assert.equal(initializer.expression.getText(page), "resolveTouchlineCatalogueLocale");
  assert.equal(initializer.arguments[1].getText(page), "draftLocalesEnabled");
  const copyCalls = calls.filter(call => call.expression.getText(page) === "getTouchlinePlayerProfileCopy");
  assert.equal(copyCalls.length, 1);
  assert.equal(copyCalls[0].arguments.length, 2, "route forwards its disabled internal gate");
  assert.equal(copyCalls[0].arguments[0].getText(page), "locale");
  assert.equal(copyCalls[0].arguments[1].getText(page), "draftLocalesEnabled");
  for (const call of calls) {
    const callee = call.expression.getText(page);
    if (["localizedPreferredFoot", "localizedTransferType", "localizedProfileRankingGroup"].includes(callee)) {
      assert.equal(call.arguments.length, 3, `${callee}: explicit disabled route gate`);
      assert.equal(call.arguments[1].getText(page), "locale");
      assert.equal(call.arguments[2].getText(page), "draftLocalesEnabled");
    }
  }
});

test("profile's categorical facts use translated labels without rewriting unknown facts", () => {
  const foot = exports.localizedPreferredFoot as (value: string | undefined, locale: string, draft?: boolean) => string | undefined;
  const transfer = exports.localizedTransferType as (value: string, locale: string, draft?: boolean) => string;
  const ranking = exports.localizedProfileRankingGroup as (value: string, locale: string, draft?: boolean) => string | undefined;
  const expectations = [
    ["en-GB", "Left", "Loan", "Goalkeepers"],
    ["pt-BR", "Esquerdo", "Empréstimo", "Goleiros"],
    ["es-ES", "Izquierdo", "Cesión", "Porteros"],
    ["it-IT", "Sinistro", "Prestito", "Portieri"],
    ["fr-FR", "Gauche", "Prêt", "Gardiens"],
    ["ar-SA", "اليسرى", "إعارة", "حراس المرمى"],
    ["tr-TR", "Sol", "Kiralama", "Kaleciler"],
    ["de-DE", "Links", "Leihe", "Torhüter"],
  ];
  for (const [locale, left, loan, goalkeeper] of expectations) {
    assert.equal(foot(" LEFT ", locale, true), left);
    assert.equal(transfer(" loan ", locale, true), loan);
    assert.equal(ranking("goalkeeper", locale, true), goalkeeper);
    assert.equal(foot(undefined, locale, true), undefined);
    assert.equal(foot("unconfirmed provider value", locale, true), "unconfirmed provider value");
    assert.equal(transfer("unconfirmed provider value", locale, true), "unconfirmed provider value");
    assert.equal(ranking("unknown-position", locale, true), undefined);
  }
  assert.equal(foot("Left", "pt-BR"), "Esquerdo");
  assert.equal(foot(" right ", "pt-BR"), "Direito");
  assert.equal(foot("both", "pt-BR"), "Ambidestro");
  assert.equal(foot("unconfirmed provider value", "pt-BR"), "unconfirmed provider value");
  assert.equal(transfer("Loan", "es-ES"), "Loan");
});

test("sporting transfer dates stay Gregorian even when the language requests another calendar", () => {
  const format = exports.formatTransferDate as (value: string | undefined, locale: string) => string;
  const date = "2026-10-04T12:00:00Z";
  for (const locale of ["ar-SA", "ar-SA-u-ca-islamic", "en-GB-u-ca-buddhist"]) {
    const expected = new Intl.DateTimeFormat(locale, { calendar: "gregory", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date));
    assert.equal(format(date, locale), expected);
  }
  assert.equal(format(undefined, "ar-SA"), "--");
  assert.equal(format("unconfirmed", "ar-SA"), "unconfirmed");
});

test("page-owned contract, provisional shirt and ranking copy is authored for every draft", () => {
  const expected = [
    ["es-ES", "Fichar jugador", "Contrato · 1 temporada", "#00 provisional"],
    ["it-IT", "Ingaggia giocatore", "Contratto · 1 stagione", "n. 00 provvisorio"],
    ["fr-FR", "Recruter le joueur", "Contrat · 1 saison", "n° 00 provisoire"],
    ["ar-SA", "التعاقد مع اللاعب", "عقد · موسم واحد", "رقم 00 مؤقت"],
    ["tr-TR", "Oyuncuyla sözleşme yap", "Sözleşme · 1 sezon", "geçici #00"],
    ["de-DE", "Spieler verpflichten", "Vertrag · 1 Saison", "vorläufige Nr. 00"],
  ];
  for (const [locale, action, term, shirt] of expected) {
    const text = getCopy(locale, true);
    assert.equal(text.contractPlayer, action);
    assert.equal(text.contractTerm, term);
    assert.equal(text.provisionalShirt, shirt);
    assert.match(text.cardTier, /Tier/);
    for (const key of ["rankingGoalkeeper", "rankingCentreBack", "rankingFullBack", "rankingMidfielder", "rankingWinger", "rankingStriker", "preferredLeft", "preferredRight", "preferredBoth", "transferType", "freeTransferType", "loanType", "loanReturnType", "loanEndType"]) {
      assert.ok(text[key]?.trim(), `${locale}:${key}`);
    }
  }
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
