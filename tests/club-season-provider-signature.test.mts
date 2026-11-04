import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('server adapter verifies real SDK signatures, rejects tampering/live events and closes outside QA',()=> {
  const moduleUrl=new URL('../lib/stripe/club-season-provider.server.ts',import.meta.url).href;
  const script=`
    import assert from 'node:assert/strict';
    import Stripe from 'stripe';
    const {verifyClubSeasonTestWebhook}=await import(${JSON.stringify(moduleUrl)});
    Object.assign(process.env,{
      TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'true',TOUCHLINE_STRIPE_MODE:'test',
      VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'qa',
      SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',
      TOUCHLINE_STRIPE_TEST_SECRET_KEY:'sk_test_fake_unit_test_only',
      TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET:'whsec_fake_unit_test_only'
    });
    const stripe=new Stripe(process.env.TOUCHLINE_STRIPE_TEST_SECRET_KEY);
    const body=JSON.stringify({id:'evt_unit',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_unit'}}});
    const sign=payload=>stripe.webhooks.generateTestHeaderString({payload,secret:process.env.TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET});
    assert.equal((await verifyClubSeasonTestWebhook(body,sign(body))).id,'evt_unit');
    await assert.rejects(verifyClubSeasonTestWebhook(body+' ',sign(body)));
    await assert.rejects(verifyClubSeasonTestWebhook(body,''));
    const live=body.replace('"livemode":false','"livemode":true');
    await assert.rejects(verifyClubSeasonTestWebhook(live,sign(live)),/LIVE_EVENT_REJECTED/);
    process.env.VERCEL_ENV='production';
    await assert.rejects(verifyClubSeasonTestWebhook(body,sign(body)),/SEASON_CHECKOUT_UNAVAILABLE/);
    process.env.VERCEL_ENV='preview';process.env.TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED='false';
    await assert.rejects(verifyClubSeasonTestWebhook(body,sign(body)),/SEASON_CHECKOUT_UNAVAILABLE/);
  `;
  const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-strip-types','--input-type=module','-e',script],{
    cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30_000,
    env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'},
  });
  assert.equal(result.status,0,result.stderr || String(result.error || 'child failed'));
});

