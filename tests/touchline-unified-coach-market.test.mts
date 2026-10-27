import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const text = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('client.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
const market = find(source, node => ts.isJsxElement(node)
  && node.openingElement.attributes.getText(source).includes('id="my-club-player-selection"'))[0];

test('uncontracted coach has an explicit signing and cancellation step beside the pitch', () => {
  const pitch = find(source, node => ts.isJsxElement(node) && node.openingElement.attributes.getText(source).includes('id="my-club-xi-pitch"'))[0];
  assert.ok(pitch);
  const confirmation = find(pitch, node => ts.isJsxElement(node) && node.openingElement.attributes.getText(source).includes('data-coach-confirmation="true"'))[0];
  assert.ok(confirmation);
  const code = confirmation.getText(source);
  assert.match(code, /collection\.initialize\(selectedCoach.id\)/);
  assert.match(code, /!collection.canInitialize/);
  assert.match(code, /setSelectedCoachId\(null\)/);
  assert.match(code, /CLUB_COACH_VALUES/);
  assert.match(text, /collectionEnabled && selectedCoach && \(!collection.state \|\| collection.state.coach === null\)/);
});

test('ClubOwner has one shared search and club selector, not a separate coach market', () => {
  assert.ok(market);
  const selectors = find(market, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'CompactClubSelector');
  assert.equal(selectors.length, 1);
  const selector = selectors[0].getText(source);
  assert.match(selector, /mode=\{browsingCoaches \? "coach" : "player"\}/);
  assert.doesNotMatch(market.getText(source), /\{coachSelection\}|\? coachSelection/);
  assert.equal(find(market, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input').length, 1);
  assert.match(text, /const browsingCoaches = marketPage && !selectedCoach;/);
});

test('cancel selection only clears local draft and stays blocked during uncertain signing', () => {
  const confirmation = find(source, node => ts.isJsxElement(node)
    && node.openingElement.attributes.getText(source).includes('data-coach-confirmation="true"'))[0];
  assert.ok(confirmation);
  const cancel = find(confirmation, node => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(source) === 'button'
    && node.getText(source).includes('setSelectedCoachId(null)'));
  assert.equal(cancel.length, 1);
  const code = cancel[0].getText(source);
  assert.match(code, /disabled=\{collection.busy \|\| \(!collection.canInitialize && !collection.canHireCoach\)\}/);
  assert.match(code, /if \(!collection.canInitialize && !collection.canHireCoach\) return;/);
  assert.match(code, /setVisibleStep\("coach"\)/);
  assert.doesNotMatch(code, /fetch\(|collection\.(initialize|acquire|allocate|retry)|balanceEur|refund|delete/i);
});

test('coach results retain the original card and closed/read-failure guards', () => {
  const results = find(market, node => ts.isJsxElement(node)
    && node.openingElement.attributes.getText(source).includes('data-market-results="coach"'))[0];
  assert.ok(results);
  const code = results.getText(source);
  assert.match(code, /<FantasyCoachZoom entry=\{entry\}/);
  assert.match(code, /!editable \|\| saving \|\| \(collectionEnabled && !collection.canInitialize && !collection.canHireCoach\)/);
  assert.match(code, /setSelectedCoachId\(entry.id\)/);
  assert.match(code, /setQuery\(""\)/);
  assert.match(code, /scrollToLineupSection\("my-club-xi-pitch"\)/);
  assert.doesNotMatch(code, /fetch\(|collection\.initialize|save\(/, 'presentation change does not silently purchase');
});
