import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTouchlineFantasyMarketClock, formatTouchlineFantasyDeadline } from '../lib/touchlineFantasy/domain.ts';
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from '../lib/touchlineArena/i18n.ts';

const codes = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'] as const;
const load = () => import('../lib/touchlineFantasy/market-clock-i18n.ts');
const now = Date.parse('2026-10-03T12:00:00.000Z');
const iso = (delta: number) => new Date(now + delta).toISOString();
type Gameweeks = Parameters<typeof resolveTouchlineFantasyMarketClock>[0];
function rounds(phase: 'closing' | 'opening' | 'awaiting-final' | 'syncing', seconds = 3662): Gameweeks {
  const target = iso(seconds * 1000);
  return [{ number: 6, state: phase === 'closing' ? 'MARKET_OPEN' : 'UPCOMING',
    marketOpensAt: phase === 'opening' ? target : phase === 'awaiting-final' ? iso(172800000 - 1) : iso(-1000),
    locksAt: phase === 'closing' ? target : iso(172800000) }];
}

// Actual clock function + JSX, with only React lifecycle/time controlled. The
// real canonical resolver and London formatter are used; no window algorithm
// or rendering implementation is copied into the fixture.
function renderClock(input: { locale: string; gameweeks?: Gameweeks; nowMs?: number | null; marketStatus?: string; bindings?: object }) {
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('Fantasy.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['MarketWindowClock', 'countdownUnit'].includes(node.name?.text ?? ''));
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@/lib/touchlineFantasy/market-clock-i18n');
  assert.ok(declarations.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MarketWindowClock'));
  const output = ts.transpileModule(`${imports.map(node => node.getText(ast)).join('\n')}\n${declarations.map(node => node.getText(ast)).join('\n')}\nexport { MarketWindowClock };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const effects: Array<() => () => void> = [];
  const intervals: number[] = []; const cleared: number[] = []; const ticks: number[] = [];
  const exports: { MarketWindowClock?: (props: object) => Parameters<typeof renderToStaticMarkup>[0] } = {};
  runInNewContext(output, {
    exports,
    require(name: string) { if (name === 'react/jsx-runtime') return jsx; assert.equal(name, '@/lib/touchlineFantasy/market-clock-i18n'); return input.bindings; },
    useState: () => [input.nowMs === undefined ? now : input.nowMs, (value: number) => ticks.push(value)],
    useMemo: (callback: () => unknown) => callback(), useEffect: (callback: () => () => void) => effects.push(callback),
    resolveTouchlineFantasyMarketClock, formatTouchlineFantasyDeadline,
    styles: new Proxy({}, { get: (_target, key) => String(key) }), TimerReset: function TimerFixture() { return null; },
    Date: class ClockDate extends Date { static now() { return now; } },
    window: { setInterval(_callback: () => void, delay: number) { intervals.push(delay); return 7; }, clearInterval(id: number) { cleared.push(id); } },
  });
  const html = renderToStaticMarkup(exports.MarketWindowClock!({ locale: input.locale, gameweeks: input.gameweeks ?? [], marketStatus: input.marketStatus }));
  for (const effect of effects) effect()();
  assert.deepEqual(intervals, [1000]); assert.deepEqual(cleared, [7]); assert.deepEqual(ticks, [now]);
  return html;
}

test('eight clock catalogues have matching keys/placeholders and six remain drafts behind the public gate', async () => {
  const mod = await load();
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_FANTASY_MARKET_CLOCK_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_FANTASY_MARKET_CLOCK_DRAFT_STATUS, 'draft');
  const english = mod.TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES['en-GB'];
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(english));
    for (const [key, value] of Object.entries(copy)) {
      if (key === 'units') continue;
      assert.equal(typeof value, 'string'); assert.ok(String(value).trim());
      assert.doesNotMatch(String(value), /TODO|FIXME/);
    }
    for (const key of ['closesAt', 'reopensAt'] as const) {
      assert.equal(copy[key].match(/\{deadline\}/g)?.length, 1);
      assert.match(copy[key], /24|٢٤/);
    }
    for (const unit of ['hour', 'minute', 'second'] as const) {
      assert.ok(copy.units[unit].one); assert.ok(copy.units[unit].other);
      for (const form of Object.values(copy.units[unit])) assert.equal(form.match(/\{count\}/g)?.length, 1);
    }
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(mod.getTouchlineFantasyMarketClockCopy(locale), english);
      assert.notEqual(copy.awaitingFinal, english.awaitingFinal);
    }
  }
  assert.deepEqual(Object.keys(mod.TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES['ar-SA'].units.hour), ['zero', 'one', 'two', 'few', 'many', 'other']);
});

test('real clock fixes Portuguese non-countdown open/closed fallbacks without changing English', async () => {
  let bindings: object | undefined;
  try { bindings = await load(); } catch { /* Baseline component can render before extraction. */ }
  for (const locale of ['pt-BR', 'en-GB']) {
    for (const phase of ['closing', 'opening', 'awaiting-final'] as const) {
      const html = renderClock({ locale, gameweeks: rounds(phase, 90000), bindings });
      const expected = locale === 'pt-BR' ? (phase === 'closing' ? 'Mercado aberto' : 'Mercado fechado') : (phase === 'closing' ? 'Market Open' : 'Market Closed');
      assert.ok(html.includes(`<strong class="clockRule">${expected}</strong>`));
      assert.doesNotMatch(html, /<time/);
    }
  }
});

test('real rendered clock preserves EN/PT loading, unavailable, canonical final and syncing text', async () => {
  const bindings = await load();
  for (const locale of ['pt-BR', 'en-GB']) {
    const pt = locale === 'pt-BR';
    for (const nowMs of [null, now]) {
      const html = renderClock({ locale, nowMs, bindings });
      assert.ok(html.includes(`<b>${pt ? 'Próxima janela' : 'Next window'}</b>`));
      assert.ok(html.includes(pt ? 'Horário em confirmação' : 'Time to be confirmed'));
      assert.ok(html.includes(pt ? 'A confirmar' : 'To be confirmed'));
      assert.match(html, new RegExp(`data-market-clock-phase="${nowMs === null ? 'loading' : 'unavailable'}"`));
    }
    const finalHtml = renderClock({ locale, gameweeks: rounds('awaiting-final'), bindings });
    assert.ok(finalHtml.includes(pt ? 'Último apito da rodada' : 'Last whistle of the round'));
    assert.ok(finalHtml.includes(pt ? 'Reabre quando o provedor confirmar o fim do último jogo. Sem horário estimado.' : 'Reopens when the provider confirms the last match has ended. No estimated time.'));
    assert.doesNotMatch(finalHtml, /<time|clockDigits/);
    const syncing = renderClock({ locale, gameweeks: rounds('syncing'), bindings });
    assert.ok(syncing.includes(pt ? 'Atualizando o Meu Clube' : 'Updating My Club'));
    assert.ok(syncing.includes(pt ? 'Sincronizando a janela canônica' : 'Syncing the canonical window'));
    assert.doesNotMatch(syncing, /<time|clockDigits/);
  }
});

test('actual clock keeps 24-hour threshold, deadline, London formatting, H/M/S digits and singular/plural ARIA', async () => {
  const bindings = await load();
  for (const locale of ['pt-BR', 'en-GB']) {
    const pt = locale === 'pt-BR';
    for (const phase of ['closing', 'opening'] as const) {
      for (const seconds of [1, 3661, 7322, 86400, 86401]) {
        const gameweeks = rounds(phase, seconds); const html = renderClock({ locale, gameweeks, bindings });
        const target = phase === 'closing' ? gameweeks[0].locksAt : gameweeks[0].marketOpensAt;
        const formatted = formatTouchlineFantasyDeadline(target, locale);
        assert.ok(html.includes(formatted));
        if (seconds <= 86400) {
          assert.match(html, /class="clockDigits" aria-hidden="true"/);
          assert.ok(html.includes(`dateTime="${target}"`));
          assert.ok(html.includes(`${formatted} · ${pt ? 'Londres' : 'London'}`));
          assert.ok(html.includes(pt ? (phase === 'closing' ? 'Mercado fecha em' : 'Mercado reabre em') : (phase === 'closing' ? 'Market closes in' : 'Market reopens in')));
          const values = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60];
          const expected = values.map((value, index) => `${value} ${(pt ? [['hora', 'horas'], ['minuto', 'minutos'], ['segundo', 'segundos']] : [['hour', 'hours'], ['minute', 'minutes'], ['second', 'seconds']])[index][value === 1 ? 0 : 1]}`).join(', ');
          assert.ok(html.includes(expected));
          for (const label of ['H', 'M', 'S']) assert.ok(html.includes(`<small>${label}</small>`));
        } else {
          assert.doesNotMatch(html, /<time|clockDigits/);
          assert.ok(html.includes(pt ? 'O cronômetro inicia 24h antes.' : 'The countdown starts 24 hours before.'));
        }
      }
    }
  }
});

test('six drafts and invalid locales cannot bypass the public gate in the actual clock or countdown helper', async () => {
  const bindings = await load();
  for (const locale of [...codes.slice(2), '', 'invalid']) {
    for (const phase of ['closing', 'opening', 'awaiting-final', 'syncing'] as const) {
      assert.equal(renderClock({ locale, gameweeks: rounds(phase), bindings }), renderClock({ locale: 'en-GB', gameweeks: rounds(phase), bindings }));
    }
    assert.equal(bindings.formatTouchlineFantasyClockUnit(0, 'hour', locale), '0 hours');
    assert.equal(bindings.formatTouchlineFantasyClockUnit(1, 'minute', locale), '1 minute');
    assert.equal(bindings.formatTouchlineFantasyClockUnit(2, 'second', locale), '2 seconds');
  }
});

test('real consumer reads catalogue text while preserving supplied market status verbatim', async () => {
  const mod = await load();
  const copy = mod.getTouchlineFantasyMarketClockCopy('en-GB');
  const sentinel = Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, typeof value === 'string' ? `copy:${key}${key.endsWith('At') ? ':{deadline}' : ''}` : value]));
  const bindings = { getTouchlineFantasyMarketClockCopy: () => sentinel, formatTouchlineFantasyClockUnit: (value: number, unit: string) => `count:${value}:${unit}` };
  const timed = renderClock({ locale: 'pt-BR', gameweeks: rounds('closing'), bindings, marketStatus: 'Canonical status <untouched>' });
  assert.match(timed, /copy:closesIn/); assert.match(timed, /count:1:hour, count:1:minute, count:2:second/);
  assert.match(timed, /copy:london/); assert.match(timed, /copy:hourShort/);
  assert.match(timed, /Canonical status &lt;untouched&gt;/);
  for (const phase of ['closing', 'opening', 'awaiting-final', 'syncing'] as const) {
    const html = renderClock({ locale: 'pt-BR', gameweeks: rounds(phase, 90000), bindings });
    assert.match(html, /copy:/); assert.doesNotMatch(html, /Mercado|Market Open|Market Closed|Sincronizando|Último apito/);
  }
});
