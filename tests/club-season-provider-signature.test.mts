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
