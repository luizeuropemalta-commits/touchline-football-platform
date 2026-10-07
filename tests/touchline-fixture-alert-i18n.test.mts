import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_PLAYER_SOCIAL_CATALOGUES } from "../lib/touchlineArena/player-social-i18n.ts";
import { getTouchlineFixtureAlertCopy } from "../lib/touchlineArena/fixture-alert-i18n.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineFixtureAlerts.tsx", import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const keys = ["alerts", "loading", "saving", "signedOut", "disabled", "error", "saved", "notSaved", "deliveryUnavailable", "removeMatch", "saveMatch", "signIn", "checkAgain"] as const;
const english = ["Alerts", "Checking preference…", "Saving preference…", "Sign in to Arena to follow this match.", "Match alerts have not been enabled yet.", "Alerts unavailable. Your preference could not be confirmed.", "Match added to your preferences.", "This match is not in your preferences yet.", "Mobile delivery is not available yet. Saving this match does not enable notifications.", "Remove match", "Save match", "Sign in", "Check again"];
const portuguese = ["Alertas", "Consultando preferência…", "Salvando preferência…", "Entre na Arena para acompanhar esta partida.", "Os alertas desta partida ainda não foram ativados.", "Alertas indisponíveis. Não foi possível confirmar sua preferência.", "Partida adicionada às suas preferências.", "Esta partida ainda não está nas suas preferências.", "O envio para o celular ainda não está disponível. Salvar a partida não ativa notificações.", "Remover partida", "Salvar partida", "Entrar", "Consultar novamente"];
type Copy = Record<typeof keys[number], string>;
type Node = React.ReactElement<Record<string, unknown>>;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const acknowledgement = (subscribed: boolean) => ({ ok: true, data: { subscribed }, delivery: "unavailable" });
const catalogue = () => import("../lib/touchlineArena/fixture-alert-i18n.ts");

// Independent text expectations, not computed from the production catalogue.
// Draft wording is checked for correspondence, not linguistic/RTL approval.
const draftText: Record<typeof locales[number], readonly string[]> = {
  "en-GB": english,
  "pt-BR": portuguese,
  "es-ES": ["Alertas", "Consultando preferencia…", "Guardando preferencia…", "Inicia sesión en Arena para seguir este partido.", "Las alertas de este partido aún no se han activado.", "Alertas no disponibles. No se pudo confirmar tu preferencia.", "Partido añadido a tus preferencias.", "Este partido aún no está en tus preferencias.", "El envío al móvil aún no está disponible. Guardar este partido no activa las notificaciones.", "Quitar partido", "Guardar partido", "Iniciar sesión", "Consultar de nuevo"],
  "it-IT": ["Avvisi", "Verifica della preferenza…", "Salvataggio della preferenza…", "Accedi ad Arena per seguire questa partita.", "Gli avvisi per questa partita non sono ancora stati attivati.", "Avvisi non disponibili. Non è stato possibile confermare la tua preferenza.", "Partita aggiunta alle tue preferenze.", "Questa partita non è ancora nelle tue preferenze.", "L’invio al cellulare non è ancora disponibile. Salvare questa partita non attiva le notifiche.", "Rimuovi partita", "Salva partita", "Accedi", "Verifica di nuovo"],
  "fr-FR": ["Alertes", "Vérification de la préférence…", "Enregistrement de la préférence…", "Connectez-vous à Arena pour suivre ce match.", "Les alertes pour ce match n’ont pas encore été activées.", "Alertes indisponibles. Votre préférence n’a pas pu être confirmée.", "Match ajouté à vos préférences.", "Ce match ne figure pas encore dans vos préférences.", "L’envoi sur mobile n’est pas encore disponible. Enregistrer ce match n’active pas les notifications.", "Retirer le match", "Enregistrer le match", "Se connecter", "Vérifier à nouveau"],
  "ar-SA": ["التنبيهات", "جارٍ التحقق من التفضيل…", "جارٍ حفظ التفضيل…", "سجّل الدخول إلى Arena لمتابعة هذه المباراة.", "لم يتم تفعيل تنبيهات هذه المباراة بعد.", "التنبيهات غير متاحة. تعذّر تأكيد تفضيلك.", "تمت إضافة المباراة إلى تفضيلاتك.", "هذه المباراة ليست ضمن تفضيلاتك بعد.", "الإرسال إلى الهاتف غير متاح بعد. حفظ هذه المباراة لا يفعّل الإشعارات.", "إزالة المباراة", "حفظ المباراة", "تسجيل الدخول", "التحقق مجددًا"],
  "tr-TR": ["Uyarılar", "Tercih kontrol ediliyor…", "Tercih kaydediliyor…", "Bu maçı takip etmek için Arena’ya giriş yapın.", "Bu maçın uyarıları henüz etkinleştirilmedi.", "Uyarılar kullanılamıyor. Tercihiniz doğrulanamadı.", "Maç tercihlerinize eklendi.", "Bu maç henüz tercihlerinizde değil.", "Telefona gönderim henüz kullanılamıyor. Bu maçı kaydetmek bildirimleri etkinleştirmez.", "Maçı kaldır", "Maçı kaydet", "Giriş yap", "Yeniden kontrol et"],
  "de-DE": ["Benachrichtigungen", "Einstellung wird geprüft…", "Einstellung wird gespeichert…", "Melde dich bei Arena an, um dieses Spiel zu verfolgen.", "Benachrichtigungen für dieses Spiel wurden noch nicht aktiviert.", "Benachrichtigungen nicht verfügbar. Deine Einstellung konnte nicht bestätigt werden.", "Spiel zu deinen Einstellungen hinzugefügt.", "Dieses Spiel ist noch nicht in deinen Einstellungen enthalten.", "Die Zustellung ans Handy ist noch nicht verfügbar. Das Speichern dieses Spiels aktiviert keine Benachrichtigungen.", "Spiel entfernen", "Spiel speichern", "Anmelden", "Erneut prüfen"],
};

