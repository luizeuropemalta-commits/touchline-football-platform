import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY, getClubCollectionBudgetCopy } from '../lib/touchlineFantasy/market-budget-i18n.ts';
const keys = ['confirmCoach', 'coachPendingConfirmation', 'confirmingSigning', 'confirmSigning', 'cancelCoachSelection'] as const;

test('coach confirmation copy preserves EN/PT exactly and provides eight gated key sets', () => {
  const baseline = {
    'en-GB': ['Confirm coach', 'Coach selected, not yet signed. Confirm to deduct the cost and unlock formation selection.', 'Confirming…', 'Confirm signing', 'Cancel selection'],
    'pt-BR': ['Confirmar treinador', 'Treinador selecionado, ainda não contratado. Confirme para descontar o valor e liberar a formação.', 'Confirmando…', 'Confirmar contratação', 'Cancelar seleção'],
  };
  for (const [locale, values] of Object.entries(baseline)) assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy(locale)[key]), values);
  const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
  assert.deepEqual(Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY), locales);
  for (const locale of locales) {
    const copy = getClubCollectionBudgetCopy(locale, true);
    for (const key of keys) {
      assert.ok(copy[key].trim());
      assert.doesNotMatch(copy[key], /TODO|FIXME|\{[^}]*\}|https?:/);
    }
    if (!Object.hasOwn(baseline, locale)) {
      assert.equal(getClubCollectionBudgetCopy(locale, false), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
      assert.notEqual(copy.confirmCoach, baseline['en-GB'][0]);
      assert.notEqual(copy.coachPendingConfirmation, baseline['en-GB'][1]);
    }
  }
  assert.equal(getClubCollectionBudgetCopy('unknown', true), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
});

test('coach confirmation text wiring preserves all conditions, cost and callbacks', () => {
  // Source-only contract: does not invoke a signing or constitute rendered QA.
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  const begin = source.indexOf('{collectionEnabled && selectedCoach && !collection.state ?');
  const end = source.indexOf('</section> : null}', begin);
  assert.ok(begin >= 0 && end > begin);
  const block = source.slice(begin, end);
  for (const key of keys) assert.ok(block.includes(`collectionBudgetCopy.${key}`));
  assert.doesNotMatch(block, /locale\.startsWith/);
  assert.ok(source.includes('const collectionBudgetCopy = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);'));
  assert.ok(block.includes('disabled={!editable || !collection.canInitialize}'));
  assert.ok(block.includes('onClick={() => collection.initialize(selectedCoach.id)}'));
  assert.ok(block.includes('collection.busy ? collectionBudgetCopy.confirmingSigning : collectionBudgetCopy.confirmSigning'));
  assert.ok(block.includes('disabled={collection.busy || !collection.canInitialize}'));
  assert.ok(block.includes('if (!collection.canInitialize) return; setSelectedCoachId(null); setQuery(""); setVisibleStep("coach");'));
  assert.ok(block.includes('selectedCoach.coach.displayName'));
  assert.ok(block.includes('Object.hasOwn(CLUB_COACH_VALUES, selectedCoach.slot.cardTier)'));
  assert.ok(block.includes('`${new Intl.NumberFormat(locale).format(CLUB_COACH_VALUES[selectedCoach.slot.cardTier as keyof typeof CLUB_COACH_VALUES])} TC` : "—"'));
});
