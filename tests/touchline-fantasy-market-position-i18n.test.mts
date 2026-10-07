import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as localeModule from '../lib/touchlineArena/i18n.ts';
import * as positions from '../lib/touchlineArena/position-eligibility.ts';

const codes = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'] as const;
const buckets = ['goalkeeper', 'centre-back', 'right-back', 'left-back', 'defensive-midfield', 'midfield', 'attacker', 'centre-forward', 'outfield'] as const;
const suffixes = ['GK', 'CB', 'RB', 'LB', 'CDM', 'MID', 'ATT', 'ST'];
const baseline = {
  'en-GB': ['Goalkeeper / GK', 'Centre-back / CB', 'Right-back / RB', 'Left-back / LB', 'Defensive midfielder / CDM', 'Midfielder / MID', 'Attacker / ATT', 'Centre-forward / ST', 'Position pending classification'],
  'pt-BR': ['Goleiro / GK', 'Zagueiro / CB', 'Lateral direito / RB', 'Lateral esquerdo / LB', 'Volante / CDM', 'Meia / MID', 'Atacante / ATT', 'Centroavante / ST', 'Posição em classificação'],
};
const load = () => import('../lib/touchlineArena/market-position-i18n.ts');

test('position catalogue has nine canonical IDs across eight locales; tactical abbreviations remain unchanged', async () => {
  const mod = await load();
  assert.deepEqual(localeModule.TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_MARKET_POSITION_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_MARKET_POSITION_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_MARKET_POSITION_DRAFT_STATUS, 'draft');
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_MARKET_POSITION_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), buckets);
    buckets.forEach((bucket, index) => {
      const label = copy[bucket];
      assert.equal(typeof label, 'string');
      assert.ok(label.trim());
      assert.doesNotMatch(label, /TODO|FIXME|\[(?:translate|missing)\]/);
      if (index < suffixes.length) assert.ok(label.endsWith(` / ${suffixes[index]}`));
    });
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(localeModule.isTouchLineLocaleComplete(locale), false);
      assert.notEqual(copy.outfield, baseline['en-GB'][8]);
    }
  }
  assert.match(mod.TOUCHLINE_MARKET_POSITION_CATALOGUES['ar-SA'].goalkeeper, /[\u0600-\u06ff]/);
});

test('real position label consumer preserves every public EN/PT label and unknown-bucket fallback', () => {
  for (const locale of ['en-GB', 'pt-BR'] as const) {
    buckets.forEach((bucket, index) => assert.equal(positions.touchlineMarketPositionBucketLabel(bucket, locale), baseline[locale][index]));
    for (const unknown of ['unknown', '', '__proto__', 'constructor', 'toString']) {
      assert.equal(positions.touchlineMarketPositionBucketLabel(unknown as positions.TouchlineMarketPositionBucket, locale), baseline[locale][8]);
    }
  }
});

test('six draft languages and invalid locales remain gated in both catalogue getter and actual consumer', async () => {
  const mod = await load();
  for (const locale of [...codes.slice(2), null, undefined, '', 'unknown', 'fr']) {
    assert.equal(mod.getTouchlineMarketPositionCopy(locale), mod.TOUCHLINE_MARKET_POSITION_CATALOGUES['en-GB']);
    buckets.forEach((bucket, index) => assert.equal(positions.touchlineMarketPositionBucketLabel(bucket, locale), baseline['en-GB'][index]));
  }
  assert.equal(mod.getTouchlineMarketPositionCopy('pt-BR'), mod.TOUCHLINE_MARKET_POSITION_CATALOGUES['pt-BR']);
});

test('actual position label getter consumes the new catalogue without a parallel inline label table', () => {
  const source = readFileSync(new URL('../lib/touchlineArena/position-eligibility.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sentinel = Object.fromEntries(buckets.map(bucket => [bucket, `catalogue:${bucket}`]));
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  const requested: unknown[] = [];
  runInNewContext(output, { exports, require(name: string) {
    if (name === './i18n.ts') return localeModule;
    assert.equal(name, './market-position-i18n.ts');
    return { getTouchlineMarketPositionCopy(locale: unknown) { requested.push(locale); return sentinel; } };
  } });
  for (const bucket of buckets) assert.equal(exports.touchlineMarketPositionBucketLabel(bucket, 'pt-BR'), `catalogue:${bucket}`);
  assert.deepEqual(requested, buckets.map(() => 'pt-BR'));
  assert.equal(exports.touchlineMarketPositionBucketLabel('constructor', 'en-GB'), 'catalogue:outfield');
});

test('presentation extraction never changes canonical IDs, eligibility, counts, sequence or limits', async () => {
  const mod = await load();
  assert.deepEqual(positions.TOUCHLINE_MARKET_POSITION_BUCKETS, buckets);
  assert.deepEqual(positions.TOUCHLINE_MARKET_POSITION_SEQUENCE, buckets.slice(0, -1));
  const limits = { goalkeeper: 3, 'centre-back': 6, 'right-back': 2, 'left-back': 2, 'defensive-midfield': 5, midfield: 6, attacker: 6, 'centre-forward': 5, outfield: 0 };
  assert.deepEqual(positions.TOUCHLINE_MARKET_POSITION_LIMITS, limits);
  assert.equal(positions.TOUCHLINE_MARKET_APPROVED_SQUAD_SIZE, 35);
  const inputs = [
    { position: 'GK', role: 'goalkeeper' }, { position: 'CB', role: 'defender' },
    { position: 'RB', role: 'defender' }, { position: 'LB', role: 'defender' },
    { position: 'CDM', role: 'midfielder' }, { position: 'CAM', role: 'midfielder' },
    { position: 'RW', role: 'forward' }, { position: 'CF', role: 'forward' },
    { position: null, role: 'forward' },
  ] as const;
  const before = JSON.stringify(inputs);
  for (const locale of codes) {
    for (const bucket of buckets) assert.ok(mod.TOUCHLINE_MARKET_POSITION_CATALOGUES[locale][bucket]);
    assert.deepEqual(inputs.map(input => positions.touchlineMarketPositionBucket(input.position, input.role)), buckets);
    assert.deepEqual(positions.touchlineMarketPositionBucketCount([...inputs]), Object.fromEntries(buckets.map(bucket => [bucket, 1])));
    assert.deepEqual(positions.touchlineMarketPositionProgress({ 'centre-forward': 5, midfield: -2, outfield: 1 }).filter(row => ['centre-forward', 'midfield', 'outfield'].includes(row.bucket)), [
      { bucket: 'midfield', count: 0, limit: 6, isFull: false },
      { bucket: 'centre-forward', count: 5, limit: 5, isFull: true },
      { bucket: 'outfield', count: 1, limit: 0, isFull: true },
    ]);
  }
  assert.equal(JSON.stringify(inputs), before);
});
