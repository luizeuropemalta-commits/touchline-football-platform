import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('outside squad replacement uses the same card-based swap dialog as the bench', () => {
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  const outside = source.slice(source.indexOf('area="outside" count={15} grouped'));
  const props = outside.slice(0, outside.indexOf('/>'));
  assert.match(props, /onFieldPlayer=\{playerId => setSquadSwap\(\{ playerId, outsideOnly: false \}\)\}/);
  assert.doesNotMatch(props, /onFieldPlayer=\{setPlacementPlayerId\}/);
});

test('swap confirmation renders two canonical cards with explicit incoming and outgoing labels', () => {
  const source = readFileSync(new URL('../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('comparisonPlayers.map'));
  assert.ok(source.includes('data-swap-player={player.playerId}'));
  assert.ok(source.includes('swapCopy.entering : swapCopy.leaving'));
  assert.ok(source.includes('data-swap-side={index === 0 ? "in" : "out"}'));
  assert.ok(source.includes('className={layout.swapSummary}'));
  assert.ok(source.includes('<ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />'));
  const preview = source.slice(source.indexOf('className={layout.swapPreview}'), source.indexOf('>{copy.confirmSquadChange}'));
  assert.doesNotMatch(preview, /<figcaption>|<p>\{card\?\.name/);
  assert.ok(source.includes('if (busy || !enabled || sending.current || choice.revision !== state.revision || !valid(choice.playerId, choice.destination)) return;'));
});

test('fluid comparison cards keep original frames and reserve equal award clearance', () => {
  const card = readFileSync(new URL('../components/touchline/fantasy/TouchlineGameweekCard.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../components/touchline/fantasy/ClubOwnerCollectionSlots.module.css', import.meta.url), 'utf8');
  assert.match(card, /const useLiveCompactAsset = !fitContainer && resolvedDisplayWidth <= 119;/);
  assert.match(css, /\.swapPreview \{[^}]*--touchline-card-reserve-head-award:1/);
});

test('both reserve banks share a gap exactly ten percent above the prior spacing', () => {
  const css = readFileSync(new URL('../components/touchline/fantasy/ClubOwnerCollectionSlots.module.css', import.meta.url), 'utf8');
  const gap = css.match(/\.technicalRow \.slots \{ gap:([\d.]+)px;/);
  assert.ok(gap);
  assert.equal(Number(gap[1]), 4 * 1.1);
});