function optedInDraftGetter() {
  // Exercise the actual presentation opt-in without replacing the normalizer.
  return (locale: string) => getTouchlineFixtureAlertCopy(locale, true);
}

function assertAllDraftPhases(locale: string, getCopy: (locale: string) => Copy, expected: Copy) {
  const label = 'A <B> & "$&"', instance = harness(getCopy, locale, label);
  try {
    for (const [phase, subscribed, key, action] of [
      ["loading", null, "loading", null], ["saving", false, "saving", "saveMatch"], ["saving", true, "saving", "removeMatch"],
      ["signed-out", null, "signedOut", "signIn"], ["disabled", null, "disabled", null],
      ["error", null, "error", "checkAgain"], ["ready", true, "saved", "removeMatch"], ["ready", false, "notSaved", "saveMatch"],
    ] as const) {
      instance.state[0] = true; instance.state[2] = subscribed; instance.state[3] = phase;
      const tree = instance.render(), html = renderToStaticMarkup(tree), paragraphs = nodes(tree, "p"), buttons = nodes(tree, "button");
      assert.equal(paragraphs[0].props.children, expected[key], `${locale}/${phase}/${subscribed}/${key}`);
      assert.equal(paragraphs[0].props.role, "status");
      assert.equal(paragraphs[1].props.children, expected.deliveryUnavailable, `${locale}/deliveryUnavailable`);
      assert.equal(buttons[0].props["aria-label"], `${expected.alerts}: ${label}`, `${locale}/alerts`);
      assert.equal(nodes(tree, "section")[0].props["aria-label"], `${expected.alerts}: ${label}`);
      assert.match(html, /A &lt;B&gt; &amp; &quot;\$&amp;&quot;/);
      const escaped = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
      for (const text of [expected[key], expected.deliveryUnavailable]) assert.ok(html.includes(escaped(text)), `${locale}/${phase}: rendered text`);
      if (phase === "signed-out") {
        assert.equal(nodes(tree, "a")[0].props.children, expected.signIn, `${locale}/signIn`);
        assert.equal(nodes(tree, "a")[0].props.href, `/login?lang=${encodeURIComponent(locale)}`);
        assert.equal(buttons.length, 1);
      } else if (action) {
        assert.equal(buttons.length, 2);
        assert.equal(buttons[1].props.children, expected[action], `${locale}/${action}`);
        if (phase === "ready" || phase === "saving") assert.equal(buttons[1].props.disabled, phase === "saving");
      } else assert.equal(buttons.length, 1);
      if (phase === "error") {
        assert.equal(instance.state[2], null, "unknown preference is not false");
        assert.equal(buttons[1].props.children, expected.checkAgain, "unknown offers a read, not save/remove");
      }
    }
    assert.equal(instance.requests.length, 0, "SSR does not commit effects or make requests");
    assert.equal(instance.timers.size, 0);
  } finally { instance.dispose(); }
}

