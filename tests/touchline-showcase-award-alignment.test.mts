import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('player showcase reserves shared award clearance without resizing cards', () => {
  const css = readFileSync(new URL('../components/touchline/TouchlineCoachCategoryShowcase.module.css', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../components/touchline/cards/TouchlineEliteExactCard.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.playerCardVisual\s*\{[^}]*--touchline-card-reserve-head-award:\s*1;/);
  assert.match(card, /var\(--touchline-card-reserve-head-award, 0\)/);
});
