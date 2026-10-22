import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as eligibility from "../lib/touchlineFantasy/exchange-eligibility.ts";
import * as hubCopy from "../lib/touchlineFantasy/exchange-hub-i18n.ts";
import { CLUB_ROSTER_CAPACITY, type ClubRosterEntry } from "../lib/touchlineFantasy/club-roster.ts";

const source = readFileSync(new URL("../components/touchline/market/ClubOwnerExchangeHub.tsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(ready = true, locale = "en-GB", roster: readonly ClubRosterEntry[] | null = [{playerId:"one",area:"outside",slot:0}], plan = "vip", draftLocalesEnabled = false) {
  let panel: unknown = null;
  const exports: { default?: (props: Record<string, unknown>) => React.ReactNode } = {};
  const modules: Record<string, unknown> = {
    react: { ...React, useState: () => [panel, (value: unknown) => { panel = value; }], useRef: () => ({ current: null }) },
    "react/jsx-runtime": jsx,
    "@/lib/touchlineFantasy/exchange-eligibility": eligibility,
    "@/lib/touchlineFantasy/exchange-hub-i18n": hubCopy,
    "react-dom": { createPortal: (node: React.ReactNode) => node },
    "@/components/touchline/a11y/TouchlineDialog": { useTouchlineDialog: ({ label }: { label: string }) => ({ dialogProps: { role: "dialog", "aria-label": label } }), useTouchlineDialogScrollLock: () => {} },
  };
  runInNewContext(js, { exports, document: { body: {} }, require: (name: string) => {
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in modules, name); return modules[name];
  } });
  const state = roster === null ? null : { plan, balanceEur: 100, coach: { valueEur: 10 }, players: roster.map(p=>({...p,valueEur:40})), receipts: [{ key: "receipt-one", playerId: "one", valueEur: 40, revision: 1 }] };
  const before = JSON.stringify(state);
  const props = { locale, draftLocalesEnabled, plan, ownerName: "Confirmed Owner", ready, state, catalogue: [{ id: "one", name: "Confirmed Athlete" }] };
  const tree = () => exports.default!(props) as React.ReactElement<{ children: React.ReactNode }>;
  const buttons: React.ReactElement<{ onClick: (event: unknown) => void }>[] = [];
  function visit(node: React.ReactNode) {
    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
    if (node.type === "button") buttons.push(node as typeof buttons[number]);
    React.Children.forEach(node.props.children, visit);
  }
  visit(tree());
  return { buttons, html: () => renderToStaticMarkup(tree()), open(index: number) { buttons[index].props.onClick({ currentTarget: {} }); const html = renderToStaticMarkup(tree()); assert.equal(JSON.stringify(state), before); return html; } };
}
test("representative notice reports unavailable interests without a fake zero or active proposal", () => {
  for (const [locale, heading, status] of [
    ["pt-BR", "Central de negociações", "Não é possível verificar novas negociações."],
    ["en-GB", "Negotiation centre", "New negotiations cannot be verified."],
  ]) {
    const h = fixture(true, locale), html = h.html();
    assert.match(html, /role="status"/);
    assert.ok(html.includes(heading));
    assert.ok(html.includes(status));
    assert.doesNotMatch(html, /role="dialog"|0 propostas|0 proposals|Nenhuma proposta|No proposals|handshake/);
    assert.equal(h.buttons.length, 3);
    assert.equal((h.open(0).match(/role="dialog"/g) ?? []).length, 1);
  }
});
const completeRoster = (["starters","reserves","outside"] as const).flatMap(area=>Array.from({length:CLUB_ROSTER_CAPACITY[area]},(_,slot)=>({playerId:`${area}-${slot}`,area,slot})));
test("Exchange Hub catalogue has eight gated key sets and unchanged count tokens", () => {
  const locales = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
  assert.deepEqual(Object.keys(hubCopy.EXCHANGE_HUB_ROWS), locales);
  const english = hubCopy.getExchangeHubCopy('en-GB');
  for (const locale of locales) {
    const copy = hubCopy.getExchangeHubCopy(locale, true);
    assert.equal(hubCopy.EXCHANGE_HUB_ROWS[locale as keyof typeof hubCopy.EXCHANGE_HUB_ROWS].length, hubCopy.EXCHANGE_HUB_KEYS.length);
    assert.deepEqual(Object.keys(copy), [...hubCopy.EXCHANGE_HUB_KEYS]);
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|https?:/);
      assert.deepEqual((value.match(/\{\w+\}/g) ?? []).sort(), (english[key as keyof typeof english].match(/\{\w+\}/g) ?? []).sort());
    }
    assert.match(copy.incomplete, /TouchLine/);
    if (!['en-GB', 'pt-BR'].includes(locale)) assert.equal(hubCopy.getExchangeHubCopy(locale), english);
    const formatted = hubCopy.formatExchangeReadinessCopy(copy.incomplete, 34, 35);
    assert.match(formatted, /34\/35/); assert.doesNotMatch(formatted, /\{\w+\}/);
  }
  assert.equal(hubCopy.getExchangeHubCopy('unknown', true), english);
  assert.equal(hubCopy.formatExchangeReadinessCopy(english.complete, 35, 35), 'Squad complete: 35 contracts. The proposal service remains unavailable; negotiations are not enabled.');
  assert.equal(hubCopy.formatExchangeReadinessCopy(hubCopy.getExchangeHubCopy('pt-BR').complete, 35, 35), 'Elenco completo: 35 contratos. O serviço de propostas continua indisponível; isso não habilita negociações.');
});
test("opted-in Hub and dialogs show draft copy while remaining read-only and unavailable", () => {
  const escaped = (value: string) => renderToStaticMarkup(React.createElement('span', null, value)).slice(6, -7);
  for (const locale of ['es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE']) {
    const copy = hubCopy.getExchangeHubCopy(locale, true);
    const h = fixture(true, locale, completeRoster, 'vip', true);
    assert.equal(h.buttons.length, 3);
    assert.ok(h.html().includes(escaped(copy.centre)));
    assert.ok(h.html().includes(escaped(copy.unavailable)));
    assert.ok(h.html().includes(escaped(hubCopy.formatExchangeReadinessCopy(copy.complete, 35, 35))));
    assert.ok(h.open(0).includes(escaped(copy.disconnected)));
    assert.ok(h.open(1).includes(escaped(copy.historyUnavailable)));
    assert.ok(h.open(2).includes(escaped(copy.statementUnavailable)));
    assert.match(fixture(true, locale).html(), /Negotiation centre/);
    const pending = fixture(false, locale, completeRoster, 'vip', true);
    assert.ok(pending.html().includes(escaped(copy.unconfirmed)));
    assert.ok(pending.open(2).includes(escaped(copy.waiting)));
  }
  const client = readFileSync(new URL('../app/fantasy/FantasyGameweekClient.tsx', import.meta.url), 'utf8');
  assert.ok(client.includes('<ClubOwnerExchangeHub locale={locale} draftLocalesEnabled={draftLocalesEnabled}'));
  assert.ok(client.includes('ready={collection.ready && !collection.busy && !collection.hasPending}'));
  assert.doesNotMatch(source, /fetch\(|localStorage|onConfirm|method:.*POST/);
});
test("negotiation readiness lifecycle35 to34 to35 never enables proposal service or mutates contracts",()=>{
  const full={plan:"vip",players:completeRoster},before=structuredClone(full);
  const afterRelease={...full,players:full.players.slice(0,-1)};
  const recomposed={...afterRelease,players:[...afterRelease.players,{...full.players.at(-1)!,playerId:"replacement"}]};
  for(const [state,status,count]of [[full,"complete",35],[afterRelease,"incomplete",34],[recomposed,"complete",35]] as const){
    const result=eligibility.projectExchangeReadiness(state,true);
    assert.equal(result.status,status);assert.equal(result.ownedCount,count);assert.equal(result.proposalsAvailable,false);
  }
  assert.deepEqual(full,before);
});
test("readiness rejects unconfirmed invalid duplicate overcapacity and unsupported-plan snapshots",()=>{
  const full={plan:"vip",players:completeRoster};
  for(const state of [null,full])assert.equal(eligibility.projectExchangeReadiness(state,false).status,"unconfirmed");
  assert.equal(eligibility.projectExchangeReadiness(null,true).status,"unconfirmed");
  for(const players of [[...completeRoster,completeRoster[0]],completeRoster.map((p,i)=>i===1?{...p,playerId:completeRoster[0].playerId}:p),completeRoster.map((p,i)=>i===1?{...p,slot:0}:p)]){
    assert.equal(eligibility.projectExchangeReadiness({...full,players},true).status,"invalid");
  }
  for(const plan of ["beta","unknown"])assert.equal(eligibility.projectExchangeReadiness({...full,plan},true).status,"plan-unavailable");
});
test("hub and negotiation panel explain incomplete roster but preserve read-only history and finances",()=>{
  const incomplete=completeRoster.slice(0,-1);
  for(const locale of ["en-GB","pt-BR"]){
    const h=fixture(true,locale,incomplete);
    for(const html of [h.html(),h.open(0)]){
      assert.match(html,/data-exchange-readiness="incomplete"/);assert.match(html,/34\/35/);
      assert.ok(html.includes(locale==="en-GB"?"original TouchLine Market":"mercado original TouchLine"));
    }
    assert.equal(h.buttons.length,3);assert.match(h.open(1),/Confirmed Athlete/);assert.match(h.open(2),/100 TC/);
  }
  const full=fixture(true,"en-GB",completeRoster).html();
  assert.match(full,/data-exchange-readiness="complete"/);assert.match(full,/proposal service remains unavailable; negotiations are not enabled/);
  for(const html of [fixture(false,"en-GB",completeRoster).html(),fixture(true,"en-GB",null).html()]){
    assert.match(html,/data-exchange-readiness="unconfirmed"/);assert.doesNotMatch(html,/Squad complete|35 contracts/);
  }
});
test("three canonical buttons open one themed read-only zoom each", () => {
  const h = fixture(); assert.equal(h.buttons.length, 3);
  for (const [index, label] of ["Negotiations", "Transfer history", "Club finances"].entries()) {
    const html = h.open(index);
    assert.equal((html.match(/role="dialog"/g) ?? []).length, 1);
    assert.ok(html.includes(`aria-label="${label}"`)); assert.match(html, /data-exchange-plan="vip"/);
    assert.match(html, /Confirmed Owner/);
  }
});
test("financial view distinguishes real cash, contracted players and coach", () => {
  const html = fixture().open(2);
  assert.match(html, /Available balance<\/dt><dd>100 TC/);
  assert.match(html, /Contracted squad value<\/dt><dd>40 TC/);
  assert.match(html, /Coach signing value<\/dt><dd>10 TC/);
  assert.doesNotMatch(html, /50 TC/);
});
test("history uses actual receipts and does not invent exchange records", () => {
  const html = fixture().open(1);
  assert.match(html, /Confirmed Athlete/); assert.match(html, /40 TC/);
  assert.match(html, /Exchange and release history is not available/);
  assert.doesNotMatch(html, /receipt-one/);
});
test("unconfirmed reads show unavailable instead of stale financial amounts", () => {
  for (const index of [1,2]) { const html = fixture(false).open(index); assert.match(html, /Waiting for confirmed club data/); assert.doesNotMatch(html, /100 TC|40 TC/); }
  assert.match(fixture().open(0), /Pending negotiations cannot currently be confirmed/);
  assert.doesNotMatch(source, /fetch\(|localStorage|onConfirm|method:.*POST/);
});
test("candidate binds the optional trusted owner before using it in dialogs", () => {
  const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const signature = client.slice(client.indexOf("export default function FantasyGameweekClient({"), client.indexOf("initialSnapshot: TouchlineFantasySnapshot"));
  assert.match(signature, /\bclubOwner\s*,/);
  assert.match(client, /<ClubOwnerNegotiationRoom[^>]+plan=\{collection\.state\?\.plan\} agentNotice=\{<ClubOwnerExchangeHub /);
  assert.equal((client.match(/<ClubOwnerExchangeHub /g) ?? []).length, 1, "the real notice and dialogs are not duplicated below the roster");
});
