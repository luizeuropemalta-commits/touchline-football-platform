import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import * as icons from "lucide-react";
import { cardEngineFixture, cardEnginePlayers, cardEngineBatches, cardEngineOverrides } from "./helpers/admin-card-engine-language-fixture.mts";

test("real Card Engine page normalizes PT/EN, localizes counts and preserves query contracts", async () => {
  const pt = cardEngineFixture(), en = cardEngineFixture();
  const portuguese = await pt.render({ lang: ["pt-BR", "en-GB"] }), english = await en.render({ lang: "en-GB" });
  assert.match(portuguese, /Candidatos canônicos/); assert.match(english, /Canonical candidates/);
  assert.match(portuguese, /1\.234/); assert.match(english, /1,234/);
  for (const [html, lang] of [[portuguese, "pt-BR"], [english, "en-GB"]]) {
    assert.match(html, new RegExp(`/admin\\?lang=${lang}`));
    assert.doesNotMatch(html, /<a\b[^>]*>\s*(?:Português|English)\s*<\/a>/);
    assert.match(html, /SYNTHETIC PLAYER/); assert.doesNotMatch(html, /Invalid Date/);
  }
  assert.equal(JSON.stringify(pt.calls), JSON.stringify(en.calls));
  assert.match(await cardEngineFixture().render({ lang: "pt" }), /Canonical candidates/);
});

test("real Card Engine page keeps owner denial and localized auth return links before data reads", async () => {
  for (const lang of ["pt-BR", "en-GB"]) {
    const anonymous = cardEngineFixture({ user: null }), denied = cardEngineFixture({ user: { email: "other@example.test" } });
    const html = await anonymous.render({ lang });
    assert.ok(html.includes(lang === "pt-BR" ? "Entrar" : "Sign in"));
    assert.ok(html.includes(`lang=${lang}`)); assert.ok(decodeURIComponent(html).includes(`/admin/card-engine?lang=${lang}`));
    assert.ok((await denied.render({ lang })).includes(lang === "pt-BR" ? "Card Engine indisponível" : "Card Engine unavailable"));
    assert.deepEqual(anonymous.calls, [["getUser"]]); assert.deepEqual(denied.calls, [["getUser"]]);
  }
});

test("Card Engine read errors are explicit, sanitized and never fabricated zero counts", async () => {
  for (const lang of ["pt-BR", "en-GB"]) for (const source of ["football_players", "touchline_card_editorial_batches", "touchline_card_editorial_overrides", "count"]) {
    const html = await cardEngineFixture({ errors: { [source]: "PRIVATE_DATABASE_SENTINEL" } }).render({ lang });
    assert.doesNotMatch(html, /PRIVATE_DATABASE_SENTINEL/);
    assert.match(html, /—/);
    assert.ok(html.includes(lang === "pt-BR" ? "indisponív" : "unavailable"));
  }
  for (const lang of ["pt-BR", "en-GB"]) {
    const empty = await cardEngineFixture({ empty: true }).render({ lang });
    assert.ok(empty.includes(lang === "pt-BR" ? "Nenhum candidato" : "No candidates"));
    assert.ok((await cardEngineFixture({ nullCount: true }).render({ lang })).includes("—"));
    const missing = await cardEngineFixture({ errors: { touchline_card_editorial_overrides: "column does not exist PRIVATE_DATABASE_SENTINEL" } }).render({ lang });
    assert.doesNotMatch(missing, /PRIVATE_DATABASE_SENTINEL/);
  }
});

