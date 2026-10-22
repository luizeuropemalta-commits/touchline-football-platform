import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('coach standings expand to all seven rows without an internal scroll viewport', () => {
  const css = readFileSync(new URL('../app/rankings/touchline-tables.module.css', import.meta.url), 'utf8');
  const panels = [...css.matchAll(/\.coachRankingPanel\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.ok(panels.some(block => /grid-template-rows:\s*auto auto/.test(block)));
  assert.ok(panels.some(block => /max-height:\s*none/.test(block)));
  assert.ok(panels.every(block => !/max-height:\s*\d/.test(block)));
  const lists = [...css.matchAll(/\.coachList\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.ok(lists.some(block => /overflow:\s*visible/.test(block)));
  assert.ok(lists.every(block => !/overflow(?:-y)?:\s*(?:auto|scroll)/.test(block)));
});
