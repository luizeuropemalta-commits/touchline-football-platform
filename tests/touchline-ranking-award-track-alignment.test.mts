import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('award frames reserve intrinsic header height instead of distributing free space into headers', () => {
  const css = readFileSync(new URL('../app/rankings/touchline-tables.module.css', import.meta.url), 'utf8');
  const block = css.match(/\.awardEntry,\s*\.awardPlaceholder\s*\{([^}]+)\}/)?.[1];
  assert.ok(block);
  assert.match(block, /grid-template-rows:\s*max-content\s+1fr/);
  assert.match(css, /\.awardHeader\s*\{[^}]*min-height:\s*62px/s);
  assert.match(css, /padding-top:\s*min\(50\.4px,\s*27\.2%\)/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{\s*\.awardPodium\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /:global\(\.touchline-card-surface\)[^{]*\{[^}]*margin-top:\s*0 !important/s);
});

test('coach award uses the same icon and stacked gold eyebrow/title structure as other awards', () => {
  const source = readFileSync(new URL('../app/rankings/touchline-tables-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Crown aria-hidden="true" \/>\s*<div><span>\{presentationCopy\.topCoachEyebrow\}<\/span><h3 id="top-coach-title">/);
  const copy = readFileSync(new URL('../lib/touchlineArena/tables-presentation-i18n.ts', import.meta.url), 'utf8');
  assert.match(copy, /topCoachEyebrow: \["MANAGER’S CROWN", "MANAGER’S CROWN"/);
});
