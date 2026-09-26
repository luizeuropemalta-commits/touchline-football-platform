import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('rank gems shrink exactly 15 percent without changing source art or row slots', () => {
  const css = readFileSync(new URL('../app/touchline-tables/touchline-tables.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.coachRankGem img\s*\{[^}]*transform: scale\(\.85\)/);
  assert.match(css, /\.coachList \.pointsValue\s*\{\s*margin-inline-end: 10px/);
});

test('shared scrollbars are 5px with interaction neon and native contrast fallback', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /::-webkit-scrollbar\s*\{ width: 5px !important; height: 5px !important;/);
  assert.match(css, /\*:is\(:hover, :focus-within, :active\)::-webkit-scrollbar-thumb/);
  assert.match(css, /background: #b8ff46 !important/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
