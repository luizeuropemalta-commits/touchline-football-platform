import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { officeCopy } from '../components/touchline/office/club-office-model.ts';
const drafts = ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
test('office drafts have complete key sets and require explicit request-local opt-in', () => {
  const english = officeCopy('en-GB');
  const portuguese = officeCopy('pt-BR');
  assert.equal(english.title, 'Club office');
  assert.equal(portuguese.title, 'Escritório do clube');
  for (const locale of ['en-GB', 'pt-BR']) assert.deepEqual(officeCopy(locale, true), officeCopy(locale));
  for (const locale of drafts) {
    const copy = officeCopy(locale, true);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort());
    assert.notEqual(copy.title, english.title);
    assert.match(copy.subtitle, /ClubOwner/);
    assert.match(copy.balanceHintDetail, /TouchLine/);
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\{[^}]*\}|https?:/); }
    assert.deepEqual(officeCopy(locale), english);
    assert.deepEqual(officeCopy(locale, false), english);
  }
  assert.deepEqual(officeCopy('unknown', true), english);
  assert.deepEqual(officeCopy('PT-br'), portuguese, 'legacy PT normalization is preserved');
});
test('office opt-in is propagated only as presentation data to copy and wrapper aria label', () => {
  // Source-only contract, not browser/interaction proof.
  const component = readFileSync(new URL('../components/touchline/office/ClubOwnerOffice.tsx', import.meta.url), 'utf8');
  const parent = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  assert.match(component, /draftLocalesEnabled\?: boolean/);
  assert.match(component, /draftLocalesEnabled = false/);
  assert.ok(component.includes('const copy = officeCopy(locale, draftLocalesEnabled);'));
  assert.ok(parent.includes('<ClubOwnerOffice locale={locale} draftLocalesEnabled={draftLocalesEnabled}'));
  assert.ok(parent.includes('aria-label={officeCopy(locale, draftLocalesEnabled).title}'));
  assert.ok(parent.includes('collectionStructureVisible && marketPage && !arenaOpen'));
});