test("opted-in drafts render actual eight-language text in every real JSX phase without opening public gates", async () => {
  const getDraft = optedInDraftGetter(), { getTouchlineFixtureAlertCopy: getPublic } = await catalogue();
  for (const locale of locales) {
    assert.equal(draftText[locale].length, keys.length);
    const expected = Object.fromEntries(keys.map((key, index) => [key, draftText[locale][index]])) as Copy;
    assertAllDraftPhases(locale, getDraft, expected);
    // The same production getter without opt-in must remain EN/PT-only.
    assert.deepEqual(keys.map(key => getPublic(locale)[key]), locale === "pt-BR" ? portuguese : english);
  }
});

test("opted-in drafts phase oracle detects locale fallback and every empty or misbound text key", () => {
  for (const locale of locales) {
    const expected = Object.fromEntries(keys.map(key => [key, `sentinel:${locale}:${key}`])) as Copy;
    assertAllDraftPhases(locale, requested => { assert.equal(requested, locale); return expected; }, expected);
  }
  const expected = Object.fromEntries(keys.map((key, index) => [key, draftText["ar-SA"][index]])) as Copy;
  const getDraft = optedInDraftGetter();
  assert.throws(() => assertAllDraftPhases("ar-SA", () => getDraft("en-GB"), expected), assert.AssertionError);
  for (const key of keys) for (const replacement of ["", `wrong-key:${key}`]) {
    assert.throws(() => assertAllDraftPhases("ar-SA", () => ({ ...getDraft("ar-SA"), [key]: replacement }), expected), assert.AssertionError, key);
  }
});

function nodes(tree: unknown, type: string): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  if (!React.isValidElement(tree)) return [];
  const node = tree as Node;
  return [...(node.type === type ? [node] : []), ...nodes(node.props.children, type)];
}

