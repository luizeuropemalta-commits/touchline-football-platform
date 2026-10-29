import test from "node:test";
import assert from "node:assert/strict";
import { checkoutDisplayAmount, requestClubSeasonCheckout } from "../lib/stripe/club-season-checkout-client.ts";

test("checkout request asserts the displayed quote and accepts only a test Stripe redirect", async()=> {
  const signal=new AbortController().signal;
  const fetcher: typeof fetch=async(input,options)=>{
    assert.equal(input,"/api/touchline-fantasy/season-checkout");
    assert.equal(options?.method,"POST");assert.equal(options?.credentials,"same-origin");
    assert.equal(options?.body,'{"plan":"master","expectedAmountMinor":4000}');assert.equal(options?.signal,signal);
    return Response.json({ok:true,sessionId:"cs_test_one",url:"https://checkout.stripe.com/c/pay/cs_test_one"});
  };
  assert.equal(await requestClubSeasonCheckout("master",4000,signal,fetcher),"https://checkout.stripe.com/c/pay/cs_test_one");
});
test("unavailable, malformed and untrusted redirects never navigate",async()=> {
  for(const response of [new Response(null,{status:503}),new Response("bad json"),
    ...[null,{ok:false},
      {ok:true,sessionId:"cs_live_one",url:"https://checkout.stripe.com/a"},
      {ok:true,sessionId:"cs_test_one",url:"javascript:alert(1)"},
      {ok:true,sessionId:"cs_test_one",url:"https://checkout.stripe.com.evil.test/a"},
      {ok:true,sessionId:"cs_test_one",url:"https://user:pass@checkout.stripe.com/a"},
    ].map(value=>Response.json(value))]) {
    await assert.rejects(requestClubSeasonCheckout("standard",4990,new AbortController().signal,async()=>response));
  }
});
test("invalid quote is rejected before a checkout request",async()=> {
  for (const amount of [0,-1,NaN,Infinity,1.1]) {
    let calls=0;
    await assert.rejects(requestClubSeasonCheckout("master",amount,new AbortController().signal,async()=>{calls++;return new Response();}));
    assert.equal(calls,0);
  }
});
test("unknown or invalid quote never enables a guessed upgrade amount",()=> {
  assert.equal(checkoutDisplayAmount(undefined,"master"),null);
  assert.equal(checkoutDisplayAmount({master:{amountMinor:4000}},"master"),4000);
  for(const amountMinor of [0,-1,NaN,Infinity,1.1])
    assert.equal(checkoutDisplayAmount({master:{amountMinor}},"master"),null);
  assert.equal(checkoutDisplayAmount({master:{amountMinor:4000}},"beta"),null);
});
