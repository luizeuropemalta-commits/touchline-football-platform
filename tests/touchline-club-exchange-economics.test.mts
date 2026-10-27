import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteClubExchange, quoteClubReturn, type ClubPlan } from '../lib/touchlineFantasy/club-market-rules.ts';

const plans = [['beta', 7], ['standard', 5], ['master', 4], ['vip', 2]] as const;

test('all four plans charge only the proposer on the higher canonical card value in either direction', () => {
  for (const [plan, rate] of plans) {
    const up = quoteClubExchange(80_000_000, 100_000_000, plan);
    const down = quoteClubExchange(100_000_000, 80_000_000, plan);
    const fee = rate * 1_000_000;
    assert.equal(up.feeBase, 100_000_000);
    assert.equal(down.feeBase, up.feeBase);
    assert.equal(up.rate, rate);
    assert.equal(up.fee, fee);
    assert.equal(down.fee, fee);
    assert.equal(up.proposerDelta, -20_000_000 - fee);
    assert.equal(up.accepterDelta, 20_000_000 + fee / 2);
    assert.equal(down.proposerDelta, 20_000_000 - fee);
    assert.equal(down.accepterDelta, -20_000_000 + fee / 2);
    assert.equal(up.bonus, fee / 2);
    assert.equal(up.retired, fee / 2);
  }
});

test('wallet movements conserve credits and never capitalize the bonus into either received contract', () => {
  const values = [1_000_000, 20_000_000, 80_000_000, 100_000_000, 250_000_000, 1_000_000_000];
  for (const [plan] of plans) for (const outgoing of values) for (const incoming of values) {
    const q = quoteClubExchange(outgoing, incoming, plan);
    assert.equal(BigInt(q.proposerDelta) + BigInt(q.accepterDelta) + BigInt(q.retired), 0n);
    assert.equal(q.proposerContractValue, incoming);
    assert.equal(q.accepterContractValue, outgoing);
    const proposerRelease = quoteClubReturn(q.proposerContractValue, plan, 'ordinary');
    const accepterRelease = quoteClubReturn(q.accepterContractValue, 'standard', 'ordinary');
    assert.equal(proposerRelease.refund, incoming * 0.9);
    assert.equal(accepterRelease.refund, outgoing * 0.9);
    // After exchanging and releasing BOTH cards, the combined return is lower
    // than releasing them directly by exactly the retired half of the fee.
    const direct = BigInt(quoteClubReturn(outgoing, plan, 'ordinary').refund)
      + BigInt(quoteClubReturn(incoming, 'standard', 'ordinary').refund);
    const afterExchange = BigInt(q.proposerDelta) + BigInt(q.accepterDelta)
      + BigInt(proposerRelease.refund) + BigInt(accepterRelease.refund);
    assert.equal(afterExchange, direct - BigInt(q.retired));
  }
});

test('round-trip swaps restore card ownership while burning fees, even across different proposer plans', () => {
  for (const [firstPlan] of plans) for (const [secondPlan] of plans) {
    const first = quoteClubExchange(80_000_000, 100_000_000, firstPlan);
    const back = quoteClubExchange(100_000_000, 80_000_000, secondPlan);
    const ownerA = BigInt(first.proposerDelta) + BigInt(back.proposerDelta);
    const ownerB = BigInt(first.accepterDelta) + BigInt(back.accepterDelta);
    assert.equal(ownerA + ownerB, -BigInt(first.retired) - BigInt(back.retired));
    assert.equal(back.proposerContractValue, 80_000_000);
    assert.equal(back.accepterContractValue, 100_000_000);
  }
});

test('equal-value swaps still charge the correct fee, with no artificial compensation', () => {
  for (const [plan, rate] of plans) {
    const q = quoteClubExchange(100_000_000, 100_000_000, plan);
    assert.equal(q.compensation, 0);
    assert.equal(q.proposerDelta, -rate * 1_000_000);
    assert.equal(q.accepterDelta, rate * 500_000);
  }
});

test('unknown/invalid card values and unsupported fractional splits fail closed', () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => quoteClubExchange(invalid, 100, 'standard'), /CLUB_CREDITS_INVALID/);
    assert.throws(() => quoteClubExchange(100, invalid, 'standard'), /CLUB_CREDITS_INVALID/);
  }
  assert.throws(() => quoteClubExchange(0, 100, 'standard'), /CLUB_EXCHANGE_CARD_VALUE_REQUIRED/);
  assert.throws(() => quoteClubExchange(100, 0, 'standard'), /CLUB_EXCHANGE_CARD_VALUE_REQUIRED/);
  assert.throws(() => quoteClubExchange(100, 100, 'unknown' as ClubPlan), /CLUB_PLAN_INVALID/);
  // 5 TC cannot be divided exactly into two integer balances; no silent rule change.
  assert.throws(() => quoteClubExchange(80, 100, 'standard'), /CLUB_EXCHANGE_HALF_CREDIT_UNSUPPORTED/);
});

test('safe-integer boundaries use exact integer arithmetic, never floating point fees', () => {
  const largest = Number.MAX_SAFE_INTEGER - 991; // divisible by 1000, exact splits for every plan
  for (const [plan, rate] of plans) {
    const q = quoteClubExchange(largest, largest, plan);
    assert.equal(q.fee, Number((BigInt(largest) * BigInt(rate) + 50n) / 100n));
    assert.equal(BigInt(q.proposerDelta) + BigInt(q.accepterDelta) + BigInt(q.retired), 0n);
  }
  assert.throws(() => quoteClubExchange(1, largest, 'beta'), /CLUB_CREDITS_OVERFLOW/);
});
