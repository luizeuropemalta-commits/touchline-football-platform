import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import * as copy from '../lib/touchlineArena/rankings-i18n.ts';
import * as presentation from '../lib/touchlineArena/tables-presentation-i18n.ts';
import * as catalogue from '../lib/touchlineArena/catalogue-locale.ts';
import * as i18n from '../lib/touchlineArena/i18n.ts';
import * as navigation from '../lib/touchlineArena/global-navigation.ts';
import * as access from '../lib/touchlineArena/auth-access.ts';

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


type Element = React.ReactElement<Record<string, unknown>>;
const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', app_metadata: { touchline_arena_access_v1: true } };
const customer = { ...owner, email: 'customer@example.test' };
function nodes(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as React.ReactNode)] : []);
}
function compile(source: string, context: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, ...context });
  return exports;
}
async function render(receipt: unknown, options: { authFailure?: Error; probe?: { authReads: number; pageReturned: boolean } } = {}) {
  let authReads = 0;
  const ownerModule = compile(readFileSync(new URL('../lib/admin/owner.ts', import.meta.url), 'utf8'), {
    process: { env: { TOUCHLINE_OWNER_EMAILS: 'owner@example.test' } },
  });
  const leaf = () => null;
  const modules: Record<string, unknown> = {
    react: React, 'react/jsx-runtime': jsx, '@supabase/supabase-js': { AuthSessionMissingError },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => {
      authReads++;
      if (options.probe) options.probe.authReads++;
      if (options.authFailure) throw options.authFailure;
      return receipt;
    } } }) },
    '@/lib/admin/owner': ownerModule,
    '@/lib/touchlineArena/auth-access': access,
    '@/lib/touchlineArena/global-navigation': navigation,
    '@/lib/touchlineArena/rankings-i18n': copy,
    '@/lib/touchlineArena/tables-presentation-i18n': presentation,
    '@/lib/touchlineArena/catalogue-locale': catalogue,
    '@/lib/touchlineArena/i18n': i18n,
    '@/lib/touchlineArena/ranking-load-diagnostics': { createRankingLoadDiagnostics: () => ({ measure: (_key: string, work: () => unknown) => work(), seal: () => {} }) },
    '@/lib/touchlineArena/card-ranking-server': { loadTouchLineActiveRanking: async () => ({ phase: 'ranked', snapshotId: 'player-snapshot' }), loadTouchLinePublishedTopEleven: async () => null },
    '@/lib/touchlineArena/ranked-card-catalog-server': { loadTouchLineRankedCardCatalog: async () => [] },
    '@/lib/touchlineArena/card-publication-read-model': { countTouchlinePublishedPlayerCards: async () => 0 },
    '@/lib/touchlineArena/coach-ranking-server': { loadTouchLineCoachRanking: async () => ({ snapshotId: 'coach-snapshot' }) },
    '@/lib/football-data/fixture-schedule-store': { readPublicCompetitionFixtures: async () => [] },
    '@/lib/touchlineArena/rankings-highlight-projection': { projectTouchlineRankingsHighlights: () => ({}) },
    '@/lib/touchlineArena/arena-fixture-round': { selectArenaFixtureRound: () => [] },
    '@/lib/touchlineArena/card-leadership-authority': { buildTouchlineCardLeadershipValue: () => ({}) },
    '@/components/touchline/cards/TouchlineCardLeadershipProvider': { TouchlineCardLeadershipProvider: leaf },
    '@/components/touchline/TouchlineBrandHeader': { default: leaf },
    '@/components/touchline/TouchlineGlobalNavigation': { default: leaf },
    '@/components/touchline/TouchlineLivePresentationRefresh': { default: leaf },
    'lucide-react': { ShieldCheck: leaf },
    './touchline-tables.module.css': { default: {} },
    './touchline-tables-client': Object.fromEntries(['default', 'TouchlineCoachRankingTable', 'TouchlineRankingPodium', 'TouchlineRankingPodiumPending', 'TouchlineRankingEnding', 'TouchlineRankingsHero', 'TouchlineFeaturedCoach'].map(name => [name, leaf])),
  };
  const source = readFileSync(new URL('../app/rankings/page.tsx', import.meta.url), 'utf8');
  const mod = compile(source, { require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy; assert.ok(name in modules, name); return modules[name]; } });
  const page = await (mod.default as (props: object) => Promise<Element>)({ searchParams: Promise.resolve({ lang: 'pt-BR' }) });
  if (options.probe) options.probe.pageReturned = true;
  const all = nodes(page);
  const nav = all.find(node => node.props.currentRoute === 'rankings');
  const brand = all.find(node => node.props.accountLocaleContext);
  const frame = all.find(node => typeof node.type === 'function' && node.type.name === 'SportingFrame');
  assert.ok(nav && brand && frame);
  const frameTree = await (frame.type as (props: object) => Promise<Element>)(frame.props);
  const content = nodes(frameTree).filter(node => typeof node.type === 'function' && node.type.name === 'SportingContent');
  const capabilities: boolean[] = [];
  for (const node of content) {
    const result = await (node.type as (props: object) => Promise<Element>)(node.props);
    if (Object.hasOwn(result.props, 'canEditCardEngine')) capabilities.push(result.props.canEditCardEngine as boolean);
  }
  assert.equal(capabilities.length, 2, 'both overview and podium real render paths must be exercised');
  assert.equal(authReads, 1);
  return { surface: nav.props.surface, context: brand.props.accountLocaleContext, frameUser: frame.props.user, capabilities };
}