test('future Live configuration is closed by default, Preview stays TEST, and real SDK signatures remain mode-bound', () => {
  const providerUrl = new URL('../lib/stripe/club-season-provider.server.ts', import.meta.url).href;
  const configurationUrl = new URL('../lib/stripe/club-season-configuration.server.ts', import.meta.url).href;
  const clientUrl = new URL('../lib/stripe/client.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import Stripe from 'stripe';
    const {resolveClubSeasonPaymentConfiguration: resolve} = await import(${JSON.stringify(configurationUrl)});
    const {configuredStripeMode} = await import(${JSON.stringify(clientUrl)});
    const {verifyClubSeasonWebhook} = await import(${JSON.stringify(providerUrl)});
    const live = {
      TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'true', TOUCHLINE_CLUB_SEASON_LIVE_ENABLED:'true',
      TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED:'true', TOUCHLINE_STRIPE_MODE:'live', VERCEL_ENV:'production',
      TOUCHLINE_STRIPE_LIVE_SUPABASE_URL:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co',
      SUPABASE_URL:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co', NEXT_PUBLIC_SUPABASE_URL:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co',
      TOUCHLINE_STRIPE_LIVE_ACCOUNT_ID:'acct_fixtureLive', TOUCHLINE_STRIPE_LIVE_SECRET_KEY:'sk_live_fake_unit_only',
      TOUCHLINE_STRIPE_LIVE_CLUB_SEASON_WEBHOOK_SECRET:'whsec_live_fake_unit_only', STRIPE_SECRET_KEY:'sk_live_fake_generic_only',
      TOUCHLINE_STRIPE_LIVE_PROFILE_ID:'fixture-live-v1', TOUCHLINE_STRIPE_LIVE_CATALOGUE_VERSION:'fixture-20261103',
      TOUCHLINE_STRIPE_LIVE_RETURN_ORIGIN:'https://checkout-return.example.test',
      TOUCHLINE_STRIPE_LIVE_STANDARD_PRODUCT_ID:'prod_fixtureStandard', TOUCHLINE_STRIPE_LIVE_STANDARD_PRICE_ID:'price_fixtureStandard',
      TOUCHLINE_STRIPE_LIVE_MASTER_PRODUCT_ID:'prod_fixtureMaster', TOUCHLINE_STRIPE_LIVE_MASTER_PRICE_ID:'price_fixtureMaster',
      TOUCHLINE_STRIPE_LIVE_VIP_PRODUCT_ID:'prod_fixtureVip', TOUCHLINE_STRIPE_LIVE_VIP_PRICE_ID:'price_fixtureVip'
    };
    assert.equal(resolve('create',{}).ok,false);
    assert.equal(resolve('create',live).ok,true);
    assert.equal(configuredStripeMode(live),'live');
    for(const patch of [{VERCEL_ENV:'preview'}, {VERCEL_ENV:'development'}, {TOUCHLINE_CLUB_SEASON_LIVE_ENABLED:undefined},
      {TOUCHLINE_STRIPE_MODE:'test'}, {TOUCHLINE_STRIPE_LIVE_ACCOUNT_ID:'acct_1Tl6XQH0T0OdBC6s'},
      {SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co'},
      {TOUCHLINE_STRIPE_LIVE_SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',NEXT_PUBLIC_SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co'}]) {
      assert.equal(resolve('create',{...live,...patch}).ok,false);
      assert.equal(configuredStripeMode({...live,...patch}),null);
    }
    for(const patch of [{TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED:undefined}, {TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:undefined}, {TOUCHLINE_STRIPE_LIVE_SECRET_KEY:'sk_test_fake'},
      {TOUCHLINE_STRIPE_LIVE_PROFILE_ID:undefined}, {TOUCHLINE_STRIPE_LIVE_CATALOGUE_VERSION:undefined},
      {TOUCHLINE_STRIPE_LIVE_RETURN_ORIGIN:'https://checkout-return.example.test/other'},
      {TOUCHLINE_STRIPE_LIVE_STANDARD_PRICE_ID:'price_1UVc3eH0T0OdBC6sejXIyxSA'},
      {TOUCHLINE_STRIPE_LIVE_MASTER_PRODUCT_ID:'prod_fixtureStandard'}]) assert.equal(resolve('create',{...live,...patch}).ok,false);
    const oldOrderOnly={...live,TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'false',TOUCHLINE_STRIPE_LIVE_PROFILE_ID:undefined,
      TOUCHLINE_STRIPE_LIVE_CATALOGUE_VERSION:undefined,TOUCHLINE_STRIPE_LIVE_STANDARD_PRICE_ID:undefined};
    assert.equal(resolve('create',oldOrderOnly).ok,false);
    assert.equal(resolve('reconcile',oldOrderOnly).ok,true);
    assert.equal(resolve('status',oldOrderOnly).ok,true);
    assert.equal(resolve('reconcile',{...live,TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED:undefined}).ok,false);
    assert.equal(configuredStripeMode({...live,TOUCHLINE_CLUB_SEASON_LIVE_RECONCILIATION_ENABLED:undefined}),null);
    const sandbox={TOUCHLINE_CLUB_SEASON_CHECKOUT_ENABLED:'true',TOUCHLINE_STRIPE_MODE:'test',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'qa',
      SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',NEXT_PUBLIC_SUPABASE_URL:'https://xgxbwqxjssxxuihuwmgy.supabase.co',
      TOUCHLINE_STRIPE_TEST_SECRET_KEY:'sk_test_fake_unit_only',TOUCHLINE_STRIPE_TEST_CLUB_SEASON_WEBHOOK_SECRET:'whsec_fake_unit_only'};
    assert.equal(resolve('reconcile',sandbox).ok,true,'absent new gates must preserve the already-operational TEST webhook');
    assert.equal(configuredStripeMode({STRIPE_SECRET_KEY:'sk_test_fake_legacy'}),'test');
    assert.equal(configuredStripeMode({...live,STRIPE_SECRET_KEY:'sk_test_fake_legacy'}),null);
    Object.assign(process.env,live);
    const stripe=new Stripe(live.TOUCHLINE_STRIPE_LIVE_SECRET_KEY);
    const payload=JSON.stringify({id:'evt_livefixture',type:'checkout.session.completed',livemode:true,data:{object:{id:'cs_live_fixture'}}});
    const sign=body=>stripe.webhooks.generateTestHeaderString({payload:body,secret:live.TOUCHLINE_STRIPE_LIVE_CLUB_SEASON_WEBHOOK_SECRET});
    assert.equal((await verifyClubSeasonWebhook(payload,sign(payload))).id,'evt_livefixture');
    await assert.rejects(verifyClubSeasonWebhook(payload+' ',sign(payload)));
    const testPayload=payload.replace('"livemode":true','"livemode":false');
    await assert.rejects(verifyClubSeasonWebhook(testPayload,sign(testPayload)),/PAYMENT_MODE_MISMATCH/);
    const connected=JSON.stringify({...JSON.parse(payload),account:'acct_other'});
    await assert.rejects(verifyClubSeasonWebhook(connected,sign(connected)),/CONNECTED_ACCOUNT_NOT_SUPPORTED/);
    process.env.VERCEL_ENV='preview';
    await assert.rejects(verifyClubSeasonWebhook(payload,sign(payload)),/SEASON_CHECKOUT_UNAVAILABLE/);
  `;
  const result = spawnSync(process.execPath, ['--conditions=react-server','--experimental-strip-types','--input-type=module','-e',script], {
    cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30_000,env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'},
  });
  assert.equal(result.status,0,result.stderr || String(result.error || 'child failed'));
});
