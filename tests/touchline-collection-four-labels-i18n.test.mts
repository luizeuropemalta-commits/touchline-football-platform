import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY, getClubCollectionBudgetCopy } from '../lib/touchlineFantasy/market-budget-i18n.ts';

const labels = ['refreshSquad', 'confirmPendingOperation', 'squadBalance', 'lowBalance'] as const;
const expected = {
  'en-GB': ['Refresh squad', 'Confirm pending operation', 'Squad balance', 'Low balance'],
  'pt-BR': ['Atualizar elenco', 'Confirmar operação pendente', 'Saldo do elenco', 'Saldo baixo'],
  'es-ES': ['Actualizar plantilla', 'Confirmar operación pendiente', 'Saldo de la plantilla', 'Saldo bajo'],
  'it-IT': ['Aggiorna rosa', 'Conferma operazione in sospeso', 'Saldo della rosa', 'Saldo basso'],
  'fr-FR': ["Actualiser l'effectif", "Confirmer l'opération en attente", "Solde de l'effectif", 'Solde faible'],
  'ar-SA': ['تحديث قائمة الفريق', 'تأكيد العملية المعلقة', 'رصيد قائمة الفريق', 'رصيد منخفض'],
  'tr-TR': ['Kadroyu yenile', 'Bekleyen işlemi onayla', 'Kadro bakiyesi', 'Düşük bakiye'],
  'de-DE': ['Kader aktualisieren', 'Ausstehenden Vorgang bestätigen', 'Kaderguthaben', 'Niedriges Guthaben'],
};

test('four collection labels cover eight locales while preserving exact EN/PT and public gate', () => {
  assert.deepEqual(Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY), Object.keys(expected));
  for (const [locale, values] of Object.entries(expected)) {
    const copy = getClubCollectionBudgetCopy(locale, true);
    assert.deepEqual(labels.map(key => copy[key]), values);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']).sort());
    for (const key of labels) {
      assert.ok(copy[key].trim());
      assert.doesNotMatch(copy[key], /TODO|FIXME|\{[^}]*\}|https?:/);
    }
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(getClubCollectionBudgetCopy(locale), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
      assert.equal(getClubCollectionBudgetCopy(locale, false), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
    }
  }
  for (const invalid of [undefined, null, '', 'unknown', '__proto__']) {
    assert.equal(getClubCollectionBudgetCopy(invalid, true), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
  }
});

test('four-label source wiring retains actions, conditions and currency formatting', () => {
  // Static contract, not rendered or authenticated QA.
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const collectionBudgetCopy = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);'));
  const begin = source.indexOf('{collectionEnabled && collection.error ?');
  const end = source.indexOf('{collectionEnabled && releasePlayerId', begin);
  assert.ok(begin >= 0 && end > begin);
  const block = source.slice(begin, end);
  for (const key of labels) assert.ok(block.includes(`{collectionBudgetCopy.${key}}`));
  assert.doesNotMatch(block, /locale\.startsWith/);
  assert.ok(block.includes('disabled={collection.busy} onClick={collection.reload}'));
  assert.ok(block.includes('collectionEnabled && collection.hasPending'));
  assert.ok(block.includes('disabled={collection.busy || !collection.ready}'));
  assert.ok(block.includes('onClick={collection.retryPending}'));
  assert.ok(block.includes('collectionEnabled && collection.state'));
  assert.ok(block.includes('{new Intl.NumberFormat(locale).format(collection.state.balanceEur)} TC'));
  assert.ok(block.includes('collection.state.balanceEur<=1_000_000'));
});
