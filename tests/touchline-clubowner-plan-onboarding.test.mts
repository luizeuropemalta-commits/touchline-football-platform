import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as plans from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import * as market from "../lib/touchlineArena/club-owner-market-i18n.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as checkoutClient from "../lib/stripe/club-season-checkout-client.ts";
import type { ClubOwnerPlanOnboardingProps } from "../components/touchline/ClubOwnerPlanOnboarding.tsx";

type Element = React.ReactElement<Record<string, unknown>>;
const source = readFileSync(new URL("../components/touchline/ClubOwnerPlanOnboarding.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}

function fixture(initial: Partial<ClubOwnerPlanOnboardingProps> = {}, checkoutRequest: typeof checkoutClient.requestClubSeasonCheckout = async () => { throw new Error("unavailable"); }) {
  let props: ClubOwnerPlanOnboardingProps, cursor = 0, tree: React.ReactNode, focused = "", modal = false, shows = 0, dismissals = 0;
  const redirects: string[] = [];
  const selections: string[] = [], slots: unknown[] = [], effects: (() => void)[] = [];
  class FakeElement { readonly label: string; constructor(label: string) { this.label = label; } focus() { focused = this.label; } }
  const document = { activeElement: new FakeElement("entry-trigger") };
  const react = { ...React,
    useId: () => "onboarding-fixture",
    useRef(value: unknown) { const index = cursor++; return slots[index] ?? (slots[index] = { current: value }); },
    useState(value: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], (next: unknown) => { slots[index] = next; }]; },
    useLayoutEffect(fn: () => void | (() => void), deps: unknown[]) { const index = cursor++, prior = slots[index] as { deps: unknown[]; cleanup?: void | (() => void) } | undefined;
      if (!prior || prior.deps.some((value, i) => value !== deps[i])) { const next = { deps, cleanup: undefined as void | (() => void) }; slots[index] = next; effects.push(() => { prior?.cleanup?.(); next.cleanup = fn(); }); } },
  };
  const exports: { default?: (props: ClubOwnerPlanOnboardingProps) => React.ReactNode } = {};
  runInNewContext(compiled, { exports, document, HTMLElement: FakeElement, AbortController, window: { setTimeout, clearTimeout, location: { assign: (url: string) => redirects.push(url) } }, require(name: string) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return runtime;
    if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
    if (name.includes("club-season-checkout-client")) return { ...checkoutClient, requestClubSeasonCheckout: checkoutRequest };
    if (name.includes("catalogue-locale")) return catalogue;
    if (name.includes("club-owner-market-i18n")) return market;
    if (name.includes("club-owner-plan-showcase")) return plans;
    if (name === "./ClubOwnerPlanShowcase") return { ClubOwnerPlanCard: (p: { tier: string }) => React.createElement("div", { "data-original-plan-card": p.tier }, p.tier) };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw new Error(name);
  } });
  const dialogNode = { open: true, matches: () => modal, close() { this.open = false; modal = false; }, showModal() { this.open = true; modal = true; shows++; }, scrollTo() {} };
  function render() {
    cursor = 0; tree = exports.default!(props);
    while (React.isValidElement(tree) && typeof tree.type === "function") tree = (tree.type as (p: unknown) => React.ReactNode)(tree.props);
    for (const node of nodes(tree)) {
      const ref = node.props.ref as ((node: FakeElement) => void) | { current: unknown } | undefined;
      if (!ref) continue;
      const element = node.type === "dialog" ? dialogNode : new FakeElement(String(node.props["aria-label"] ?? node.type));
      if (typeof ref === "function") ref(element as FakeElement); else ref.current = element;
    }
    while (effects.length) effects.shift()!();
  }
  props = { open: true, locale: "pt-BR", onDismiss: () => { dismissals++; }, onSelect: plan => selections.push(plan), ...initial };
  render();
  function find(predicate: (node: Element) => boolean) { const result = nodes(tree).find(predicate); assert.ok(result); return result; }
  return {
    settle: async () => { await new Promise(resolve => setImmediate(resolve)); render(); }, redirects,
    html: () => renderToStaticMarkup(tree), selections, focused: () => focused, shows: () => shows, dismissals: () => dismissals,
    update: (next: Partial<ClubOwnerPlanOnboardingProps>) => { props = { ...props, ...next }; render(); },
    button: (label: string) => find(node => node.type === "button" && (node.props["aria-label"] === label || renderToStaticMarkup(node).includes(`>${label}<`))),
    click(label: string) { const button = this.button(label); if (!button.props.disabled) (button.props.onClick as () => void)?.(); render(); },
    cancel() { const dialog = find(node => node.type === "dialog"); let prevented = false; (dialog.props.onCancel as (e: { preventDefault(): void }) => void)({ preventDefault() { prevented = true; } }); render(); return prevented; },
    unmount() { for (const slot of slots) { if (slot && typeof slot === "object" && "cleanup" in slot) (slot as { cleanup?: () => void }).cleanup?.(); } slots.length = 0; tree = null; },
  };
}

