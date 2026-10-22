import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteClubReturn, type ClubPlan } from '../lib/touchlineFantasy/club-market-rules.ts';

// Quote proof only: this does not exercise a wallet, contract deletion or refund RPC.
test('ordinary returns retain the approved plan fee from paid credits', () => {
  for (const [plan, rate] of [['beta', 10], ['standard', 10], ['master', 10], ['vip', 10]] as const) {
    assert.deepEqual(quoteClubReturn(10_000_000, plan, 'ordinary'), {
      rate, fee: rate * 100_000, refund: 10_000_000 - rate * 100_000,
    });
    for (const reason of ['injury', 'suspension', 'same-league-transfer'] as const) {
      assert.deepEqual(quoteClubReturn(10_000_000, plan, reason), quoteClubReturn(10_000_000, plan, 'ordinary'));
    }
  }
});

test('league-exit exemption requires confirmation and still validates the plan', () => {
  assert.throws(() => quoteClubReturn(10_000_000, 'vip', 'left-league'), /CLUB_TRANSFER_CONFIRMATION_REQUIRED/);
  assert.deepEqual(quoteClubReturn(10_000_000, 'vip', 'left-league', true), {
    rate: 0, fee: 0, refund: 10_000_000,
  });
  assert.throws(() => quoteClubReturn(10, 'unknown' as ClubPlan, 'left-league', true), /CLUB_PLAN_INVALID/);
});

test('integer half-up fees conserve the paid amount at small and safe-integer boundaries', () => {
  for (const plan of ['standard', 'master', 'vip'] as const) {
    for (const paid of [0, 1, 9, 10, 16, 17, 49, 50, 51, 99, 100, 101, 1_200_000_000, Number.MAX_SAFE_INTEGER]) {
      const result = quoteClubReturn(paid, plan, 'ordinary');
      const expectedFee = Number((BigInt(paid) * BigInt(result.rate) + 50n) / 100n);
      assert.equal(result.fee, expectedFee);
      assert.equal(BigInt(result.fee) + BigInt(result.refund), BigInt(paid));
      assert.ok(Number.isSafeInteger(result.refund) && result.refund >= 0);
    }
  }
  assert.equal(quoteClubReturn(10, 'master', 'ordinary').fee, 1);
});

test('invalid paid amounts cannot produce a refund quotation', () => {
  for (const paid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => quoteClubReturn(paid, 'vip', 'ordinary'), /CLUB_CREDITS_INVALID/);
  }
  assert.throws(() => quoteClubReturn(10, 'vip', 'invalid' as 'ordinary'), /CLUB_RETURN_REASON_INVALID/);
});
