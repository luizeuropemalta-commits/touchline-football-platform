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

test('ClubHub refresh rearms for two completed cycles, waits for pending transition and cancels on unmount', () => {
  const code = source('components/touchline/club-hub/ClubHubNextFixtureCard.tsx');
  const ast = ts.createSourceFile('fixture.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect: ts.CallExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('router.refresh')) effect = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(effect);
  let next = 0, refreshes = 0;
  const timers = new Map<number, () => void>();
  const context = { refreshMs: 45000, isRefreshing: false,
    router: { refresh: () => { refreshes++; } },
    startRefresh: (work: () => void) => { context.isRefreshing = true; work(); },
    window: { setTimeout: (work: () => void) => { timers.set(++next, work); return next; }, clearTimeout: (id: number) => timers.delete(id) },
  };
  const callback = runInNewContext(ts.transpileModule(`(${effect.arguments[0].getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context) as () => (() => void) | undefined;
  const tick = () => { const [id, work] = [...timers][0]; timers.delete(id); work(); };
  const cleanup = callback(); assert.equal(timers.size, 1); tick(); assert.equal(refreshes, 1);
  cleanup?.(); assert.equal(context.isRefreshing, true); assert.equal(callback(), undefined); assert.equal(timers.size, 0);
  context.isRefreshing = false;
  const secondCleanup = callback(); tick(); assert.equal(refreshes, 2); secondCleanup?.();
  context.isRefreshing = false;
  const finalCleanup = callback(); assert.equal(timers.size, 1); finalCleanup?.(); assert.equal(timers.size, 0);
  assert.ok(effect.arguments[1].getText(ast).includes('isRefreshing'), 'transition completion must rearm the same cadence');
});
