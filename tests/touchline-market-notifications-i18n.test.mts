import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const load = () => import("../lib/touchlineArena/market-notifications-i18n.ts");
const codes = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    savingSound: "Saving sound preference…",
    soundSaved: "Preference saved. Sound support depends on your browser and device settings.",
    soundUnconfirmed: "Change unconfirmed. Close and reopen to check; no automatic retry.",
    loading: "Loading preferences…", preferencesUnavailable: "Preferences unavailable. Close and try again.",
    awaiting: "Waiting for confirmation…",
    savedEnable: "Registration and preferences saved. No alert sent; delivery has not been verified.",
    savedPause: "All notifications paused.",
    partialEnable: "Registration may be saved, but activation is unconfirmed. Nothing was cancelled. Close and reopen to check before retrying.",
    partialPause: "Pausing all notifications was not confirmed. Close and reopen to check before retrying.",
    denied: "Permission not granted. Preferences preserved. Review permission in your browser settings.",
    unavailable: "Push is unavailable or unconfigured on this device. No preference changed.",
    failed: "The change could not be confirmed. Close and reopen to check its state.", busy: "Wait for the current operation.",
    title: "Game notifications",
    description: "Preferences: availability, official lineups, reminders for your team, goals and events, selected matches and leadership. Marketing is not part of this action.",
    deliveryPending: "Automatic delivery is still pending. Own goals, incomplete teams, crowns, Golden Boot and round summaries are not available yet. Opening this panel does not grant consent.",
    silent: "Receive silently", allowAll: "Allow all game notifications", turnOff: "Turn all off", categories: "Categories and quiet hours", close: "Close",
  },
  "pt-BR": {
    savingSound: "Salvando preferência de som…",
    soundSaved: "Preferência salva. O suporte a som depende do navegador e das configurações do dispositivo.",
    soundUnconfirmed: "Alteração não confirmada. Feche e reabra para conferir; nenhum reenvio automático.",
    loading: "Carregando preferências…", preferencesUnavailable: "Preferências indisponíveis. Feche e tente novamente.",
    awaiting: "Aguardando confirmação…",
    savedEnable: "Cadastro e preferências salvos. Nenhum alerta enviado; entrega ainda não verificada.",
    savedPause: "Todas as notificações pausadas.",
    partialEnable: "Cadastro pode estar salvo, mas ativação não confirmada. Nenhum cadastro foi cancelado. Feche e reabra para conferir antes de tentar novamente.",
    partialPause: "A pausa de todas as notificações não foi confirmada. Feche e reabra para conferir antes de tentar novamente.",
    denied: "Permissão não concedida. Preferências preservadas. Você pode revisar a permissão nas configurações do navegador.",
    unavailable: "Push não disponível ou não configurado neste dispositivo. Nenhuma preferência alterada.",
    failed: "Não foi possível confirmar a alteração. Feche e reabra para conferir o estado.", busy: "Aguarde a operação atual.",
    title: "Notificações do jogo",
    description: "Preferências: disponibilidade, escalações oficiais, lembretes do seu time, gols e eventos, partidas selecionadas e liderança. Marketing não faz parte desta ação.",
    deliveryPending: "Entrega automática ainda pendente. Gol contra, time incompleto, coroas, Chuteira de Ouro e resumo da rodada ainda não estão disponíveis. Abrir este painel não dá consentimento.",
    silent: "Receber sem som", allowAll: "Autorizar todas as notificações do jogo", turnOff: "Desligar todas", categories: "Categorias e horários", close: "Fechar",
  },
};
const initial = { settings: { silentPush: false }, channels: { push: false, email: false, in_app: true }, frequency: "realtime", quietHours: { enabled: false }, explicitConsentAt: null };
type Copy = Record<keyof typeof baseline["en-GB"], string>;
type Result = { state: "saved" | "partial" | "denied" | "unavailable" | "failed" | "busy"; preferences?: unknown };

