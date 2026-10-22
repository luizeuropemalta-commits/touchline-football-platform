import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getClubCollectionBudgetCopy, TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY } from '../lib/touchlineFantasy/market-budget-i18n.ts';
const keys = ['qaMarketOpen', 'qaRulesNotice', 'signingDestination', 'waitForSquadConfirmation', 'squadChangedChooseSlot'] as const;
test('QA and destination copy retains EN/PT and gated eight-language coverage', () => {
  const baselines = {
    'en-GB': ['Market open for testing', 'QA only. Budget and squad rules still apply.', 'Signing destination', 'Wait for confirmation. Refresh only reads the squad.', 'The squad changed. Choose the slot again.'],
    'pt-BR': ['Mercado aberto para testes', 'Somente QA. As regras de orçamento e elenco continuam valendo.', 'Destino da contratação', 'Aguarde a confirmação. Atualizar apenas consulta o elenco.', 'O elenco mudou. Escolha a vaga novamente.'],
  };
  for (const [locale, expected] of Object.entries(baselines)) assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy(locale)[key]), expected);
  const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
  assert.deepEqual(Object.keys(TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY), locales);
  for (const locale of locales) {
    const copy = getClubCollectionBudgetCopy(locale, true);
    for (const key of keys) { assert.ok(copy[key].trim()); assert.doesNotMatch(copy[key], /TODO|FIXME|\{[^}]*\}|https?:/); }
    assert.match(copy.qaRulesNotice, /QA/);
    if (!Object.hasOwn(baselines, locale)) assert.equal(getClubCollectionBudgetCopy(locale), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
  }
  assert.equal(getClubCollectionBudgetCopy('unknown', true), TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY['en-GB']);
});
test('QA and destination source wiring retains gates, intents, values and callbacks', () => {
  // Static presentation contract only; no actions executed.
  const source = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const collectionBudgetCopy = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);'));
  assert.ok(source.includes('{qaClubMarketOpen ? <aside className={styles.marketClock} role="status"><strong>{collectionBudgetCopy.qaMarketOpen}</strong><p>{collectionBudgetCopy.qaRulesNotice}</p></aside> : <MarketWindowClock'));
  const begin = source.indexOf('{collectionEnabled && collectionDestination ? <section');
  const end = source.indexOf('</section> : null}', begin);
  assert.ok(begin >= 0 && end > begin);
  const block = source.slice(begin, end);
  for (const key of ['signingDestination', 'waitForSquadConfirmation', 'squadChangedChooseSlot', 'refreshSquad']) assert.ok(block.includes(`collectionBudgetCopy.${key}`));
  assert.doesNotMatch(block, /locale\.startsWith/);
  assert.ok(block.includes('collectionAreaLabel(collectionDestination.area, locale, draftLocalesEnabled)} · {collectionDestination.slot + 1} · {collectionDestination.position'));
  assert.ok(block.includes('!collection.ready || collection.hasPending || collection.busy'));
  assert.ok(block.includes('!collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)'));
  assert.ok(block.includes('disabled={collection.busy} onClick={collection.reload}'));
  assert.ok(source.includes('label: collectionBudgetCopy.confirmSigning,'));
  assert.ok(source.includes('disabled={!canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)} onClick={confirmCollectionMarket}>{collectionBudgetCopy.confirmSigning}'));
});
