import assert from "node:assert/strict";
import test from "node:test";
import { buildMatchEventNotification } from "../lib/touchlineArena/match-event-notification.ts";
import { buildLineupReminderNotification } from "../lib/touchlineFantasy/lineup-reminder-notification.ts";

// Reviewed compact-copy expectations, not computed from the production catalogue.
// Order: locale, goal, own goal, scored penalty, red, reminder title, missing XI, unconfirmed XI.
const copy = [
  ["en-GB","Goal","Own goal","Penalty scored","Red card","Your team is waiting","Build your lineup","Confirm your lineup"],
  ["pt-BR","Gol","Gol contra","Gol de pênalti","Cartão vermelho","Seu time está esperando","Monte sua escalação","Confirme sua escalação"],
  ["es-ES","Gol","Gol en propia puerta","Gol de penalti","Tarjeta roja","Tu equipo te espera","Prepara tu alineación","Confirma tu alineación"],
  ["it-IT","Gol","Autogol","Gol su rigore","Cartellino rosso","La tua squadra ti aspetta","Prepara la tua formazione","Conferma la tua formazione"],
  ["fr-FR","But","But contre son camp","But sur penalty","Carton rouge","Votre équipe vous attend","Préparez votre composition","Confirmez votre composition"],
  ["ar-SA","هدف","هدف عكسي","هدف من ركلة جزاء","بطاقة حمراء","فريقك ينتظرك","كوّن تشكيلتك","أكد تشكيلتك"],
  ["tr-TR","Gol","Kendi kalesine gol","Penaltı golü","Kırmızı kart","Takımınız sizi bekliyor","Kadronuzu kurun","Kadronuzu onaylayın"],
  ["de-DE","Tor","Eigentor","Elfmetertor","Rote Karte","Dein Team wartet auf dich","Stelle dein Team auf","Bestätige deine Aufstellung"],
] as const;
const verified = {ok:true,data:{
  sourceProvenance:"PERSISTED_VERIFIED_CONFIRMED_EVENT",fixtureId:"123",eventId:"456",
  home:{name:"Arsenal"},away:{name:"Chelsea"},score:{home:2,away:1},
  event:{kind:"goal",playerName:"Saka",minute:23,extraMinute:null},matchRating:8.2,touchlinePoints:8.2,
}} as const;
const identityId = "AB000000-0000-4000-8000-000000000001";

test("compact match copy uses exact eight languages, club title and factual spaced score without a rating", () => {
  for(const [locale,goal,ownGoal,penalty,red] of copy) {
    for(const [kind,label,icon] of [
      ["goal",goal,"goal"],["own-goal",ownGoal,"goal"],["penalty",penalty,"goal"],
      ["red-card",red,"red-card"],["second-yellow-red",red,"red-card"],
    ] as const) {
      const payload = buildMatchEventNotification({ok:true,data:{...verified.data,event:{...verified.data.event,kind}}} as never,locale as never);
      assert.deepEqual(payload,{
        title:"Arsenal - Chelsea",body:`${label} · 23′ · 2 - 1 · Saka`,
        tag:"fixture:123:event:456",href:`/live?fixture=123&lang=${locale}`,update:false,eventIcon:icon,
      },`${locale}/${kind}`);
      assert.doesNotMatch(payload!.body,/8\.2|rating|nota|points|pontos/i);
    }
  }
});

test("compact copy preserves added time, zero extra time, score order and revision identity", () => {
  for(const [minute,extraMinute,expected] of [[90,3,"90+3′"],[45,0,"45′"],[0,null,"0′"]] as const) {
    const payload=buildMatchEventNotification({ok:true,data:{...verified.data,
      score:{home:0,away:3},event:{...verified.data.event,kind:"second-yellow-red",minute,extraMinute},
    }} as never,"en-GB",true);
    assert.equal(payload?.title,"Arsenal - Chelsea");
    assert.equal(payload?.body,`Red card · ${expected} · 0 - 3 · Saka`);
    assert.equal(payload?.tag,"fixture:123:event:456");
    assert.equal(payload?.href,"/live?fixture=123&lang=en-GB");
    assert.equal(payload?.update,true);
  }
  const decimal=buildMatchEventNotification({ok:true,data:{...verified.data,matchRating:8.09,touchlinePoints:8.09}} as never,"en-GB");
  assert.equal(decimal?.body,"Goal · 23′ · 2 - 1 · Saka","valid precise rating is still accepted, not displayed");
});

test("compact presentation does not weaken provenance, rating equality, identity or football-fact validation", () => {
  assert.equal(buildMatchEventNotification({ok:false,reason:"pending"},"en-GB"),null);
  for(const change of [
    {sourceProvenance:"UNVERIFIED"},{matchRating:null},{matchRating:8.09,touchlinePoints:5},
    {touchlinePoints:NaN},{touchlinePoints:-3},{fixtureId:"0"},{eventId:""},
    {score:{home:-1,away:0}},{score:{home:1.5,away:0}},
    {event:{...verified.data.event,minute:-1}},{event:{...verified.data.event,extraMinute:-1}},
    {event:{...verified.data.event,playerName:" "}},{home:{name:" "}},
  ]) assert.equal(buildMatchEventNotification({ok:true,data:{...verified.data,...change}} as never,"en-GB"),null,JSON.stringify(change));
  // Catalogue vocabulary is not authority to emit previously unsupported events.
  for(const kind of ["var-review","penalty-missed","penalty-awarded","full-time","goal-disallowed"])
    assert.equal(buildMatchEventNotification({ok:true,data:{...verified.data,event:{...verified.data.event,kind}}} as never,"en-GB"),null,kind);
});

test("both compact reminder states use all eight approved titles and readiness-specific instructions", () => {
  for(const [locale,,,,,title,missing,unconfirmed] of copy) {
    for(const [kind,body] of [["missing_xi",missing],["complete_unconfirmed",unconfirmed]] as const) {
      const payload=buildLineupReminderNotification({identityId,kind,locale} as never);
      assert.deepEqual(payload,{title,body,tag:`lineup:${identityId.toLowerCase()}`,
        href:`/clubowner?lang=${locale}`,update:false},`${locale}/${kind}`);
    }
  }
});

test("both formatters reject unknown, non-exact and prototype locale values instead of guessing English", () => {
  for(const locale of [undefined,null,"","en","en-US","PT-BR"," pt-BR","ar-SA ","ja-JP","constructor","__proto__","toString",{},42]) {
    assert.equal(buildMatchEventNotification(verified,locale as never),null,String(locale));
    assert.equal(buildLineupReminderNotification({identityId,kind:"missing_xi",locale} as never),null,String(locale));
  }
  for(const input of [null,{}, {identityId:"bad",kind:"missing_xi",locale:"en-GB"},
    {identityId,kind:"goal",locale:"en-GB"}]) assert.equal(buildLineupReminderNotification(input as never),null);
});
