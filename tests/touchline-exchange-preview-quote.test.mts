import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeQuote } from '../components/touchline/market-preview/preview-model.ts';
import { getExchangeHubCopy } from '../lib/touchlineFantasy/exchange-hub-i18n.ts';

test('preview renders the canonical higher-value fee without charging the accepter a second fee', () => {
  const outgoing = exchangeQuote(100_000_000, 80_000_000, 100_000_000, 'standard', 'vip')!;
  assert.equal(outgoing.feeBase, 100_000_000);
  assert.equal(outgoing.fee, 5_000_000);
  assert.equal(outgoing.otherFee, 0);
  assert.equal(outgoing.otherBonus, 2_500_000);
  assert.equal(outgoing.final, 75_000_000);
  const incoming = exchangeQuote(100_000_000, 80_000_000, 100_000_000, 'standard', 'vip', 'incoming')!;
  assert.equal(incoming.feeBase, 100_000_000);
  assert.equal(incoming.fee, 0);
  assert.equal(incoming.otherFee, 2_000_000);
  assert.equal(incoming.bonus, 1_000_000);
  assert.equal(incoming.final, 81_000_000);
});

test('Beta approved preview uses seven percent without bypassing runtime availability', () => {
  assert.equal(exchangeQuote(100_000_000, 80_000_000, 100_000_000, 'beta', 'vip')!.fee, 7_000_000);
  assert.equal(getExchangeHubCopy('pt-BR').planUnavailable, 'As negociações ainda não estão habilitadas para este plano.');
  assert.equal(getExchangeHubCopy('en-GB').planUnavailable, 'Negotiations are not enabled for this plan yet.');
});
