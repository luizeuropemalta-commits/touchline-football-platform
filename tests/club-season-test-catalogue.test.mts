import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_SEASON_TEST_ACCOUNT, CLUB_SEASON_TEST_CATALOGUE, matchesClubSeasonPaidEvidence,
  isClubSeasonPaidPlan, type ClubSeasonTestOrder, type ClubSeasonPaymentEvidence } from '../lib/stripe/club-season-test-catalogue.ts';
const now = Date.parse('2026-10-28T12:00:00Z');
const order: ClubSeasonTestOrder = { id:'11111111-1111-4111-8111-111111111111',
  userId:'22222222-2222-4222-8222-222222222222', seasonId:'33333333-3333-4333-8333-333333333333',
  plan:'standard', sessionId:'cs_test_example',seasonStartsAt:'2026-08-01T00:00:00Z',seasonEndsAt:'2027-06-01T00:00:00Z' };
function evidence(o = order): ClubSeasonPaymentEvidence {
  const p = CLUB_SEASON_TEST_CATALOGUE[o.plan];
  return { accountId: CLUB_SEASON_TEST_ACCOUNT, id:o.sessionId,livemode:false,mode:'payment',status:'complete',
    payment_status:'paid',currency:'eur',amount_total:p.amountMinor,amount_subtotal:p.amountMinor,
    total_details:{amount_tax:0,amount_discount:0,amount_shipping:0},client_reference_id:o.userId,
    metadata:{touchlineOrderId:o.id,touchlineSeasonId:o.seasonId,touchlinePlan:o.plan},
    lines:{has_more:false,data:[{quantity:1,price:{id:p.priceId,product:p.productId,active:true,livemode:false,
      currency:'eur',unit_amount:p.amountMinor,recurring:null}}]} };
}
for (const plan of ['standard','master','vip'] as const) test(`accepts exact paid ${plan} seasonal test session`,()=> {
  const o={...order,plan}; assert.equal(matchesClubSeasonPaidEvidence(o,evidence(o),now),true);
});
for (const [name,patch] of Object.entries({ live:{livemode:true}, wrongAccount:{accountId:'acct_other'},
  monthly:{mode:'subscription'}, unpaid:{payment_status:'unpaid'}, free:{payment_status:'no_payment_required'},
  open:{status:'open'}, wrongAmount:{amount_total:1}, wrongCurrency:{currency:'gbp'},
  wrongUser:{client_reference_id:'someoneElse'}, wrongSession:{id:'cs_test_other'}, noMetadata:{metadata:null},
  partialLines:{lines:{has_more:true,data:[]}} })) test(`rejects ${name}`,()=> {
  assert.equal(matchesClubSeasonPaidEvidence(order,{...evidence(),...patch},now),false);
});
test('rejects exchanged product, repeated quantity, extra line and recurring price',()=> {
  for(const kind of ['product','quantity','extra','recurring','livePrice','priceId']) {
    const e=evidence(), line=e.lines.data[0];
    if(kind==='product') line.price!.product='prod_other';
    if(kind==='quantity') line.quantity=2;
    if(kind==='extra') e.lines.data.push(structuredClone(line));
    if(kind==='recurring') line.price!.recurring={interval:'month'};
    if(kind==='livePrice') line.price!.livemode=true;
    if(kind==='priceId') line.price!.id='price_other';
    assert.equal(matchesClubSeasonPaidEvidence(order,e,now),false,kind);
  }
});
test('rejects invalid identity, future season, ended season and non-finite clock',()=> {
  for(const patch of [{id:'------------------------------------'}, {seasonStartsAt:'2027-01-01'},
    {seasonEndsAt:'2026-10-28T12:00:00Z'}, {seasonEndsAt:'invalid'}]) {
    const o={...order,...patch}; assert.equal(matchesClubSeasonPaidEvidence(o,evidence(o),now),false);
  }
  assert.equal(matchesClubSeasonPaidEvidence(order,evidence(),NaN),false);
});
test('rejects free, legacy and prototype plan keys',()=> {
  for(const plan of ['beta','pro','constructor','__proto__','STANDARD',null]) assert.equal(isClubSeasonPaidPlan(plan),false);
});
test('does not mutate order or provider evidence on repeated validation',()=> {
  const e=evidence(), before=structuredClone({order,e});
  assert.equal(matchesClubSeasonPaidEvidence(order,e,now),true);
  assert.equal(matchesClubSeasonPaidEvidence(order,e,now),true);
  assert.deepEqual({order,e},before);
});

test('rejects inclusive tax and offsetting adjustments even when total is unchanged',()=> {
  for (const details of [null, {amount_tax:100,amount_discount:0,amount_shipping:0},
    {amount_tax:100,amount_discount:100,amount_shipping:0},
    {amount_tax:0,amount_discount:100,amount_shipping:100}]) {
    assert.equal(matchesClubSeasonPaidEvidence(order,{...evidence(),total_details:details},now),false);
  }
  assert.equal(matchesClubSeasonPaidEvidence(order,{...evidence(),amount_subtotal:5000},now),false);
});

import { resolveClubSeasonTestConfiguration } from '../lib/stripe/club-season-test-catalogue.ts';
const config = { TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'true', TOUCHLINE_STRIPE_MODE:'test',
  VERCEL_ENV:'preview', VERCEL_GIT_COMMIT_REF:'qa', SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',
  TOUCHLINE_STRIPE_TEST_SECRET_KEY:'sk_test_fixture', TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET:'whsec_fixture' };
test('configuration fails closed without explicit QA test activation',()=> {
  assert.equal(resolveClubSeasonTestConfiguration({}).ok,false);
  assert.equal(resolveClubSeasonTestConfiguration(config).ok,true);
  for(const patch of [{TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'false'}, {TOUCHLINE_STRIPE_MODE:'live'},
    {VERCEL_ENV:'production'}, {VERCEL_GIT_COMMIT_REF:'main'}, {SUPABASE_URL:undefined},
    {SUPABASE_URL:'https://other.supabase.co'}, {NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},
    {TOUCHLINE_STRIPE_TEST_SECRET_KEY:'sk_live_forbidden'}, {TOUCHLINE_STRIPE_TEST_SECRET_KEY:undefined},
    {TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET:undefined}]) {
    assert.equal(resolveClubSeasonTestConfiguration({...config,...patch}).ok,false);
  }
});

test('upgrade evidence requires exact price difference and confirmed previous plan',()=> {
  for(const [from,to,amount] of [['standard','master',4000],['standard','vip',12000],['master','vip',8000]] as const) {
    const o={...order,previousPaidPlan:from,plan:to};
    const e=evidence(o); e.amount_total=amount;e.amount_subtotal=amount;
    e.metadata!.touchlinePreviousPaidPlan=from;
    e.lines.data[0].price!.unit_amount=amount;e.lines.data[0].price!.id='price_inlineTest';
    assert.equal(matchesClubSeasonPaidEvidence(o,e,now),true);
    assert.equal(matchesClubSeasonPaidEvidence(o,{...e,amount_total:CLUB_SEASON_TEST_CATALOGUE[to].amountMinor},now),false);
    delete e.metadata!.touchlinePreviousPaidPlan;
    assert.equal(matchesClubSeasonPaidEvidence(o,e,now),false);
  }
});
