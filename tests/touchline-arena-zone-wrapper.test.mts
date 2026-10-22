import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as zones from '../lib/touchlineArena/arena-online-hub.ts';

type Query = { lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] };
type Props = { params: Promise<{ zone: string }>; searchParams: Promise<Query> };
type Route = {
  default: (props: Props) => Promise<never>;
  generateStaticParams: () => { zone: string }[];
  generateMetadata: (props: Props) => Promise<{ title: string }>;
};
const expected = [
  ['live', '/live', 'Live'],
  ['bench', '/clubowner', 'Build your XI'],
  ['market', '/clubowner', 'TouchLine Market Transfer'],
  ['rankings', '/rankings', 'TouchLine Player Cards Ranking'],
  ['news', '/live', 'New Rumours'],
  ['watch', '/live', 'Watch Guide'],
] as const;
const input = (zone: string, query: Query = {}): Props => ({ params: Promise.resolve({ zone }), searchParams: Promise.resolve(query) });

// Execute only the exact wrapper after transpilation; never import Next/app runtime.
function wrapper() {
  const events: { kind: string; href?: string }[] = [];
  const redirected = new Error('synthetic redirect');
  const missing = new Error('synthetic notFound');
  const exported: Partial<Route> = {};
  const modules: Record<string, unknown> = {
    'next/navigation': {
      redirect(href: string): never { events.push({ kind: 'redirect', href }); throw redirected; },
      notFound(): never { events.push({ kind: 'notFound' }); throw missing; },
    },
    '@/lib/touchlineArena/arena-online-hub': zones,
  };
  const source = readFileSync(new URL('../app/arena/[zone]/page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(compiled.outputText, { exports: exported, require(name: string) {
    assert.ok(Object.hasOwn(modules, name), `unexpected wrapper dependency: ${name}`);
    return modules[name];
  } }, { timeout: 1000 });
  for (const key of ['default', 'generateStaticParams', 'generateMetadata'] as const) assert.equal(typeof exported[key], 'function');
  return { route: exported as Route, events, redirected, missing };
}

test('zone wrapper redirects all six retained destinations exactly once', async () => {
  for (const [zone, href] of expected) {
    const seam = wrapper();
    await assert.rejects(seam.route.default(input(zone)), error => error === seam.redirected);
    assert.deepEqual(seam.events, [{ kind: 'redirect', href }]);
  }
});

test('unknown, empty and case-mismatched zones stop at notFound without redirect', async () => {
  for (const zone of ['', 'unknown', 'LIVE', '../market']) {
    const seam = wrapper();
    await assert.rejects(seam.route.default(input(zone, { lang: 'pt-BR' })), error => error === seam.missing);
    assert.deepEqual(seam.events, [{ kind: 'notFound' }]);
  }
});

test('locale uses only the first value and encodes without forwarding retired switches', async () => {
  const cases: [Query, string][] = [
    [{}, '/clubowner'],
    [{ lang: '' }, '/clubowner'],
    [{ lang: [] }, '/clubowner'],
    [{ lang: ['', 'pt-BR'] }, '/clubowner'],
    [{ lang: 'pt-BR' }, '/clubowner?lang=pt-BR'],
    [{ lang: ['en-GB', 'pt-BR'], intro: 'first', skipIntro: '1' }, '/clubowner?lang=en-GB'],
    [{ lang: 'pt BR&next=/x?x=1#z' }, '/clubowner?lang=pt%20BR%26next%3D%2Fx%3Fx%3D1%23z'],
    [{ lang: '日本語' }, '/clubowner?lang=%E6%97%A5%E6%9C%AC%E8%AA%9E'],
  ];
  for (const [query, href] of cases) {
    const seam = wrapper();
    await assert.rejects(seam.route.default(input('market', query)), error => error === seam.redirected);
    assert.deepEqual(seam.events, [{ kind: 'redirect', href }]);
  }
});

test('static params and metadata preserve six named zones and unknown title fallback', async () => {
  const seam = wrapper();
  // Project VM arrays into host arrays to avoid prototype-only cross-realm failure.
  assert.deepEqual(Array.from(seam.route.generateStaticParams(), item => item.zone), expected.map(([zone]) => zone));
  for (const [zone, , title] of expected) {
    assert.equal((await seam.route.generateMetadata(input(zone))).title, `${title} | Touchline Arena`);
  }
  assert.equal((await seam.route.generateMetadata(input('unknown'))).title, 'Touchline Arena');
  assert.deepEqual(seam.events, []);
});