function harness(getCopy: (locale: string) => Copy, locale = "en-GB", label = 'A <B> & "$&"') {
  const state: unknown[] = [false, 0, null, "loading"];
  const refs = [{ current: null }, { current: false }, { current: 0 }];
  const requests: { url: string; options: RequestInit; reply: (body: unknown, status?: number) => void; fail: () => void }[] = [];
  const timers = new Map<number, { action: () => void; delay: number }>();
  let cursor = 0, refCursor = 0, timerId = 0;
  let pendingEffect: (() => (() => void) | undefined) | undefined;
  let cleanup: (() => void) | undefined;
  let effectDeps: unknown[] | undefined;
  const compiledModule: { default?: (props: object) => React.ReactElement } = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: compiledModule, AbortController,
    setTimeout: (action: () => void, delay: number) => { const id = ++timerId; timers.set(id, { action, delay }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: RequestInit) => new Promise((resolve, reject) => requests.push({ url, options,
      reply: (body, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => body }),
      fail: () => reject(new Error("response lost")),
    })),
    require: (name: string) => {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react") return {
        useId: () => "fixture-alert",
        useState: () => { const index = cursor++; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
        useRef: () => refs[refCursor++],
        useEffect: (action: () => (() => void) | undefined, deps: unknown[]) => {
          if (!effectDeps || deps.some((value, index) => value !== effectDeps![index])) { pendingEffect = action; effectDeps = deps; }
        },
      };
      if (name === "lucide-react") return { Bell: (props: object) => React.createElement("svg", { ...props, "data-icon": "Bell" }) };
      if (name.endsWith(".css")) return { default: { profileActions: "profileActions", trigger: "trigger", panel: "panel" } };
      if (name.endsWith("fixture-alert-i18n")) return { getTouchlineFixtureAlertCopy: getCopy };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = (fixtureId = "12/3") => { cursor = 0; refCursor = 0; return compiledModule.default!({ fixtureId, label, locale }); };
  const commit = () => { if (pendingEffect) { cleanup?.(); const action = pendingEffect; pendingEffect = undefined; cleanup = action(); } };
  const click = (node: Node) => (node.props.onClick as () => void)();
  const open = () => { click(nodes(render(), "button")[0]); const tree = render(); commit(); return tree; };
  return { state, requests, timers, render, commit, click, open, dispose: () => cleanup?.(), expire: () => { for (const timer of timers.values()) timer.action(); } };
}

test("real consumer forwards the full locale to the getter and renders its sentinel copy", () => {
  const seen: string[] = [];
  const copy = Object.fromEntries(keys.map(key => [key, `sentinel-${key}`])) as Copy;
  const instance = harness(locale => { seen.push(locale); return copy; }, "ar-SA");
  instance.open();
  const html = renderToStaticMarkup(instance.render());
  assert.deepEqual(seen, ["ar-SA", "ar-SA", "ar-SA"]);
  assert.match(html, /sentinel-loading/);
  assert.match(html, /sentinel-deliveryUnavailable/);
  assert.match(html, /aria-label="sentinel-alerts: A &lt;B&gt; &amp; &quot;\$&amp;&quot;"/);
  assert.equal(instance.requests.length, 1);
});

test("eight complete catalogues preserve EN/PT, reuse checkAgain, and keep six drafts gated", async () => {
  const { TOUCHLINE_FIXTURE_ALERT_CATALOGUES: all, TOUCHLINE_FIXTURE_ALERT_DRAFT_LOCALES: drafts, TOUCHLINE_FIXTURE_ALERT_DRAFT_STATUS: status, getTouchlineFixtureAlertCopy: getCopy } = await catalogue();
  assert.deepEqual(Object.keys(all), locales);
  assert.deepEqual(drafts, locales.slice(2)); assert.equal(status, "draft");
  assert.deepEqual(keys.map(key => all["en-GB"][key]), english);
  assert.deepEqual(keys.map(key => all["pt-BR"][key]), portuguese);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(all[locale]).sort(), [...keys].sort());
    assert.ok(Object.values(all[locale]).every(value => typeof value === "string" && value.trim()));
    assert.equal(all[locale].checkAgain, TOUCHLINE_PLAYER_SOCIAL_CATALOGUES[locale].checkAgain);
    assert.match(all[locale].signedOut, /Arena/);
    assert.equal(getCopy(locale), all[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
  }
  for (const locale of [null, undefined, "constructor", "pt", "invalid"]) assert.equal(getCopy(locale), all["en-GB"]);
});

test("real JSX renders every state, neutral bell, exact labels, classes, escaped ARIA and login link", async () => {
  const { getTouchlineFixtureAlertCopy: getCopy } = await catalogue();
  for (const locale of locales) {
    const copy = getCopy(locale), instance = harness(getCopy, locale);
    for (const [phase, subscribed, key] of [["loading", null, "loading"], ["saving", false, "saving"], ["signed-out", null, "signedOut"], ["disabled", null, "disabled"], ["error", null, "error"], ["ready", true, "saved"], ["ready", false, "notSaved"]] as const) {
      instance.state[0] = true; instance.state[2] = subscribed; instance.state[3] = phase;
      const tree = instance.render(), html = renderToStaticMarkup(tree);
      assert.equal(nodes(tree, "p")[0].props.children, copy[key]);
      assert.equal(nodes(tree, "p")[1].props.children, copy.deliveryUnavailable);
      assert.match(html, /data-icon="Bell"/); assert.doesNotMatch(html, /BellRing/);
      assert.match(html, /class="profileActions trigger"/); assert.match(html, /class="panel"/);
      assert.equal(nodes(tree, "button")[0].props["aria-label"], `${copy.alerts}: A <B> & "$&"`);
      assert.match(html, /A &lt;B&gt; &amp; &quot;\$&amp;&quot;/);
      if (phase === "saving" || phase === "ready") {
        assert.equal(nodes(tree, "button")[1].props.children, subscribed ? copy.removeMatch : copy.saveMatch);
        assert.equal(nodes(tree, "button")[1].props.disabled, phase === "saving");
      } else assert.equal(nodes(tree, "button").length, phase === "error" ? 2 : 1);
      if (phase === "error") assert.equal(nodes(tree, "button")[1].props.children, copy.checkAgain);
      if (phase === "signed-out") { assert.equal(nodes(tree, "a")[0].props.href, `/login?lang=${encodeURIComponent(locale)}`); assert.equal(nodes(tree, "a")[0].props.children, copy.signIn); }
    }
    assert.equal(instance.requests.length, 0, "rendering alone must not request or write");
  }
});

test("real handlers perform GET before PUT, preserve payload, single saving and require fresh GET after uncertainty", async () => {
  const { getTouchlineFixtureAlertCopy: getCopy } = await catalogue();
  const instance = harness(getCopy, "pt-BR");
  instance.render(); instance.commit(); assert.equal(instance.requests.length, 0);
  instance.open(); assert.equal(instance.requests.length, 1);
  assert.equal(instance.requests[0].url, "/api/notifications/fixtures/12%2F3");
  assert.equal(instance.requests[0].options.cache, "no-store");
  instance.requests[0].reply(acknowledgement(false)); await flush();
  const save = nodes(instance.render(), "button")[1]; instance.click(save); instance.click(save);
  assert.equal(instance.requests.length, 2); assert.equal(instance.state[3], "saving");
  assert.equal(nodes(instance.render(), "button")[1].props.disabled, true);
  assert.equal(instance.requests[1].options.body, '{"active":true}');
  assert.deepEqual(JSON.parse(JSON.stringify(instance.requests[1].options.headers)), { "Content-Type": "application/json" });
  instance.requests[1].fail(); await flush();
  assert.equal(instance.state[2], null); assert.equal(instance.state[3], "error");
  const retry = nodes(instance.render(), "button")[1]; assert.equal(retry.props.children, getCopy("pt-BR").checkAgain);
  instance.click(retry); instance.render(); instance.commit();
  assert.equal(instance.requests.length, 3); assert.equal(instance.state[3], "loading");
  instance.requests[2].reply(acknowledgement(true)); await flush();
  instance.click(nodes(instance.render(), "button")[1]); assert.equal(instance.requests[3].options.body, '{"active":false}');
  instance.requests[3].reply(acknowledgement(false)); await flush();
  assert.equal(instance.state[3], "ready"); assert.equal(instance.state[2], false);
  assert.deepEqual(instance.requests.map(request => request.options.method ?? "GET"), ["GET", "PUT", "GET", "PUT"]);
  for (const request of instance.requests) { assert.equal(request.options.credentials, "same-origin"); assert.ok(request.options.signal instanceof AbortSignal); }
  assert.equal(instance.timers.size, 0);
});

test("GET and PUT reject unconfirmed outcomes, retain null, and expose auth/disabled/error without claiming delivery", async () => {
  const { getTouchlineFixtureAlertCopy: getCopy } = await catalogue();
  for (const method of ["GET", "PUT"]) for (const [status, body, phase] of [[401, {}, "signed-out"], [503, { error: "ALERTS_NOT_ENABLED" }, "disabled"], [500, {}, "error"], [200, { ok: true, data: { subscribed: null }, delivery: "unavailable" }, "error"], [200, { ok: true, data: { subscribed: true }, delivery: "available" }, "error"], [200, { ok: "true", data: { subscribed: true }, delivery: "unavailable" }, "error"]] as const) {
    const instance = harness(getCopy); instance.open();
    if (method === "PUT") { instance.requests[0].reply(acknowledgement(false)); await flush(); instance.click(nodes(instance.render(), "button")[1]); }
    instance.requests.at(-1)!.reply(body, status); await flush();
    assert.equal(instance.state[2], null); assert.equal(instance.state[3], phase);
    assert.equal(nodes(instance.render(), "p")[1].props.children, getCopy("en-GB").deliveryUnavailable);
    assert.equal(instance.timers.size, 0);
  }
});

test("15-second abort and cleanup generation fence late GET/PUT and preserve a new fixture state", async () => {
  const { getTouchlineFixtureAlertCopy: getCopy } = await catalogue();
  for (const method of ["GET", "PUT"]) for (const finish of ["timeout", "dispose", "new-fixture"]) {
    const instance = harness(getCopy); instance.open();
    if (method === "PUT") { instance.requests[0].reply(acknowledgement(false)); await flush(); instance.click(nodes(instance.render(), "button")[1]); }
    const old = instance.requests.at(-1)!;
    assert.deepEqual([...instance.timers.values()].map(timer => timer.delay), [15_000]);
    if (finish === "timeout") instance.expire();
    else if (finish === "dispose") instance.dispose();
    else { instance.render("new-id"); instance.commit(); instance.requests.at(-1)!.reply(acknowledgement(false)); await flush(); }
    assert.equal(old.options.signal?.aborted, true);
    const before = [...instance.state];
    old.reply(acknowledgement(true)); await flush();
    if (finish === "timeout") { assert.equal(instance.state[3], "error"); assert.equal(instance.state[2], null); }
    else assert.deepEqual(instance.state, before, "late old response must not change current state");
    assert.equal(instance.timers.size, 0);
  }
});
