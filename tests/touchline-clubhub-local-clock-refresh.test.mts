import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { formatTouchlineLocalKickoff } from '../lib/touchlineArena/local-kickoff.ts';

const root = new URL('../', import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const source = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('ClubHub matchup kickoff hydrates from explicit UTC to browser zone, independently of eight locales', () => {
  const code = source('components/touchline/ClubHubLocalKickoff.tsx').replace(/^import[\s\S]*?;\s*$/gm, '');
  let hydrated = false;
  const context = {
    formatTouchlineLocalKickoff,
    normalizeTouchlineMatchCentreTimeZone: (value: string) => value,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Malta' }) }) },
    useSyncExternalStore: (_subscribe: unknown, client: () => string, server: () => string) => hydrated ? client() : server(),
    require: () => ({ jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }) }),
    exports: {} as { default?: (props: Record<string, unknown>) => { props: Record<string, unknown> } },
  };
  runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = context.exports.default!;
  for (const locale of ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']) {
    const props = { startsAt: '2026-10-10T11:30:00Z', locale, draftLocalesEnabled: true, fallback: 'pending' };
    hydrated = false;
    assert.equal(render(props).props.children, `${formatTouchlineLocalKickoff(props.startsAt, 'UTC', locale, true)!.date} · ${formatTouchlineLocalKickoff(props.startsAt, 'UTC', locale, true)!.time} · ${formatTouchlineLocalKickoff(props.startsAt, 'UTC', locale, true)!.zoneName}`);
    hydrated = true;
    const expected = formatTouchlineLocalKickoff(props.startsAt, 'Europe/Malta', locale, true)!;
    assert.equal(render(props).props.children, `${expected.date} · ${expected.time} · ${expected.zoneName}`);
  }
  const winter = formatTouchlineLocalKickoff('2026-12-10T11:30:00Z', 'Europe/Malta', 'en-GB')!;
  assert.equal(winter.time, '12:30');
  assert.equal(render({ startsAt: null, locale: 'en-GB', fallback: 'pending' }).props.children, 'pending');
  const lineup = source('components/touchline/ClubHubOfficialLineup.tsx');
  assert.match(lineup, /<ClubHubLocalKickoff[\s\S]*?startsAt=\{matchup\.startsAtIso\}/);
});

test('ClubHub delegates periodic and T-24/T-1 refresh to the shared boundary without its own timer', () => {
  const code = source('components/touchline/club-hub/ClubHubNextFixtureCard.tsx');
  const ast = ts.createSourceFile('fixture.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && /useEffect|setTimeout|setInterval|fetch/.test(node.expression.getText(ast))) effects.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(effects.length, 0);
  assert.match(code, /serverRefreshAfterMs=\{contextWake \? null : refreshMs\}/);
  assert.match(code, /serverRefreshAt=\{contextWake && refreshMs !== null \? now \+ refreshMs : null\}/);
  assert.match(code, /serverRefreshScope=/);
  assert.match(code, /clubHubFixtureRailRefreshMs\(rail, displayedStartsAt, now\)/);
  assert.match(code, /const displayedStartsAt = nextOnly \? facts\?\.startsAt \?\? startsAt : startsAt/);
  assert.match(code, /Date\.parse\(displayedStartsAt\) - now/);
  // Real shared-store transitions/wakes, pending ownership and unmount are
  // exercised in touchline-live-refresh-lifecycle.test.mts.
});