// Execute the actual JSX and handlers. Only hook state, network and consent
// boundaries are controlled; no alternate implementation of message selection.
function consumer(locale: string, getCopy: (locale: string) => Copy) {
  const source = readFileSync(new URL("../components/touchline/notifications/TouchlineMarketNotifications.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("Notifications.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "TouchlineMarketNotifications");
  assert.ok(component && ts.isFunctionDeclaration(component) && component.body);
  const statements = component.body.statements;
  const binding = statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === "notificationCopy")).map(node => node.getText(ast)).join("\n");
  const handlers = statements.filter(ts.isFunctionDeclaration).map(node => node.getText(ast)).join("\n");
  const returned = statements.find(ts.isReturnStatement); assert.ok(returned?.expression);
  const messages: string[] = []; const requests: unknown[] = []; const actions: Array<[unknown, unknown]> = [];
  let request: (input?: unknown) => Promise<unknown> = async () => initial;
  let action: () => Promise<Result> = async () => ({ state: "saved" });
  let focused = 0;
  const state = {
    locale, draftLocalesEnabled: false, pt: locale === "pt-BR", open: false, busy: false, preferences: initial as unknown, message: "", id: "panel-id",
    generation: { current: 0 }, busyRef: { current: false }, mounted: { current: true },
    trigger: { current: { focus() { focused++; } } }, title: { current: { focus() { focused++; } } },
    React, Bell: () => React.createElement("svg", { "aria-hidden": true }), controls: { link: "canonical-control" },
    getTouchlineMarketNotificationsCopy: getCopy, requestAnimationFrame: (callback: () => void) => callback(),
    setOpen(value: boolean) { state.open = value; }, setBusy(value: boolean) { state.busy = value; },
    setPreferences(value: unknown) { state.preferences = value; },
    setMessage(value: string) { state.message = value; messages.push(value); },
    preferencesRequest: async (input?: unknown) => { requests.push(input); return request(input); },
    run: async (preferences: unknown, value: unknown) => { actions.push([preferences, value]); return action(); },
  };
  const api = runInNewContext(ts.transpileModule(`(() => { ${binding}\n${handlers}\nreturn { show, close, act, changeSound, render: () => (${returned.expression.getText(ast)}) }; })()`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, state);
  return { source, state, messages, requests, actions, api, html: () => renderToStaticMarkup(api.render()), focusCount: () => focused,
    request(next: typeof request) { request = next; }, result(next: typeof action) { action = next; } };
}

test("real panel and all real handler outcomes bind the catalogue, not inline EN/PT", async () => {
  const sentinels = Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `copy:${key}`])) as Copy;
  const seen: string[] = [];
  const ui = consumer("pt-BR", locale => { seen.push(locale); return sentinels; });
  assert.deepEqual(seen, ["pt-BR"]);
  assert.match(ui.source, /import \{ getTouchlineMarketNotificationsCopy \} from "@\/lib\/touchlineArena\/market-notifications-i18n"/);
  assert.ok(ui.html().includes(sentinels.title)); assert.doesNotMatch(ui.html(), /<h2/);
  await ui.api.show();
  for (const key of ["title", "description", "deliveryPending", "silent", "allowAll", "turnOff", "categories", "close"] as const) assert.ok(ui.html().includes(sentinels[key]), key);
  assert.equal(ui.messages[0], sentinels.loading);
  for (const action of ["enable", "pause"]) for (const status of ["saved", "partial", "denied", "unavailable", "failed", "busy"] as const) {
    ui.state.preferences = initial; ui.result(async () => ({ state: status }));
    await ui.api.act(action);
    assert.equal(ui.messages.at(-2), sentinels.awaiting);
    const key = status === "saved" ? (action === "pause" ? "savedPause" : "savedEnable") : status === "partial" ? (action === "pause" ? "partialPause" : "partialEnable") : status;
    assert.equal(ui.messages.at(-1), sentinels[key]);
  }
  ui.state.preferences = initial; ui.request(async () => ({ ...initial, settings: { silentPush: true } }));
  await ui.api.changeSound(true);
  assert.deepEqual(ui.messages.slice(-2), [sentinels.savingSound, sentinels.soundSaved]);
  ui.request(async () => { throw Error("timeout"); }); await ui.api.changeSound(false);
  assert.equal(ui.messages.at(-1), sentinels.soundUnconfirmed);
  ui.api.close(); await ui.api.show(); assert.equal(ui.messages.at(-1), sentinels.preferencesUnavailable);
});

test("all eight catalogues have the same 22 nonempty keys; exact EN/PT and six draft gates remain", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_MARKET_NOTIFICATIONS_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_MARKET_NOTIFICATIONS_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_MARKET_NOTIFICATIONS_DRAFT_STATUS, "draft");
  assert.equal(Object.keys(baseline["en-GB"]).length, 22);
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_MARKET_NOTIFICATIONS_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    for (const value of Object.values(copy)) { assert.equal(typeof value, "string"); assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\{[^}]+\}|https?:/); }
    assert.notEqual(copy.partialEnable, copy.savedEnable); assert.notEqual(copy.partialPause, copy.savedPause);
  }
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineMarketNotificationsCopy(locale), baseline[locale]);
  for (const locale of [...codes.slice(2), null, undefined, "", "xx", "constructor", "__proto__"]) assert.equal(mod.getTouchlineMarketNotificationsCopy(locale), mod.TOUCHLINE_MARKET_NOTIFICATIONS_CATALOGUES["en-GB"]);
  for (const locale of codes.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.notEqual(mod.TOUCHLINE_MARKET_NOTIFICATIONS_CATALOGUES[locale].title, baseline["en-GB"].title);
  }
});

