import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Forest crest uses a thin transparent silhouette behind the original asset', () => {
  const source = readFileSync(new URL('../components/touchline/cards/TouchlineEliteExactCard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data-crest-outline="nottingham"/);
  const css = readFileSync(new URL('../app/touchline-crest-visibility.css', import.meta.url), 'utf8');
  assert.match(css, /filter: url\("#touchline-proportional-crest-outline"\) !important/);
  assert.match(css, /nottingham-forest/);
  assert.match(source, /src=\{resolvedClubLogoUrl\}/);
});