// This verifies rendered identity/capability presentation only, not permission
// to invoke the separate Card Engine APIs or persistence operations.
for (const [role, user] of [['owner', owner], ['customer', customer]] as const) {
  test(`Rankings ${role} retained in an error receipt grants no authenticated presentation`, async () => {
    const result = await render({ data: { user }, error: new Error('synthetic auth failure') });
    assert.deepEqual(result.capabilities, [false, false]);
    assert.equal(result.surface, 'public');
    assert.equal(result.frameUser, null);
    assert.equal(JSON.stringify(result.context), JSON.stringify({ mode: 'unavailable' }));
  });
}

test('Rankings missing error marker and contradictory missing-session receipt cannot retain owner capability', async () => {
  for (const receipt of [{ data: { user: owner } }, { data: { user: owner }, error: new AuthSessionMissingError() }]) {
    const result = await render(receipt);
    assert.deepEqual(result.capabilities, [false, false]);
    assert.equal(result.surface, 'public');
    assert.equal(result.frameUser, null);
    assert.equal(JSON.stringify(result.context), JSON.stringify({ mode: 'unavailable' }));
  }
});

test('Rankings successful owner/customer and verified guest preserve their distinct presentation contracts', async () => {
  for (const [user, surface, edit] of [[owner, 'auth', true], [customer, 'authenticated', false], [null, 'public', false]] as const) {
    const result = await render({ data: { user }, error: null });
    assert.equal(result.surface, surface);
    assert.equal(result.frameUser, user);
    assert.deepEqual(result.capabilities, [edit, edit]);
    assert.equal(JSON.stringify(result.context), JSON.stringify(user ? { mode: 'account', accountId: user.id } : { mode: 'guest' }));
  }
});

test('Rankings malformed receipts cannot supply authenticated navigation, account context or edit capability', async () => {
  for (const receipt of [null, undefined, {}, { data: null, error: null }, { data: {}, error: null }]) {
    const result = await render(receipt);
    assert.equal(result.surface, 'public');
    assert.equal(result.frameUser, null);
    assert.deepEqual(result.capabilities, [false, false]);
    assert.equal(JSON.stringify(result.context), JSON.stringify({ mode: 'unavailable' }));
  }
});

test('Rankings recognizes only canonical missing-session error as a verified guest', async () => {
  for (const [error, mode] of [[new AuthSessionMissingError(), 'guest'], [{ name: 'AuthSessionMissingError' }, 'unavailable']] as const) {
    const result = await render({ data: { user: null }, error });
    assert.equal(result.surface, 'public');
    assert.equal(result.frameUser, null);
    assert.deepEqual(result.capabilities, [false, false]);
    assert.equal(JSON.stringify(result.context), JSON.stringify({ mode }));
  }
});

test('Rankings rejected getUser propagates failure without returning any identity-bearing page', async () => {
  const failure = new Error('synthetic rejected getUser');
  const probe = { authReads: 0, pageReturned: false };
  await assert.rejects(render({ data: { user: owner }, error: null }, { authFailure: failure, probe }), error => error === failure);
  assert.equal(probe.authReads, 1);
  assert.equal(probe.pageReturned, false);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/rankings")');
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