test("actual EN/PT panel preserves disclosure, disabled states, ARIA and encoded destination", async () => {
  const { getTouchlineMarketNotificationsCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const ui = consumer(locale, getCopy); await ui.api.show();
    const html = ui.html();
    for (const key of ["title", "description", "deliveryPending", "silent", "allowAll", "turnOff", "categories", "close"] as const) assert.ok(html.includes(baseline[locale][key]), key);
    assert.equal((html.match(new RegExp(baseline[locale].title, "g")) ?? []).length, 2);
    assert.match(html, /aria-expanded="true" aria-controls="panel-id"/);
    assert.match(html, /aria-labelledby="panel-id-title"/); assert.match(html, /tabindex="-1" id="panel-id-title"/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.ok(html.includes(`href="/notifications?lang=${locale}"`));
    for (const [busy, preferences] of [[true, initial], [false, null]] as const) {
      ui.state.busy = busy; ui.state.preferences = preferences;
      assert.equal((ui.html().match(/disabled=""/g) ?? []).length, 3);
    }
    ui.api.close(); assert.match(ui.html(), /aria-expanded="false"/); assert.doesNotMatch(ui.html(), /<h2/);
  }
  const locale = 'en-GB&target="/unexpected'; const ui = consumer(locale, getCopy); await ui.api.show();
  assert.ok(ui.html().includes(`/notifications?lang=${encodeURIComponent(locale)}`));
});

test("real EN/PT handlers retain exact uncertain/pending delivery messages and request boundaries", async () => {
  const { getTouchlineMarketNotificationsCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const ui = consumer(locale, getCopy); const copy = baseline[locale];
    await ui.api.show(); assert.deepEqual(ui.requests, [undefined]); assert.deepEqual(ui.actions, []);
    for (const action of ["enable", "pause"]) for (const status of ["saved", "partial", "denied", "unavailable", "failed", "busy"] as const) {
      ui.state.preferences = initial; ui.result(async () => ({ state: status })); await ui.api.act(action);
      const key = status === "saved" ? (action === "pause" ? "savedPause" : "savedEnable") : status === "partial" ? (action === "pause" ? "partialPause" : "partialEnable") : status;
      assert.equal(ui.state.message, copy[key]);
      assert.equal(ui.state.preferences, status === "partial" || status === "failed" ? null : initial);
      assert.equal(ui.actions.at(-1)?.[1], action);
    }
    const actionCount = ui.actions.length;
    ui.state.preferences = initial; ui.request(async () => ({ ...initial, settings: { silentPush: true } })); await ui.api.changeSound(true);
    assert.equal(JSON.stringify(ui.requests.at(-1)), JSON.stringify({ action: "set_push_sound", silentPush: true }));
    assert.equal(ui.state.message, copy.soundSaved); assert.equal(ui.actions.length, actionCount);
    await ui.api.changeSound(false); assert.equal(ui.state.message, copy.soundUnconfirmed); assert.equal(ui.state.preferences, null);
    assert.equal(ui.actions.length, actionCount);
  }
});

test("real handlers discard late responses after close/unmount and preserve single-flight guards", async () => {
  const { getTouchlineMarketNotificationsCopy: getCopy } = await load();
  const ui = consumer("en-GB", getCopy);
  let release!: (value: unknown) => void;
  ui.request(() => new Promise(resolve => { release = resolve; }));
  const read = ui.api.show(); ui.api.close(); release(initial); await read;
  assert.equal(ui.state.preferences, null); assert.equal(ui.focusCount(), 2);
  ui.state.preferences = initial;
  let finish!: (result: Result) => void; ui.result(() => new Promise(resolve => { finish = resolve; }));
  const enable = ui.api.act("enable");
  await ui.api.act("enable"); await ui.api.changeSound(true); await ui.api.show();
  assert.equal(ui.actions.length, 1); assert.equal(ui.requests.length, 1);
  ui.state.mounted.current = false; finish({ state: "saved", preferences: { changed: true } }); await enable;
  assert.equal(ui.state.preferences, initial); assert.equal(ui.state.message, baseline["en-GB"].awaiting);
  const sound = consumer("pt-BR", getCopy); sound.request(() => new Promise(resolve => { release = resolve; }));
  const pending = sound.api.changeSound(true); sound.api.close(); release({ ...initial, settings: { silentPush: true } }); await pending;
  assert.equal(sound.state.preferences, initial); assert.equal(sound.state.message, baseline["pt-BR"].savingSound);
});

test("actual panel and outcome keep six draft locales behind the shared public gate", async () => {
  const { getTouchlineMarketNotificationsCopy: getCopy } = await load();
  for (const locale of codes.slice(2)) {
    const ui = consumer(locale, getCopy); await ui.api.show();
    assert.ok(ui.html().includes(baseline["en-GB"].title));
    assert.ok(ui.html().includes(baseline["en-GB"].deliveryPending));
    assert.ok(ui.html().includes(`/notifications?lang=${locale}`));
    ui.result(async () => ({ state: "partial" })); await ui.api.act("enable");
    assert.equal(ui.state.message, baseline["en-GB"].partialEnable);
  }
});
