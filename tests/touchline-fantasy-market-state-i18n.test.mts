import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from '../lib/touchlineArena/i18n.ts';

const codes = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'] as const;
const states = ['UPCOMING', 'MARKET_OPEN', 'LOCKED', 'LIVE', 'FINAL', 'SETTLED'] as const;
const steps = ['coach', 'formation', 'players', 'review', 'locked'] as const;
const errors = ['TL_FANTASY_BUDGET_EXCEEDED', 'TL_FANTASY_GAMEWEEK_LOCKED', 'TL_FANTASY_XI_REQUIRES_11', 'TL_FANTASY_SELECTION_INELIGIBLE', 'TL_FANTASY_ENTITLEMENT_REQUIRED'] as const;
const baseline = {
  'en-GB': {
    states: ['Upcoming', 'Market open', 'Locked', 'Live', 'Final', 'Settled'],
    steps: ['Coach', 'Formation', 'Starting XI', 'Review', 'Arena sync'],
    errors: ['This team exceeds the €900M budget.', 'The market is closed for this Gameweek.', 'Complete exactly 11 players before confirming.', 'One selected card is no longer eligible. Replace it and save again.', 'Gameweek access is not active for this account.'],
    errorFallback: 'Unable to save your team.', unavailableTitle: 'My Club', unavailableMessage: 'Service temporarily unavailable.',
  },
  'pt-BR': {
    states: ['Em breve', 'Mercado aberto', 'Bloqueada', 'Ao vivo', 'Final', 'Liquidada'],
    steps: ['Treinador', 'Formação', '11 jogadores', 'Revisão', 'Enviar à Arena'],
    errors: ['Este time ultrapassa o orçamento de €900M.', 'O mercado está fechado para esta rodada.', 'Complete exatamente 11 jogadores antes de confirmar.', 'Um card escolhido não está mais elegível. Troque-o e salve novamente.', 'O acesso à rodada não está ativo nesta conta.'],
    errorFallback: 'Não foi possível salvar sua equipe.', unavailableTitle: 'Meu Clube', unavailableMessage: 'Serviço temporariamente indisponível.',
  },
};
const load = () => import('../lib/touchlineFantasy/market-state-i18n.ts');

test('current Market state catalogue covers exactly eight approved locales; six remain explicit drafts', async () => {
  const mod = await load();
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_FANTASY_MARKET_STATE_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_FANTASY_MARKET_STATE_DRAFT_STATUS, 'draft');
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy.states), states);
    assert.deepEqual(Object.keys(copy.steps), steps);
    assert.deepEqual(Object.keys(copy.errors), errors);
    for (const value of [...Object.values(copy.states), ...Object.values(copy.steps), ...Object.values(copy.errors), copy.errorFallback, copy.unavailableTitle, copy.unavailableMessage]) {
      assert.equal(typeof value, 'string'); assert.ok(value.trim());
      assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]/);
    }
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(mod.getTouchlineFantasyMarketStateCopy(locale), mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES['en-GB']);
      assert.notEqual(copy.unavailableMessage, baseline['en-GB'].unavailableMessage);
    }
  }
  for (const locale of [null, undefined, '', 'fr', 'invalid']) {
    assert.equal(mod.getTouchlineFantasyMarketStateCopy(locale), mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES['en-GB']);
  }
});

test('live EN/PT state, step and error wording remains byte-for-byte compatible', async () => {
  const mod = await load();
  for (const locale of ['en-GB', 'pt-BR'] as const) {
    const expected = baseline[locale];
    states.forEach((state, index) => assert.equal(mod.touchlineFantasyStatusCopy(state, locale), expected.states[index]));
    steps.forEach((step, index) => assert.equal(mod.touchlineFantasyStepLabel(step, locale), expected.steps[index]));
    errors.forEach((code, index) => assert.equal(mod.touchlineFantasyLineupErrorCopy(code, locale), expected.errors[index]));
    const copy = mod.getTouchlineFantasyMarketStateCopy(locale);
    assert.equal(copy.unavailableTitle, expected.unavailableTitle);
    assert.equal(copy.unavailableMessage, expected.unavailableMessage);
  }
});

test('unknown states and private error details use safe existing fallbacks, including prototype names', async () => {
  const mod = await load();
  for (const locale of ['en-GB', 'pt-BR'] as const) {
    for (const code of ['', 'constructor', '__proto__', 'toString', 'private database detail']) {
      assert.equal(mod.touchlineFantasyLineupErrorCopy(code, locale), baseline[locale].errorFallback);
      assert.equal(mod.touchlineFantasyStatusCopy(code, locale), '—');
    }
    assert.equal(mod.touchlineFantasyStatusCopy(undefined, locale), '—');
  }
});

test('draft phrases preserve current XI requirements without payment or legacy checkout concepts', async () => {
  const mod = await load();
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES[locale];
    assert.match(copy.errors.TL_FANTASY_XI_REQUIRES_11, /11|١١/);
    // This is the existing game budget, not a purchase price or wallet balance.
    assert.match(copy.errors.TL_FANTASY_BUDGET_EXCEEDED, /900|٩٠٠/);
    assert.match(copy.errors.TL_FANTASY_BUDGET_EXCEEDED, /€|يورو/);
    assert.doesNotMatch(JSON.stringify(copy), /checkout|stripe|\b0 TC\b|Touch Credits|subscription price|wallet balance/i);
  }
  assert.match(mod.TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES['ar-SA'].unavailableMessage, /[\u0600-\u06ff]/);
});