type ConsoleElement = React.ReactElement<Record<string, unknown>>;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const consoleCode = ts.transpileModule(readFileSync(new URL("../components/admin-card-engine-console.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function consoleFixture(locale = "pt-BR") {
  let cursor = 0, reloads = 0;
  const slots: unknown[] = [], requests: { url: string; method: string; body: unknown }[] = [];
  const replies: ReturnType<typeof deferred<{ ok: boolean; json(): Promise<unknown> }>>[] = [];
  const exports: { AdminCardEngineConsole?: (props: unknown) => ConsoleElement } = {};
  const modules: Record<string, unknown> = {
    react: { ...React,
      useState(initial: unknown) { const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
        return [slots[slot], (next: unknown) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }]; },
      useRef(initial: unknown) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    },
    "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/touchlineArena/auth-i18n": auth,
  };
  runInNewContext(consoleCode, { exports, Error, Intl,
    require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
    fetch(url: string, init: { method: string; body: string }) { requests.push({ url, method: init.method, body: JSON.parse(init.body) }); const reply = deferred<{ ok: boolean; json(): Promise<unknown> }>(); replies.push(reply); return reply.promise; },
    window: { location: { reload() { reloads++; } } },
  });
  const descendants = (node: React.ReactNode): ConsoleElement[] => React.Children.toArray(node).flatMap(child =>
    React.isValidElement(child) ? [child as ConsoleElement, ...descendants((child as ConsoleElement).props.children as React.ReactNode)] : []);
  const text = (node: React.ReactNode): string => React.Children.toArray(node).map(child => React.isValidElement(child)
    ? text((child as ConsoleElement).props.children as React.ReactNode) : String(child)).join("");
  const render = () => { cursor = 0; const tree = exports.AdminCardEngineConsole!({ locale, players: cardEnginePlayers, batches: cardEngineBatches, overrides: cardEngineOverrides, migrationReady: true }); return { html: renderToStaticMarkup(tree), elements: descendants(tree) }; };
  const find = (predicate: (element: ConsoleElement) => boolean) => { const found = render().elements.find(predicate); assert.ok(found, "expected real console element"); return found; };
  const button = (name: string) => find(element => element.type === "button" && text(element.props.children as React.ReactNode) === name);
  const click = (name: string) => (button(name).props.onClick as () => void | Promise<void>)();
  const content = () => find(element => element.type === "textarea");
  const season = () => find(element => element.type === "input" && element.props.value !== undefined);
  const change = (element: ConsoleElement, value: string) => (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  const readFile = (selected: { size: number; text(): Promise<string> }) => (find(element => element.type === "input" && element.props.type === "file").props.onChange as (event: unknown) => Promise<void>)({ currentTarget: { files: [selected] } });
  return { render, button, click, content, season, change, readFile, requests, reloads: () => reloads,
    reply(index: number, ok: boolean, payload: unknown) { replies[index].resolve({ ok, json: async () => payload }); } };
}

const invalidCsv = "No valid header/data rows were found. Use provider_player_id, player_id, name, club, date_of_birth, display_name, shirt_number, market_value_eur or card_template_key.";
test("CSV validation stays in its tab and switching tabs preserves import drafts", async () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const h = consoleFixture(locale), pt = locale === "pt-BR", bulk = pt ? "Importação em lote" : "Bulk Import", preview = pt ? "Somente prévia" : "Preview only";
    await h.click(bulk); const draft = h.content().props.value;
    h.change(h.season(), "2027-28");
    const work = h.click(preview); h.reply(0, false, { error: invalidCsv }); await work;
    assert.match(h.render().html, /role="alert"/);
    await h.click(bulk); assert.match(h.render().html, /role="alert"/, "clicking the active tab keeps relevant validation");
    for (const name of pt ? ["Revisar e publicar", "Ajustes editoriais", "Histórico de auditoria"] : ["Review & Publish", "Overrides", "Audit History"]) {
      await h.click(name); assert.doesNotMatch(h.render().html, /role="alert"/, name);
    }
    await h.click(bulk); assert.equal(h.content().props.value, draft); assert.equal(h.season().props.value, "2027-28");
    assert.doesNotMatch(h.render().html, /role="alert"/);
    assert.deepEqual(h.requests, [{ url: "/api/admin/card-engine", method: "POST", body: { action: "preview", text: draft, sourceType: "paste", effectiveSeason: "2027-28" } }]);
    assert.equal(h.reloads(), 0);
  }
});