test("the actual ClubOwner cover delegates to the mounted full-screen dialog without opening a second zoom", () => {
  const header = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /onClick=\{\(\) => setPlansOpen\(true\)\}/);
  assert.match(header, /<ClubOwnerPlanOnboarding\b[\s\S]*?\bopen=\{plansOpen\}/);
  assert.match(header, /onDismiss=\{\(\) => setPlansOpen\(false\)\}/);
  const showcase = readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("cover.tsx", showcase, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "openDialog") initializer = node.initializer; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(initializer);
  let opened = 0;
  const handler = runInNewContext(ts.transpileModule(`(${initializer.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    onOpenDetails: () => { opened++; }, returnFocus: { current: null },
    setZoomOpen: () => assert.fail("legacy zoom must not also open"), dialog: { current: { showModal: () => assert.fail("second dialog") } },
  });
  handler({}); assert.equal(opened, 1);
});

test("first entry is already full-screen markup with exactly four offers and no default choice", () => {
  const view = fixture(); const html = view.html();
  assert.match(html, /<dialog open=""/); assert.match(html, /aria-modal="true"/);
  assert.match(html, /data-plan-preview="all"/);
  assert.deepEqual([...html.matchAll(/data-original-plan-card="([^"]+)"/g)].map(match => match[1]), ["beta", "standard", "master", "vip"]);
  assert.deepEqual(view.selections, []); assert.equal(view.shows(), 1); assert.equal(view.focused(), "h2");
  assert.doesNotMatch(html, /data-plan-detail|data-current-plan|aria-selected="true"/);
  assert.match(html, /€49,90\/temporada/); assert.match(html, /€89,90\/temporada/); assert.match(html, /€169,90\/temporada/);
});

test("benefits remain in the same dialog; back restores focus; hiring stays unavailable", () => {
  const view = fixture(); view.click("Ver benefícios: VIP");
  assert.match(view.html(), /35 jogadores \+ 1 treinador/);
  assert.doesNotMatch(view.html(), /Elenco Beta previsto/);
  assert.match(view.html(), /regras previstas, ainda indisponíveis/);
  assert.equal((view.html().match(/<dialog/g) ?? []).length, 1);
  assert.match(view.html(), /data-plan-detail="vip"/);
  assert.match(view.html(), /Jogadores no elenco/); assert.match(view.html(), />35<|>3</);
  assert.match(view.html(), /2%/); assert.match(view.html(), /200M TC/);
  assert.equal(view.button("Contratar plano").props.disabled, true);
  assert.deepEqual(view.selections, []);
  view.click("Contratar plano"); assert.deepEqual(view.selections, []);
  assert.equal(view.dismissals(), 0); assert.doesNotMatch(view.html(), /data-current-plan/);
  view.click("Todos os planos"); assert.match(view.html(), /data-plan-gallery="true"/); assert.equal(view.focused(), "Ver benefícios: VIP");
  assert.equal(view.shows(), 1);
});

test("Beta exploration never invokes legacy selection or hiring callbacks", () => {
  const view = fixture(); view.click("Ver benefícios: Beta"); assert.deepEqual(view.selections, []);
  assert.match(view.html(), /100M TC compartilhados entre 35 jogadores e 1 treinador/);
  assert.match(view.html(), /Treinador inicial Ruby: 5M TC; saldo restante: 95M TC/);
  assert.doesNotMatch(view.html(), /Jogadores e treinador usam o mesmo saldo/);
  assert.match(view.html(), /100M TC/); assert.doesNotMatch(view.html(), /Pagamento indisponível/);
  view.click("Contratar plano"); view.click("Contratar plano"); assert.deepEqual(view.selections, []);
  view.update({ selecting: true }); assert.equal(view.button("Contratar plano").props.disabled, true);
  view.update({ selecting: false, onSelect: undefined, selectionError: true }); assert.equal(view.button("Contratar plano").props.disabled, true);
  assert.match(view.html(), /pagamento ainda não conectado/);
});

test("current badge follows received entitlement only, never explored offer", () => {
  const view = fixture({ activePlanKey: "vip" });
  assert.equal((view.html().match(/data-current-plan-badge=/g) ?? []).length, 1);
  assert.match(view.html(), /data-current-plan-badge="vip"/);
  view.click("Ver benefícios: Beta");
  assert.doesNotMatch(view.html(), /data-current-plan-badge/);
  view.click("Todos os planos"); view.click("Ver benefícios: VIP");
  assert.match(view.html(), /Seu plano atual/); assert.doesNotMatch(view.html(), /Contratar plano/);
  view.update({ activePlanKey: "standard" });
  assert.doesNotMatch(view.html(), /data-current-plan-badge/);
  assert.equal(view.button("Contratar plano").props.disabled, true);
  view.update({ activePlanKey: null }); view.click("Todos os planos");
  assert.doesNotMatch(view.html(), /data-current-plan-badge/);
});

test("controlled dismissal via escape and close returns focus when parent unmounts", () => {
  const view = fixture(); assert.equal(view.cancel(), true); assert.equal(view.dismissals(), 1);
  view.unmount(); assert.equal(view.focused(), "entry-trigger");
  const reopened = fixture(); assert.match(reopened.html(), /data-plan-gallery="true"/); reopened.click("Fechar"); assert.equal(reopened.dismissals(), 1);
  const closed = fixture({ open: false }); assert.equal(closed.html(), ""); assert.equal(closed.shows(), 0); assert.deepEqual(closed.selections, []);
});

test("onboarding reuses canonical cards/copy and keeps glass styling scoped", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const view = fixture({ locale, draftLocalesEnabled: true }); assert.match(view.html(), /data-plan-gallery/); assert.doesNotMatch(view.html(), /undefined/);
  }
  assert.match(source, /import \{ ClubOwnerPlanCard \} from "\.\/ClubOwnerPlanShowcase"/);
  assert.match(source, /TouchlineGlobalNavigation.module.css/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|supabase|router\./);
  assert.match(source, /checkoutEnabled = false/);
  const css = readFileSync(new URL("../components/touchline/ClubOwnerPlanOnboarding.module.css", import.meta.url), "utf8");
  assert.match(css, /height: 100dvh/); assert.match(css, /max-width: none/); assert.match(css, /border-radius: 0/);
  assert.match(css, /background: var\(--touchline-modal-backdrop/); assert.match(css, /backdrop-filter: var\(--touchline-modal-blur/);
  assert.doesNotMatch(css, /:global|background: #000|background: black/);
});

test("plan details and gallery prices inherit exactly the existing plan palette", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerPlanOnboarding.module.css", import.meta.url), "utf8");
  const canonical = readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8");
  for (const plan of ["beta", "standard", "master", "vip"]) {
    const original = canonical.match(new RegExp(`\\.memberCard\\[data-plan-offer="${plan}"\\] \\{ --plan-accent: (#[a-f0-9]+);`))?.[1];
    assert.ok(original);
    assert.ok(css.includes(`.dialog[data-plan-preview="${plan}"], .offer[data-plan-preview="${plan}"] { --onboarding-accent: ${original}; }`));
  }
  assert.match(css, /\.offerPrice strong \{ color: var\(--onboarding-accent\)/);
  assert.match(css, /\.price \{ color: var\(--onboarding-accent\)/);
  assert.match(css, /\.benefits dd \{ color: var\(--onboarding-accent\)/);
});


test("checkout stays unavailable without a server quote even when capability is on",()=> {
  const view=fixture({checkoutEnabled:true});view.click("Ver benefícios: Master");
  assert.equal(view.button("Contratar plano").props.disabled,true);
  assert.doesNotMatch(view.html(),/data-checkout-quote/);
});
test("confirmed upgrade quote displays the difference while first click locks further payment attempts",async()=> {
  let calls=0;let resolve!: (url:string)=>void;
  const view=fixture({checkoutEnabled:true,activePlanKey:"standard",checkoutOffers:{master:{amountMinor:4000}}},(plan,amount)=>{
    assert.equal(plan,"master");assert.equal(amount,4000);
    calls++;return new Promise<string>(done=>{resolve=done;});
  });
  view.click("Ver benefícios: Master");assert.match(view.html(),/A pagar agora · teste:.*40,00/);
  view.click("Continuar para pagamento de teste");view.click("Preparando pagamento de teste…");
  assert.equal(calls,1);assert.equal(view.button("Preparando pagamento de teste…").props.disabled,true);
  resolve("https://checkout.stripe.com/c/pay/cs_test_one");await view.settle();
  assert.deepEqual(view.redirects,["https://checkout.stripe.com/c/pay/cs_test_one"]);
  assert.deepEqual(view.selections,[]);assert.doesNotMatch(view.html(),/data-current-plan-badge="master"/);
});
test("checkout failure is accessible and dismissal cancels a pending redirect",async()=> {
  const failed=fixture({checkoutEnabled:true,checkoutOffers:{standard:{amountMinor:4990}}});
  failed.click("Ver benefícios: Standard");failed.click("Continuar para pagamento de teste");await failed.settle();
  assert.match(failed.html(),/role="alert"/);assert.match(failed.html(),/Confira seu plano antes/);
  assert.equal(failed.button("Continuar para pagamento de teste").props.disabled,false);
  let resolve!: (url:string)=>void;let signal!:AbortSignal;
  const dismissed=fixture({checkoutEnabled:true,checkoutOffers:{standard:{amountMinor:4990}}},(_plan,_amount,s)=>{
    signal=s;return new Promise<string>(done=>{resolve=done;});
  });
  dismissed.click("Ver benefícios: Standard");dismissed.click("Continuar para pagamento de teste");dismissed.click("Fechar");
  assert.equal(signal.aborted,true);resolve("https://checkout.stripe.com/c/pay/cs_test_one");await dismissed.settle();
  assert.deepEqual(dismissed.redirects,[]);
});