function consumer(bindings: Record<string, unknown>) {
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('FantasyGameweekClient.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@/lib/touchlineFantasy/market-state-i18n');
  assert.equal(imports.length, 1, 'the actual consumer must import the new state catalogue');
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['lineupErrorCopy', 'statusCopy', 'stepLabel'].includes(node.name?.text ?? ''));
  assert.equal(functions.length, 3);
  const calls: ts.CallExpression[] = [];
  let unavailable: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === '!snapshot' && ts.isReturnStatement(node.thenStatement)) unavailable = node.thenStatement.expression;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['lineupErrorCopy', 'statusCopy', 'stepLabel'].includes(node.expression.text)) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(unavailable, 'retain the actual missing-snapshot boundary');
  assert.deepEqual(calls.map(call => call.expression.getText(ast)), ['lineupErrorCopy', 'statusCopy', 'statusCopy', 'stepLabel'], 'exercise all four production call-sites');
  const script = `${imports.map(node => node.getText(ast)).join('\n')}\n${functions.map(node => node.getText(ast)).join('\n')}
    export { lineupErrorCopy, statusCopy, stepLabel };
    export function boundViews(locale: string, payload: { error?: string }, activeGameweek: { state?: string } | null, step: string, draftLocalesEnabled = false) {
      const pt = locale === 'pt-BR'; return [${calls.map(call => call.getText(ast)).join(',')}];
    }
    export function unavailableView(locale: string, embedded: boolean, draftLocalesEnabled = false) { const pt = locale === 'pt-BR'; const styles = { unavailable: 'unavailable' }; return (${unavailable.getText(ast)}); }`;
  const output = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  runInNewContext(output, { exports, require(name: string) {
    if (name === 'react/jsx-runtime') return jsx;
    assert.equal(name, '@/lib/touchlineFantasy/market-state-i18n'); return bindings;
  } });
  return exports;
}

test('actual Fantasy wrappers and unavailable JSX delegate to the catalogue, not duplicate bilingual strings', () => {
  const actual = consumer({
    touchlineFantasyLineupErrorCopy: (code: string, locale: string) => `${locale}:error:${code}`,
    touchlineFantasyStatusCopy: (state: string, locale: string) => `${locale}:state:${state}`,
    touchlineFantasyStepLabel: (step: string, locale: string) => `${locale}:step:${step}`,
    getTouchlineFantasyMarketStateCopy: (locale: string) => ({ unavailableTitle: `${locale}:title`, unavailableMessage: `${locale}:message` }),
  });
  for (const locale of [...codes, 'future-locale-sentinel']) {
    assert.equal(actual.lineupErrorCopy('example', locale), `${locale}:error:example`);
    assert.equal(actual.statusCopy('MARKET_OPEN', locale), `${locale}:state:MARKET_OPEN`);
    assert.equal(actual.stepLabel('players', locale), `${locale}:step:players`);
    assert.deepEqual(Array.from(actual.boundViews(locale, { error: 'example' }, { state: 'MARKET_OPEN' }, 'players') as string[]), [
      `${locale}:error:example`, `${locale}:state:MARKET_OPEN`, `${locale}:state:MARKET_OPEN`, `${locale}:step:players`,
    ]);
    for (const embedded of [false, true]) {
      const html = renderToStaticMarkup(actual.unavailableView(locale, embedded) as Parameters<typeof renderToStaticMarkup>[0]);
      assert.match(html, new RegExp(`<h1>${locale}:title</h1><p>${locale}:message</p>`));
      assert.match(html, new RegExp(`data-fantasy-context="${embedded ? 'my-club' : 'standalone'}"`));
      assert.doesNotMatch(html, /<button|<form|<a /);
    }
  }
});

test('actual consumer helpers and missing-snapshot render preserve EN/PT outcomes with real catalogue', async () => {
  const actual = consumer(await load());
  for (const locale of [...codes, 'invalid']) {
    const expected = baseline[locale === 'pt-BR' ? 'pt-BR' : 'en-GB'];
    states.forEach((state, index) => assert.equal(actual.statusCopy(state, locale), expected.states[index]));
    steps.forEach((step, index) => assert.equal(actual.stepLabel(step, locale), expected.steps[index]));
    errors.forEach((code, index) => assert.equal(actual.lineupErrorCopy(code, locale), expected.errors[index]));
    assert.deepEqual(Array.from(actual.boundViews(locale, { error: 'TL_FANTASY_BUDGET_EXCEEDED' }, { state: 'MARKET_OPEN' }, 'players') as string[]), [expected.errors[0], expected.states[1], expected.states[1], expected.steps[2]]);
    assert.deepEqual(Array.from(actual.boundViews(locale, { error: '__proto__' }, null, 'coach') as string[]), [expected.errorFallback, '—', '—', expected.steps[0]]);
    const html = renderToStaticMarkup(actual.unavailableView(locale, true) as Parameters<typeof renderToStaticMarkup>[0]);
    assert.match(html, new RegExp(`<h1>${expected.unavailableTitle}</h1>`));
    assert.ok(html.includes(`<p>${expected.unavailableMessage}</p>`));
  }
});

test('actual consumer call-sites forward explicit draft opt-in through state and unavailable views', async () => {
  const catalogue = await load();
  const actual = consumer(catalogue);
  for (const locale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']) {
    const expected = catalogue.getTouchlineFantasyMarketStateCopy(locale, true);
    assert.deepEqual(Array.from(actual.boundViews(locale, { error: 'unknown' }, { state: 'MARKET_OPEN' }, 'players', true) as string[]), [
      expected.errorFallback, expected.states.MARKET_OPEN, expected.states.MARKET_OPEN, expected.steps.players,
    ]);
    const html = renderToStaticMarkup(actual.unavailableView(locale, true, true) as Parameters<typeof renderToStaticMarkup>[0]);
    assert.ok(html.includes(expected.unavailableTitle));
    assert.ok(html.includes(expected.unavailableMessage));
  }
});