test("late preview responses cannot restore feedback after leaving and returning to its tab", async () => {
  for (const ok of [false, true]) {
    const h = consoleFixture(); await h.click("Importação em lote");
    const draft = h.content().props.value, work = h.click("Somente prévia");
    assert.equal(h.button("Somente prévia").props.disabled, true);
    await h.click("Revisar e publicar"); await h.click("Importação em lote");
    h.reply(0, ok, ok ? { ok: true, summary: { matched: 9876 } } : { error: invalidCsv }); await work;
    assert.doesNotMatch(h.render().html, /role="alert"|Prévia\/resultado|9\.876/);
    assert.equal(h.button("Somente prévia").props.disabled, false);
    assert.equal(h.content().props.value, draft); assert.equal(h.requests.length, 1); assert.equal(h.reloads(), 0);
  }
});

test("late file reads cannot overwrite preserved drafts or surface errors on another tab", async () => {
  for (const fails of [false, true]) {
    const h = consoleFixture(); await h.click("Importação em lote");
    h.change(h.content(), "preserved draft"); const read = deferred<string>();
    const work = h.readFile({ size: 20, text: () => read.promise });
    await h.click("Histórico de auditoria"); await h.click("Importação em lote");
    h.change(h.content(), "newer draft");
    if (fails) read.reject(Error("PRIVATE_FILE_ERROR")); else read.resolve("older file contents");
    await work;
    assert.equal(h.content().props.value, "newer draft"); assert.doesNotMatch(h.render().html, /role="alert"|PRIVATE_FILE_ERROR/);
    assert.equal(h.requests.length, 0); assert.equal(h.reloads(), 0);
  }
});

test("tab changes never cancel, duplicate or alter a successful Card Engine command", async () => {
  for (const [action, name, batchIndex] of [["create", "Criar lote para revisão", -1], ["approve", "Aprovar", 0], ["publish", "Publicar", 1], ["rollback", "Reverter", 2]] as const) {
    const h = consoleFixture(); await h.click(action === "create" ? "Importação em lote" : "Revisar e publicar");
    const draft = action === "create" ? h.content().props.value : null;
    const work = h.click(name); await h.click("Histórico de auditoria");
    h.reply(0, true, { ok: true }); await work;
    assert.deepEqual(h.requests, [{ url: "/api/admin/card-engine", method: action === "create" ? "POST" : "PATCH", body: action === "create"
      ? { action, text: draft, sourceType: "paste", effectiveSeason: "2026-27" } : { action, batchId: cardEngineBatches[batchIndex].id } }]);
    assert.equal(h.reloads(), 1); assert.doesNotMatch(h.render().html, /Prévia\/resultado|role="alert"/);
  }
});

test("late command failures stay visible after navigation without disclosing diagnostics or retrying", async () => {
  for (const [action, name, batchIndex] of [["create", "Criar lote para revisão", -1], ["approve", "Aprovar", 0], ["publish", "Publicar", 1], ["rollback", "Reverter", 2]] as const) {
    const h = consoleFixture(); await h.click(action === "create" ? "Importação em lote" : "Revisar e publicar");
    const draft = action === "create" ? h.content().props.value : null;
    const work = h.click(name); await h.click("Histórico de auditoria");
    h.reply(0, false, { error: "PRIVATE_DATABASE_SENTINEL" }); await work;
    assert.match(h.render().html, /role="alert"/);
    assert.match(h.render().html, /Não foi possível confirmar a ação do Card Engine/);
    assert.doesNotMatch(h.render().html, /PRIVATE_DATABASE_SENTINEL|Prévia\/resultado/);
    assert.deepEqual(h.requests, [{ url: "/api/admin/card-engine", method: action === "create" ? "POST" : "PATCH", body: action === "create"
      ? { action, text: draft, sourceType: "paste", effectiveSeason: "2026-27" } : { action, batchId: cardEngineBatches[batchIndex].id } }]);
    assert.equal(h.reloads(), 0);
    await h.click("Revisar e publicar");
    assert.doesNotMatch(h.render().html, /role="alert"/);
    assert.equal(h.button("Aprovar").props.disabled, false);
  }
});
