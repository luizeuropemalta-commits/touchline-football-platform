import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClubSeasonCheckoutRequest, type ClubSeasonCheckoutOrder } from '../lib/stripe/club-season-checkout-request.ts';
import { CLUB_SEASON_TEST_CATALOGUE } from '../lib/stripe/club-season-test-catalogue.ts';
const now = Date.parse('2026-10-28T12:00:00Z');
const order: ClubSeasonCheckoutOrder = {
  id:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',
  seasonId:'33333333-3333-4333-8333-333333333333',plan:'standard',
  seasonStartsAt:'2026-08-01T00:00:00Z',seasonEndsAt:'2027-06-01T00:00:00Z',
  createdAt:'2026-10-28T12:00:00Z',checkoutExpiresAt:'2026-10-28T13:00:00Z',
};
for (const plan of ['standard','master','vip'] as const) test(`server quote ${plan}: fixed price, identity and QA returns`,()=> {
  const { params:p } = buildClubSeasonCheckoutRequest({...order,plan},now);
  assert.deepEqual(p.line_items,[{price:CLUB_SEASON_TEST_CATALOGUE[plan].priceId,quantity:1}]);
  assert.equal(p.mode,'payment'); assert.deepEqual(p.payment_method_types,['card']);
  assert.equal(p.client_reference_id,order.userId);
  assert.deepEqual(p.metadata,{touchlineOrderId:order.id,touchlineSeasonId:order.seasonId,touchlinePlan:plan});
  assert.deepEqual(p.payment_intent_data?.metadata,p.metadata);
  assert.equal(p.automatic_tax?.enabled,false); assert.equal(p.adaptive_pricing?.enabled,false);
  assert.equal(p.allow_promotion_codes,false);
  for (const url of [p.success_url!,p.cancel_url!]) {
    assert.equal(new URL(url).origin,'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app');
    assert.equal(new URL(url).pathname,'/clubowner');
  }
});
test('retry uses identical parameters and idempotency key; no new expiry or operation',()=> {
  assert.deepEqual(buildClubSeasonCheckoutRequest(order,now),buildClubSeasonCheckoutRequest(order,now+60_000));
});
test('rejects expired/future season and malformed owner/order identity',()=> {
  for (const patch of [{seasonEndsAt:order.createdAt},{seasonStartsAt:order.checkoutExpiresAt},
    {userId:'browser-user'},{id:'not-an-order'},{plan:'beta'},{plan:'__proto__'}]) {
    assert.throws(()=>buildClubSeasonCheckoutRequest({...order,...patch} as ClubSeasonCheckoutOrder,now),/INVALID_SEASON_ORDER/);
  }
});
test('never creates checkout past season end or outside Stripe expiry constraints',()=> {
  for (const patch of [{seasonEndsAt:'2026-10-28T12:45:00Z'},
    {checkoutExpiresAt:'2026-10-28T12:29:59Z'}, {checkoutExpiresAt:'2026-10-29T12:00:01Z'},
    {createdAt:'2026-10-28T12:00:01Z'}, {createdAt:'invalid'},
    {checkoutExpiresAt:'invalid'}, {checkoutExpiresAt:'2026-10-28T13:00:00.500Z'}]) {
    assert.throws(()=>buildClubSeasonCheckoutRequest({...order,...patch},now),/INVALID_CHECKOUT_WINDOW/);
  }
});

test('recovers previously attempted checkout in final 30 minutes without changing parameters',()=> {
  const attempted={...order,firstAttemptAt:order.createdAt};
  assert.deepEqual(buildClubSeasonCheckoutRequest(attempted,now),buildClubSeasonCheckoutRequest(attempted,now+31*60_000));
  assert.throws(()=>buildClubSeasonCheckoutRequest(order,now+31*60_000),/INVALID_CHECKOUT_WINDOW/);
  assert.throws(()=>buildClubSeasonCheckoutRequest(attempted,now+60*60_000),/INVALID_CHECKOUT_WINDOW/);
  for(const firstAttemptAt of ['invalid','2026-10-28T11:59:59Z','2026-10-28T12:31:00Z'])
    assert.throws(()=>buildClubSeasonCheckoutRequest({...order,firstAttemptAt},now),/INVALID_CHECKOUT_WINDOW/);
});

test('same-season paid upgrade charges only the difference, never the full target price',()=> {
  for(const [from,to,amount] of [['standard','master',4000],['standard','vip',12000],['master','vip',8000]] as const) {
    const {params}=buildClubSeasonCheckoutRequest({...order,previousPaidPlan:from,plan:to},now);
    assert.deepEqual(params.line_items,[{price_data:{currency:'eur',product:CLUB_SEASON_TEST_CATALOGUE[to].productId,unit_amount:amount},quantity:1}]);
    assert.equal(params.metadata?.touchlinePreviousPaidPlan,from);
  }
});
test('same-plan repurchase and downgrade cannot become free or negative checkouts',()=> {
  for(const [from,to] of [['standard','standard'],['master','standard'],['vip','master']] as const)
    assert.throws(()=>buildClubSeasonCheckoutRequest({...order,previousPaidPlan:from,plan:to},now),/INVALID_SEASON_ORDER/);
});
