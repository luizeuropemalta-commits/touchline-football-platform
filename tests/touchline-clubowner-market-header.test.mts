import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import * as profileMetrics from "../lib/touchlineArena/club-owner-profile-metrics.ts";
import * as planShowcase from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as marketBudgetCopy from "../lib/touchlineFantasy/market-budget-i18n.ts";
import * as checkoutClient from "../lib/stripe/club-season-checkout-client.ts";

const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
const stage = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const headerPath = new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url);
const header = existsSync(headerPath) ? readFileSync(headerPath, "utf8") : "";
const loadCopy = () => import("../lib/touchlineArena/club-owner-market-i18n.ts");
const baseline = {
  "en-GB": {
    nameUnavailable: "Name unavailable", photoAria: "Change profile photo — unavailable", photoUnavailable: "Photo updates are not available yet",
    yourProfile: "YOUR PROFILE", location: "Location", nationality: "Nationality", memberSince: "Member since", watchIntro: "Watch intro",
    plan: "My plan", planStandard: "Standard", planPro: "PRO", planActive: "ACTIVE", planInactive: "NOT ACTIVE", marketPower: "Market power", marketPowerUnavailable: "Market power unavailable", activatePlan: "Activate plan", renewPlan: "Renew", proMember: "PRO MEMBER", proAccess: "PRO ACCESS", proPrivileges: "Exclusive member benefits",
    planUntil: "Valid until {date}", planActiveNoEnd: "Your plan is active.", planInactiveDetail: "Activate a plan to manage your XI.", planStandardPrice: "€49.90/season", planStandardBenefit: "Full access to the game and rankings.", planProPrice: "€89.90/season", planProBenefit: "Premium visual, history, reports and alerts.",
    planActionUnavailable: "Plan activation and renewal are not available yet.", virtualBudgetSeparate: "Your XI budget remains separate from your plan.",
  },
  "pt-BR": {
    nameUnavailable: "Nome não disponível", photoAria: "Alterar foto do perfil — indisponível", photoUnavailable: "Alteração de foto ainda indisponível",
    yourProfile: "SEU PERFIL", location: "Localização", nationality: "Nacionalidade", memberSince: "Membro desde", watchIntro: "Ver intro",
    plan: "Meu plano", planStandard: "Standard", planPro: "PRO", planActive: "ATIVO", planInactive: "NÃO ATIVO", marketPower: "Poder de mercado", marketPowerUnavailable: "Poder de mercado indisponível", activatePlan: "Ativar plano", renewPlan: "Renovar", proMember: "MEMBRO PRO", proAccess: "ACESSO PRO", proPrivileges: "Benefícios exclusivos do membro",
    planUntil: "Válido até {date}", planActiveNoEnd: "Seu plano está ativo.", planInactiveDetail: "Ative um plano para gerenciar seu XI.", planStandardPrice: "€49,90/temporada", planStandardBenefit: "Acesso completo ao jogo e ao ranking.", planProPrice: "€89,90/temporada", planProBenefit: "Visual premium, histórico, relatórios e alertas.",
    planActionUnavailable: "A ativação e a renovação do plano ainda não estão disponíveis.", virtualBudgetSeparate: "O orçamento do seu XI continua separado do seu plano.",
  },
};

test("the actual account owns the ClubOwner header, while the approved countdown labels player selection", () => {
  assert.match(page, /<ClubOwnerMarketHeader/);
  assert.match(page, /clubOwner\?\.isAuthenticatedClubOwner \? clubOwner : null/);
  assert.match(header, /<h1>ClubOwner<\/h1>/);
  assert.match(header, /owner\?\.name/);
  assert.doesNotMatch(header, /PUBLIC_CLUB_OWNER|Luiz Lopez|localStorage/);
  assert.doesNotMatch(stage, /styles\.clubOwnerArea|data-market-club-owner-area/);
  assert.match(stage, /data-market-heading="status">\s*\{qaClubMarketOpen \? null : <MarketWindowClock/);
  assert.doesNotMatch(stage, /<h2>\{workflowCopy\.market\}<\/h2>/);
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("en-GB").market, "Market");
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("pt-BR").market, "Mercado");
});

test("the plan is explicit, uses entitlement state and has no invented payment or balance", () => {
  assert.match(header, /data-plan-state=/);
  assert.match(header, /const displayedTier = currentTier \?\? undefined/);
  assert.doesNotMatch(header, /setVisualTier|onPreviewChange/);
  assert.doesNotMatch(header, /showAllPlans/);
  assert.doesNotMatch(header, /fetch\(|localStorage|requestClubSeasonCheckout|window\.location|walletBalance|amountMinor|£|€|\bGBP\b|\bBRL\b/);
  assert.match(header, /checkoutOffers=\{checkoutOffers\}/, "only server-confirmed offers reach the checkout dialog");
});

test("the right-hand plan selector owns the premium interaction without an old gallery", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.match(header, /<ClubOwnerPlanCard compact tier=\{currentTier\}/);
  assert.match(header, /<ClubOwnerPlanOnboarding\b[\s\S]*?\bopen=\{plansOpen\}/);
  assert.match(header, /className=\{styles\.bank\}/);
  assert.match(css, /\.profile::before, \.bank::before/);
  assert.match(css, /\.header\[data-plan-preview\] :is\(\.profile,\.bank\)/);
  assert.doesNotMatch(header, /styles\.(?:deposit|activatePlan)/);
});

test("market power stays inside the compact right-hand selector", async () => {
  const html = renderHeader(null, "pt-BR", await loadCopy(), { remainingMarketPower: 121_000_000 });
  assert.match(html, /Poder de mercado/);
  assert.match(html, /data-account-market-power="true"[\s\S]*>121\.000\.000<\/strong>/);
  assert.match(html, /TouchLine Credits/);
  assert.match(html, /Ver planos/);
  assert.doesNotMatch(html, /role="tablist"|data-plan-onboarding/);
  assert.equal((html.match(/data-plan-offer=/g) ?? []).length, 0);
});

test("retired local Pro preview cannot restore a fifth offered plan or change account identity", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "pro" });
  assert.doesNotMatch(html, /data-plan-tier=|data-plan-preview=/);
  assert.match(html, /class="header"/);
  assert.match(html, /Meu plano/);
  assert.match(html, /Real Owner/);
  assert.equal((html.match(/data-plan-tier="pro"/g) ?? []).length, 0);
  assert.match(html, /data-plan-state="inactive"/);
  assert.doesNotMatch(html, /data-profile-tier=|data-profile-active-plan=/);
});

test("VIP never exposes a legacy unlimited market-power path", async () => {
  const copyModule = await loadCopy();
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const html = renderHeader(null, code, copyModule, { remainingMarketPower: null, plan: { active: true, expiresAt: null }, activePlanKey: "vip", draftLocalesEnabled: true });
    assert.doesNotMatch(html, /data-current-xi-unlimited|>∞/);
    // Club-count benefits may say unlimited; monetary authority must not.
    const budgetMarkup = html.match(/<span[^>]*data-plan-budget="vip"[\s\S]*?<\/strong>/)?.[0];
    assert.ok(budgetMarkup);
    assert.doesNotMatch(budgetMarkup, /Ilimitado|Unlimited|∞/);
    assert.match(html, /data-plan-budget="vip"[\s\S]*>3B<\/strong>/);
  }
});

test("collection header uses only the confirmed collection wallet, never the old XI balance", async () => {
  const copy = await loadCopy();
  const props = { collectionEnabled: true, remainingMarketPower: 211_000_000,
    activePlanKey: "vip", plan: { active: true, expiresAt: null } };
  const waiting = renderHeader(null, "pt-BR", copy, props);
  assert.doesNotMatch(waiting, /211\.000\.000/);
  assert.match(waiting, /data-account-market-power="true"[^>]*aria-label="Poder de mercado indisponível"/);
  const state: acquisition.ClubAcquisitionState = { revision: 2, seasonId: "season", plan: "vip",
    balanceEur: 873_000_000, coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [] };
  const confirmed = renderHeader(null, "pt-BR", copy, props, undefined, state);
  assert.match(confirmed, /data-account-market-power="true"[\s\S]*>873\.000\.000<\/strong>/);
  assert.doesNotMatch(confirmed, /211\.000\.000/);
  assert.match(confirmed, /3\.000\.000\.000 TouchLine Credits/);
  const legacy = renderHeader(null, "pt-BR", copy, { ...props, collectionEnabled: false }, undefined, state);
  assert.match(legacy, /data-account-market-power="true"[\s\S]*>211\.000\.000<\/strong>/);
  assert.doesNotMatch(legacy, /873\.000\.000/);
});

test("collection header distinguishes signing funds from the last confirmed balance", async () => {
  const copy = await loadCopy();
  const props = { collectionEnabled: true, remainingMarketPower: 211_000_000,
    activePlanKey: "vip", plan: { active: true, expiresAt: null } };
  const state: acquisition.ClubAcquisitionState = { revision: 2, seasonId: "season", plan: "vip",
    balanceEur: 873_000_000, coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [] };
  for (const locale of ["pt-BR", "en-GB"]) {
    const labels = marketBudgetCopy.getClubCollectionBudgetCopy(locale);
    const confirmed = renderHeader(null, locale, copy, props, undefined, state, null, "confirmed");
    assert.ok(confirmed.includes(`<dt>${labels.signingBudget}</dt>`));
    const balance = confirmed.match(/<dd data-account-market-power="true"[^>]*>([\s\S]*?)<\/dd>/)?.[1];
    assert.ok(balance);
    assert.ok(balance.includes(`<strong>${new Intl.NumberFormat(locale).format(state.balanceEur)}</strong>`));
    assert.doesNotMatch(balance, /211[,.]000[,.]000/);
    assert.doesNotMatch(confirmed, /remaining XI budget|orçamento restante do XI|data-balance-verification/);
    for (const status of ["pending", "unavailable"] as const) {
      const waiting = renderHeader(null, locale, copy, props, undefined, state, null, status);
      assert.ok(waiting.includes(`<dt>${labels.lastConfirmedBalance}</dt>`));
      assert.ok(waiting.includes(new Intl.NumberFormat(locale).format(state.balanceEur)));
      assert.ok(waiting.includes(labels[status]));
      assert.match(waiting, new RegExp(`data-balance-verification="${status}"`));
      assert.match(waiting, /aria-describedby="clubowner-balance-status"/);
      assert.doesNotMatch(waiting, /211[,.]000[,.]000/);
    }
    const missing = renderHeader(null, locale, copy, props, undefined, null, null, "pending");
    assert.ok(missing.includes(`<dt>${labels.signingBudget}</dt>`));
    assert.doesNotMatch(missing, new RegExp(labels.lastConfirmedBalance));
    assert.match(missing, /<strong>—<\/strong>/);
    const zero = renderHeader(null, locale, copy, props, undefined, { ...state, balanceEur: 0 }, null, "unavailable");
    assert.ok(zero.includes(labels.lastConfirmedBalance)); assert.match(zero, /<strong>0<\/strong>/);
  }
});

test("ClubOwner keeps the green sweep on panels without a duplicated profile plan badge", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.proTier \.profile/);
  assert.match(css, /\.profile::after, \.bank::after/);
  assert.match(css, /animation: clubOwnerGreenSweep 9s linear infinite/);
  assert.doesNotMatch(css, /\.proBadge|\.standardBadge|\.betaBadge|\.vipBadge/);
  const marketPower = css.match(/\.marketPowerValue strong, \.marketPowerValue small \{([^}]+)\}/)?.[1] ?? "";
  assert.ok(marketPower.includes("color: #f0b631"));
  assert.ok(marketPower.includes("animation: none"));
  assert.match(css, /prefers-reduced-motion/);
});

test("Standard preview cannot recolour an account without confirmed entitlement", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "standard" });
  assert.equal((html.match(/data-plan-tier="standard"/g) ?? []).length, 0);
  assert.doesNotMatch(html, /data-profile-tier=|data-profile-active-plan=/);
  assert.match(html, /Real Owner/);
  assert.match(html, /Ver planos/);
  assert.doesNotMatch(html, /data-plan-preview=/);
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.match(css, /\.header\[data-plan-preview="standard"\].+--plan-preview-rgb: 65,139,226/);
});

test("Standard preview leaves unconfirmed account unchanged and offers remain in exploration", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, planPreview: "standard" });
  assert.doesNotMatch(html, /data-plan-offer=|data-account-plan-card/);
  assert.match(html, /data-plan-state="active"/);
  assert.match(html, /Ver planos/);
  const offers = renderPlanGallery("pt-BR", await loadCopy());
  assert.match(offers, /data-plan-offer="standard"/);
  assert.match(offers, /€49,90\/temporada/);
  assert.match(offers, /disabled=""[^>]*>Contratar plano/);
  assert.doesNotMatch(html, /checkout|stripe|walletBalance|amountMinor/);
});

test("confirmed Master presents its approved seasonal offer without enabling payment", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, activePlanKey: "master" });
  assert.match(html, /data-plan-offer="master"/);
  assert.match(html, /data-plan-state="active"/);
  assert.match(html, /data-plan-budget="master"[\s\S]*>1\.5B<\/strong>/);
  const offers = renderPlanGallery("pt-BR", await loadCopy(), "master");
  assert.match(offers, /€89,90\/temporada/);
  assert.match(offers, /data-current-plan-badge="master"/);
  assert.doesNotMatch(html, /checkout|stripe|walletBalance|amountMinor/);
});

test("confirmed Standard renders one compact member pass without inline exploration", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "pro", plan: { active: true, expiresAt: null }, activePlanKey: "standard" });
  assert.match(html, /data-plan-offer="standard"/);
  assert.match(html, /data-plan-state="active"/);
  assert.match(html, /data-compact="true"/);
  assert.doesNotMatch(html, /class="cardOwner"|class="cardKicker"/);
  assert.match(html, /Real Owner/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /Ver planos/);
  assert.match(readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8"), /\.memberCard \{[^}]+border-radius: 18px/);
});

test("membership exploration retains eight languages while account preview stays inert", async () => {
  const copyModule = await loadCopy();
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const copy = copyModule.getTouchlineClubOwnerMarketCopy(code, true);
    const html = renderHeader({ name: "Sample Owner", avatarUrl: "", city: "", nationality: "", since: "" }, code, copyModule,
      { planPreview: "standard", remainingMarketPower: 121_000_000, draftLocalesEnabled: true });
    assert.doesNotMatch(html, /data-plan-preview=|data-plan-offer=/);
    const offers = renderPlanGallery(code, copyModule);
    assert.ok(offers.includes(copy.planStandardPrice));
    assert.ok(offers.includes(planShowcase.getClubOwnerPlanShowcaseCopy(code, true).browse));
    assert.equal((offers.match(/data-plan-offer=/g) ?? []).length, 4);
    assert.match(html, /Sample Owner/);
    assert.match(html, /data-plan-state="inactive"/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.doesNotMatch(html, /Luiz Lopes|checkout|stripe/);
  }
  for (const planPreview of [null, "standard"]) {
    const html = renderHeader(null, "pt-BR", copyModule, { planPreview });
    assert.doesNotMatch(html, /data-plan-preview="pro"|MEMBRO PRO|ACESSO PRO/);
  }
  const css = readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.png|\.webp|url\(/);
  assert.match(css, /\.marketPowerValue strong \{[^}]+animation: none/);
});

test("existing live account metrics and market clock remain attached to canonical state", () => {
  assert.match(stage, /data-market-owner-metrics="true"/);
  assert.doesNotMatch(stage, /marketMetricsCopy\.remainingBudget/);
  assert.match(stage, /live\?\.gameweekScore \?\? snapshot.gameweekScore/);
  assert.match(stage, /live\?\.seasonScore \?\? snapshot.seasonScore/);
  assert.match(stage, /resolveTouchlineFantasyMarketClock\(gameweeks, nowMs\)/);
  assert.match(stage, /marketStatus=\{marketPage \? marketStatusLabel : undefined\}/);
  assert.match(stage, /data-market-state=\{activeGameweek\?\.state \?\? "unknown"\}/);
});

test("photo editing is not falsely presented as persisted before upload capability exists", () => {
  assert.match(header, /owner\?\.avatarUrl/);
  assert.match(header, /disabled aria-describedby="clubowner-photo-status"/);
  assert.doesNotMatch(header, /FileReader|URL.createObjectURL|type="file"|saved|success/i);
});

type Owner = { name: string; avatarUrl: string; city: string; nationality: string; since: string };
// Render the real exploration component separately: SSR proves copy and closed
// payment controls, not dialog focus/Escape (covered by the mounted onboarding tests).
function renderPlanGallery(locale: string, copyModule: Record<string, unknown>, activePlanKey: string | null = null) {
  return renderHeader(null, locale, copyModule, { fixtureGallery: true, activePlanKey, draftLocalesEnabled: true });
}
function renderHeader(owner: Owner | null, locale: string, copyModule: Record<string, unknown>, extraProps = {}, control?: (props: Record<string, unknown>) => unknown, collection: acquisition.ClubAcquisitionState | null = null, initialBudget: {plan:"vip";balanceEur:number}|null = null, verificationStatus: "pending" | "confirmed" | "unavailable" = collection || initialBudget ? "confirmed" : "pending") {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const output = ts.transpileModule(header, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} as { default?: unknown } };
  const requireView = (name: string) => {
    if (name === "./market/TouchlineMarketMarks") {
      const source = readFileSync(new URL("../components/touchline/market/TouchlineMarketMarks.tsx", import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
      const marks = { exports: {} };
      runInNewContext(compiled, { exports: marks.exports, module: marks, require });
      return marks.exports;
    }
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "next/image") return function FixtureImage({ unoptimized: _unoptimized, ...props }: Record<string, unknown>) { return React.createElement("img", props); };
    if (name === "next/link") return function FixtureLink(props: Record<string, unknown>) { return React.createElement("a", props); };
    if (name === "@/lib/touchlineArena/club-owner-market-i18n") return copyModule;
    if (name === "@/lib/touchlineArena/club-owner-profile-metrics") return profileMetrics;
    if (name === "@/lib/touchlineArena/club-owner-plan-showcase") return planShowcase;
    if (name === "@/lib/touchlineFantasy/club-acquisition") return acquisition;
    if (name === "@/lib/touchlineFantasy/market-budget-i18n") return marketBudgetCopy;
    if (name === "@/lib/stripe/club-season-checkout-client") return checkoutClient;
    if (name === "@/lib/touchlineArena/catalogue-locale") return catalogueLocale;
    if (name === "./fantasy/ClubCollectionContext") return { useConfirmedClubCollection: () => ({ state: collection, initialBudget, verificationStatus }) };
    if (name === "./ClubOwnerPlanShowcase" || name === "./ClubOwnerPlanOnboarding" || name === "./TouchlineClubPerimeterTrace") {
      const source = readFileSync(new URL(`../components/touchline/${name.slice(2)}.tsx`, import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
      const showcase = { exports: {} };
      runInNewContext(compiled, { exports: showcase.exports, module: showcase, require: requireView });
      return showcase.exports;
    }
    if (name === "./ClubOwnerAvatarControl") return { __esModule: true, default: control ?? (() => { throw Error("OFF must not render recovery"); }) };
    return require(name);
  };
  runInNewContext(output, { exports: loaded.exports, module: loaded, require: requireView });
  if ("fixtureGallery" in extraProps) {
    const { fixtureGallery: _fixtureGallery, ...props } = extraProps;
    const gallery = requireView("./ClubOwnerPlanOnboarding") as { default: unknown };
    return renderToStaticMarkup(React.createElement(gallery.default, { ...props, locale, open: true, onDismiss: () => {} })) as string;
  }
  return renderToStaticMarkup(React.createElement(loaded.exports.default, { owner, locale, ...extraProps })) as string;
}

// Real React DOM + native dialog, isolated from accounts and external services.
// The unit harnesses cover catalogue semantics; these cases add actual keyboard,
// top-layer, responsive layout and focus integration across header and onboarding.
function interactiveHeaderFixture(locale: string, active: boolean) {
  const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, ".."), ts = require("typescript");
  const react = dirname(require.resolve("react")), dom = dirname(require.resolve("react-dom/client"));
  const scheduler = dirname(createRequire(require.resolve("react-dom/client")).resolve("scheduler"));
  const modules: Record<string, string> = {
    react: readFileSync(join(react, "cjs/react.development.js"), "utf8"),
    "react/jsx-runtime": readFileSync(join(react, "cjs/react-jsx-runtime.development.js"), "utf8"),
    "react-dom": readFileSync(join(dom, "cjs/react-dom.development.js"), "utf8"),
    "react-dom/client": readFileSync(join(dom, "cjs/react-dom-client.development.js"), "utf8"),
    scheduler: readFileSync(join(scheduler, "cjs/scheduler.development.js"), "utf8"),
    "lucide-react": readFileSync(require.resolve("lucide-react"), "utf8"),
    "next/image": "exports.default=({unoptimized,...props})=>require('react').createElement('img',props);",
    [join(root, "components/touchline/ClubOwnerAvatarControl.tsx")]: "exports.default=()=>{throw Error('Avatar recovery is outside fixture scope')};",
    [join(root, "components/touchline/fantasy/ClubCollectionContext.tsx")]: "exports.useConfirmedClubCollection=()=>({state:null,initialBudget:null,verificationStatus:'confirmed'});",
  };
  const stylesheets: string[] = [];
  function bundle(path: string): string {
    if (path in modules) return path;
    if (path.endsWith(".css")) {
      // Reuse Next's installed CSS module pipeline, as the showcase browser
      // fixture does. Unscoped CSS would collide (header/dialog/header).
      const nextRequire = createRequire(require.resolve("next/package.json"));
      const { getModulesPlugins } = nextRequire("next/dist/build/webpack/loaders/css-loader/src/utils");
      const { getCssModuleLocalIdent } = nextRequire("next/dist/build/webpack/config/blocks/css/loaders/getCssModuleLocalIdent");
      const plugins = getModulesPlugins({ modules: { mode: "pure", getLocalIdent: getCssModuleLocalIdent,
        localIdentName: "[hash:base64]", localIdentContext: root, localIdentHashPrefix: "", exportGlobals: false } },
        { rootContext: root, resourcePath: path, emitError: (error: Error) => { throw error; } });
      const result = nextRequire("postcss")(plugins).process(readFileSync(path, "utf8"), { from: path, map: false }).sync();
      const { icssImports, icssExports } = nextRequire("next/dist/compiled/icss-utils").extractICSS(result.root);
      assert.deepEqual(icssImports, {});
      stylesheets.push(result.root.toString());
      modules[path] = `exports.default=${JSON.stringify(icssExports)};`;
      return path;
    }
    modules[path] = "";
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    modules[path] = code.replace(/require\("([^"]+)"\)/g, (all: string, id: string) => {
      if (!id.startsWith(".") && !id.startsWith("@/")) return all;
      let target = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(path), id);
      if (!/\.(ts|tsx|css)$/.test(target)) target += existsSync(`${target}.ts`) ? ".ts" : ".tsx";
      return `require(${JSON.stringify(bundle(target))})`;
    });
    return path;
  }
  const entry = bundle(join(root, "components/touchline/ClubOwnerMarketHeader.tsx"));
  const definitions = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  const props = { owner: { name: "Sample Owner", avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", city: "", nationality: "", since: "" },
    locale, draftLocalesEnabled: true, planPreview: "pro", remainingMarketPower: 121_000_000,
    plan: active ? { active: true, expiresAt: null } : null, activePlanKey: active ? "standard" : null };
  return `<!doctype html><html dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><meta charset="utf-8">
    <style>*{box-sizing:border-box}body{margin:0;background:#07100b;color:white;padding:16px;font-family:Arial,sans-serif}${stylesheets.join("\n")}</style>
    <div id="root"></div><script>const process={env:{NODE_ENV:"development"}},modules={${definitions}},cache={};
    function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error("Unbundled module: "+id);
      const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
    require("react-dom/client").createRoot(document.getElementById("root")).render(
      require("react").createElement(require(${JSON.stringify(entry)}).default,${JSON.stringify(props)}));</script></html>`;
}

if (process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1") test("active card and balance survive real modal exploration on desktop and phone", async () => {
  const { chromium, expect } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 844, 390]) for (const locale of ["pt-BR", "ar-SA"]) {
      const page = await browser.newPage({ viewport: { width, height: width === 844 ? 390 : 900 }, reducedMotion: "reduce" });
      const errors: string[] = [], requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
      await page.setContent(interactiveHeaderFixture(locale, true));
      const trigger = page.locator('button[aria-haspopup="dialog"]');
      await expect(trigger).toBeVisible();
      const card = page.locator('[data-account-plan-card]'), balance = page.locator('[data-account-market-power]');
      const before = await card.innerHTML(), cash = await balance.textContent();
      await expect(card.locator('[data-plan-offer="standard"]')).toHaveCount(1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await trigger.focus(); await page.keyboard.press("Enter");
      const dialog = page.locator('dialog[data-plan-onboarding]');
      await expect(dialog).toBeVisible();
      assert.equal(await dialog.evaluate(el => el.matches(":modal")), true);
      await expect(dialog.locator('h2')).toBeFocused();
      await expect(dialog.locator('[data-plan-gallery] [data-plan-offer]')).toHaveCount(4);
      const vip = dialog.locator('article[data-plan-preview="vip"]');
      // The second enabled action is the real benefits entry (the first is the card).
      await vip.locator('button:not([disabled])').nth(1).click();
      await expect(dialog.locator('[data-plan-detail="vip"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      assert.equal(await card.innerHTML(), before); assert.equal(await balance.textContent(), cash);
      await trigger.click(); await expect(dialog.locator('[data-plan-gallery]')).toBeVisible();
      const labels = planShowcase.getClubOwnerPlanShowcaseCopy(locale, true);
      await dialog.getByRole("button", { name: labels.close, exact: true }).click();
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      assert.equal(await card.innerHTML(), before); assert.equal(await balance.textContent(), cash);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

if (process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1") test("inactive account opens one real gallery without inventing entitlement or payment", async () => {
  const { chromium, expect } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [], requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
      await page.setContent(interactiveHeaderFixture("pt-BR", false));
      const trigger = page.getByRole("button", { name: "Ver planos", exact: true });
      await expect(trigger).toBeVisible();
      await expect(page.locator('[data-account-plan-card]')).toHaveCount(0);
      await expect(page.locator('[data-plan-offer]')).toHaveCount(0);
      const bank = page.locator('[data-plan-state="inactive"]');
      const geometry = await bank.evaluate(el => {
        const heading = el.querySelector("h2")!;
        const row = heading.parentElement!;
        const button = row.querySelector("button")!;
        const rect = (node: Element) => {
          const bounds = node.getBoundingClientRect(), css = getComputedStyle(node);
          return { top: bounds.top, height: bounds.height, width: bounds.width,
            paddingTop: parseFloat(css.paddingTop), borderTop: parseFloat(css.borderTopWidth),
            alignItems: css.alignItems, minHeight: css.minHeight };
        };
        return { bank: rect(el), row: rect(row), heading: rect(heading), button: rect(button) };
      });
      const geometryMessage = JSON.stringify({ width, geometry });
      // The row starts at the content edge; its title is vertically centered
      // beside the 44px action, not itself anchored to the panel padding.
      assert.ok(Math.abs(geometry.row.top - geometry.bank.top - geometry.bank.borderTop - geometry.bank.paddingTop) <= 1, geometryMessage);
      assert.equal(geometry.row.alignItems, "center", geometryMessage);
      assert.ok(Math.abs(geometry.heading.top + geometry.heading.height / 2 - geometry.row.top - geometry.row.height / 2) <= 1, geometryMessage);
      assert.ok(geometry.button.height >= 44, geometryMessage);
      const cash = await page.locator('[data-account-market-power]').textContent();
      await trigger.focus(); await page.keyboard.press("Enter");
      const dialog = page.locator('dialog[data-plan-onboarding]');
      await expect(dialog).toBeVisible(); await expect(page.locator("dialog")).toHaveCount(1);
      await expect(dialog.locator('[data-plan-offer]')).toHaveCount(4);
      await expect(dialog.locator('[data-current-plan]')).toHaveCount(0);
      const subscriptions = dialog.getByRole("button", { name: "Contratar plano", exact: true });
      await expect(subscriptions).toHaveCount(4);
      for (const button of await subscriptions.all()) await expect(button).toBeDisabled();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const rect = (await dialog.boundingBox())!;
      assert.ok(rect.x >= -1 && rect.width <= width + 1);
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      await expect(page.locator('[data-account-plan-card]')).toHaveCount(0);
      assert.equal(await page.locator('[data-account-market-power]').textContent(), cash);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("C3 server header forwards only sanitized recovery props while plan and identity remain server-rendered", async () => {
  const copy = await loadCopy(), props: Record<string, unknown>[] = [], React = createRequire(import.meta.url)("react");
  const accountId = "11111111-1111-4111-8111-111111111111";
  const avatarContext = { accountId, revision: "0", avatarUrl: null, generation: "0", activeOperationId: null, fencedThroughGeneration: "-1",
    operationId: null, operationState: null, committedRevision: null, uploadAllowed: true, canUpload: false, readyForSelection: false };
  const owner = { name: "Real Owner & Co", avatarUrl: "/actual-owner.webp", city: "Valletta", nationality: "Malta", since: "2024" };
  const html = renderHeader(owner, "pt-BR", copy, { accountId, avatarContext }, input => { props.push(input); return React.createElement("div", { "data-recovery-child": "true" }, input.children); });
  assert.equal(props.length, 1); assert.deepEqual(Object.keys(props[0]).sort(), ["accountId", "avatarSelectionEnabled", "children", "context", "draftLocalesEnabled", "locale", "retentionReady"]);
  assert.equal(props[0].avatarSelectionEnabled, false);
  assert.equal(props[0].retentionReady, false);
  assert.equal(props[0].draftLocalesEnabled, false);
  assert.equal(props[0].accountId, accountId); assert.equal(props[0].context, avatarContext); assert.equal(props[0].locale, "pt-BR");
  assert.match(html, /Real Owner &amp; Co/); assert.match(html, /src="\/actual-owner.webp"/); assert.match(html, /data-plan-state="inactive"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 0); assert.match(header, /"use client"/);
  for (const change of [{ accountId: "other" }, { avatarContext: { ...avatarContext, uploadAllowed: false } }, { owner: null }]) {
    const off = renderHeader(owner, "pt-BR", copy, { accountId, avatarContext, ...change }); assert.match(off, /disabled=""[^>]*aria-describedby="clubowner-photo-status"/);
  }
});

test("server-rendered header exposes real identity, exact EN/PT labels and disabled future controls", async () => {
  const copyModule = await loadCopy();
  const owner = { name: "Real Owner & Co", avatarUrl: "/actual-owner.webp", city: "Valletta", nationality: "Malta", since: "2024" };
  for (const locale of ["pt-BR", "en-GB"] as const) {
    const html = renderHeader(owner, locale, copyModule);
    assert.match(html, /<h1>ClubOwner<\/h1>/);
    assert.match(html, /Real Owner &amp; Co/);
    assert.match(html, /src="\/actual-owner.webp"/);
    assert.doesNotMatch(html, /Valletta|2024/);
    assert.match(html, locale === "pt-BR" ? />Meu plano<\/h2>/ : />My plan<\/h2>/);
    for (const key of ["photoAria", "photoUnavailable", "yourProfile", "plan", "marketPowerUnavailable", "planActionUnavailable"] as const) assert.ok(html.includes(baseline[locale][key]), key);
    for (const key of ["proMember", "proAccess", "proPrivileges"] as const) assert.ok(!html.includes(baseline[locale][key]));
    assert.doesNotMatch(html, /href="\/intro/);
    assert.doesNotMatch(page, /\/intro\?/);
    assert.match(page, /navigationAccessory=\{<TouchlineSignOutButton compact locale=\{locale\} draftLocalesEnabled=\{draftLocalesEnabled\} \/>\}/);
    assert.ok(html.includes(`aria-label="${baseline[locale].photoAria}"`));
    assert.ok(html.includes('id="clubowner-photo-status" role="status"'), `${locale}: disabled photo has visible status`);
    assert.match(html, /aria-describedby="clubowner-photo-status"/);
    assert.match(html, /id="clubowner-photo-status"/);
    assert.doesNotMatch(html, /role="tablist"|data-plan-onboarding/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /data-plan-state="inactive"/);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
    assert.doesNotMatch(html, /type="file"|Luiz Lopez/);
    assert.doesNotMatch(html, /data-plan-preview=|data-plan-offer=/, "an unconfirmed account must not invent Beta");
  }
});

test("missing owner and empty facts remain honest fallbacks without invented account data", async () => {
  const copyModule = await loadCopy();
  for (const locale of ["pt-BR", "en-GB"] as const) for (const owner of [null, { name: '', avatarUrl: '', city: '', nationality: '', since: '' }]) {
    const html = renderHeader(owner, locale, copyModule);
    assert.match(html, new RegExp(`<h2 id="clubowner-heading">${baseline[locale].nameUnavailable}`));
    assert.ok(html.includes(`alt="${baseline[locale].nameUnavailable}"`));
    assert.match(html, /src="\/icons\/touchline-512.png"/);
    assert.equal((html.match(/<dd[^>]*>—<\/dd>/g) ?? []).length, 2);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  }
});

test("actual rendered header and plan catalogue use the same selected locale", () => {
  const calls: string[] = [];
  const markerCopy = Object.fromEntries(Object.keys(baseline['en-GB']).map(key => [key, `copy-${key}`]));
  const html = renderHeader(null, 'pt-BR', { getTouchlineClubOwnerMarketCopy: (locale: string) => { calls.push(locale); return markerCopy; } }, { plan: { active: true, expiresAt: null }, activePlanKey: "standard" });
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(locale => locale === 'pt-BR'));
  for (const key of ["nameUnavailable", "photoAria", "photoUnavailable", "yourProfile", "plan", "marketPowerUnavailable", "planStandard", "planActive"]) assert.ok(html.includes(markerCopy[key]), key);
  for (const key of ["proMember", "proAccess", "proPrivileges"]) assert.ok(!html.includes(markerCopy[key]));
  assert.match(html, /<div class="title"><h1>ClubOwner<\/h1><\/div>/);
  assert.doesNotMatch(html, /<span>TOUCHLINE<\/span>/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
});

test("verified active VIP has its real name and finite amethyst card without opening purchase", async () => {
  const html = renderHeader({ name: "Customer", avatarUrl: "", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), {
    plan: { active: true, expiresAt: null }, activePlanKey: "vip", activePlanBudget: 1_000_000_000, remainingMarketPower: 621_000_000,
  });
  assert.match(html, /data-active-plan="vip"/);
  assert.match(html, /data-plan-preview="vip"/);
  assert.match(html, /data-current-plan="true"/);
  assert.match(html, /data-plan-state="active"/);
  assert.match(html, /data-plan-budget="vip"[\s\S]*3\.000\.000\.000 TouchLine Credits/);
  assert.match(html, /data-plan-budget="vip"[\s\S]*>3B<\/strong>/);
  assert.doesNotMatch(html, /<td>|role="tablist"/);
  assert.doesNotMatch(html, /data-current-xi-unlimited|>∞/);
  const budgetMarkup = html.match(/<span[^>]*data-plan-budget="vip"[\s\S]*?<\/strong>/)?.[0];
  assert.ok(budgetMarkup);
  assert.doesNotMatch(budgetMarkup, /Ilimitado|Unlimited|∞/);
  assert.doesNotMatch(html, />Renovar<\/button>/);
  assert.equal((html.match(/data-current-plan="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /checkout|stripe|type="file"/);
});

test("confirmed initial and spent balances render exact amounts independently of the plan preview", async () => {
  const props={collectionEnabled:true,plan:{active:true,expiresAt:null},activePlanKey:"vip",activePlanBudget:1_000_000_000};
  const budget={plan:"vip" as const,balanceEur:1_200_000_000};
  const copy=await loadCopy();
  const empty=renderHeader(null,"en-GB",copy,props,undefined,null,budget);
  assert.match(empty,/data-account-market-power="true"[\s\S]*1,200,000,000/);
  const state:acquisition.ClubAcquisitionState={revision:0,seasonId:"season",plan:"vip",coach:{id:"coach",tier:"ruby-red",valueEur:5_000_000},balanceEur:1_195_000_000,players:[],receipts:[]};
  const hired=renderHeader(null,"en-GB",copy,props,undefined,state,budget);
  assert.match(hired,/data-account-market-power="true"[\s\S]*1,195,000,000/);
  const zero=renderHeader(null,"en-GB",copy,props,undefined,{...state,balanceEur:0},budget);
  assert.match(zero,/data-account-market-power="true"[\s\S]*>0<\/strong>/);
  const unknown=renderHeader(null,"en-GB",copy,props);
  assert.match(unknown,/Market power unavailable/);
});

test("paid plan validity and available budget remain visible outside the plan dialog", async () => {
  const html = renderHeader(null, "en-GB", await loadCopy(), {
    plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, activePlanKey: "standard", remainingMarketPower: 121_000_000,
  });
  assert.match(html, /data-plan-validity="true">Valid until 8 Nov 2026/);
  assert.match(html, /data-account-market-power="true"[\s\S]*121,000,000/);
  assert.equal((html.match(/<h2[^>]*>My plan/g) ?? []).length, 1);
  const seasonalVip = renderHeader(null, "en-GB", await loadCopy(), {
    plan: { active: true, expiresAt: "2026-11-08" }, activePlanKey: "vip",
  });
  assert.match(seasonalVip, /data-plan-validity="true">Valid until 8 Nov 2026/);
  for (const [activePlanKey, expiresAt] of [["vip", null], ["vip", "invalid"], ["standard", "invalid"]]) {
    const invalid = renderHeader(null, "en-GB", await loadCopy(), { plan: { active: true, expiresAt }, activePlanKey });
    assert.doesNotMatch(invalid, /data-plan-validity=/);
  }
});

test("an account without a plan stays unassigned while exploration offers exactly four plans", async () => {
  const html = renderHeader(null, "pt-BR", await loadCopy(), { plan: null });
  assert.equal((html.match(/data-plan-offer=/g) ?? []).length, 0);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 0);
  assert.match(html, /Ver planos/);
  const offers = renderPlanGallery("pt-BR", await loadCopy());
  assert.deepEqual([...offers.matchAll(/data-plan-offer="([^"]+)"/g)].map(match => match[1]), ["beta", "standard", "master", "vip"]);
  assert.equal((offers.match(/>Contratar plano<\/button>/g) ?? []).length, 4);
  assert.equal((offers.match(/disabled=""/g) ?? []).length, 4);
  assert.doesNotMatch(html, /data-plan-choice=/);
  assert.doesNotMatch(html, /data-current-plan="true"/);
});

test("profile preserves identity with ranking and followers only across eight locales", async () => {
  assert.equal(profileMetrics.getClubOwnerProfileMetricsCopy("pt-BR").ranking, "Ranking");
  assert.equal(profileMetrics.getClubOwnerProfileMetricsCopy("en-GB").ranking, "Ranking");
  const owner = { name: "Real Owner", avatarUrl: "/actual-owner.webp", city: "Old city", nationality: "Old nation", since: "1900" };
  assert.equal(profileMetrics.clubOwnerRankingPosition([{ isCurrentManager: false, rank: 1 }, { isCurrentManager: true, rank: 7 }]), 7);
  for (const rank of [0, -1, 1.2, NaN]) assert.equal(profileMetrics.clubOwnerRankingPosition([{ isCurrentManager: true, rank }]), null);
  assert.equal(profileMetrics.clubOwnerRankingPosition([]), null);
  assert.doesNotMatch(page, /clubOwnerRankingPoints|rankingPoints=/);
  assert.match(page, /rankingPosition=\{clubOwnerRankingPosition\(snapshot\?\.seasonRanking\)\}/);
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const labels = profileMetrics.getClubOwnerProfileMetricsCopy(code, true);
    const html = renderHeader(owner, code, await loadCopy(), { rankingPosition: 7, draftLocalesEnabled: true });
    for (const label of [labels.followers, labels.ranking]) assert.ok(html.includes(label));
    assert.doesNotMatch(html, new RegExp(labels.points.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const facts = html.match(/<dl class="facts">([\s\S]*?)<\/dl>/)?.[1] ?? "";
    assert.ok(facts.indexOf(labels.ranking) >= 0);
    assert.ok(facts.indexOf(labels.followers) > facts.indexOf(labels.ranking));
    assert.doesNotMatch(html, /class="followers"/);
    assert.match(html, /class="photoStatus" id="clubowner-photo-status" role="status"/);
    const expectedRank = { "en-GB": "7th", "pt-BR": "7º", "es-ES": "7.º", "it-IT": "7º", "fr-FR": "7e", "ar-SA": "المركز ٧", "tr-TR": "7.", "de-DE": "7." }[code];
    assert.ok(html.includes(`<dd>${expectedRank}</dd>`));
    assert.ok(!html.includes(`<dt>${labels.following}</dt>`));
    assert.match(html, /Real Owner/);
    assert.doesNotMatch(html, /Old city|Old nation|1900|999/);
    assert.equal((html.match(/<dd[^>]*>—<\/dd>/g) ?? []).length, 1, "unknown followers are not fabricated zeros");
  }
});

test("ranking placement uses ordinal notation without changing the numeric rank", () => {
  for (const [rank, expected] of [[1, "1º"], [2, "2º"], [11, "11º"]] as const) {
    assert.equal(profileMetrics.formatClubOwnerRankingPosition(rank, "pt-BR"), expected);
  }
  for (const [rank, expected] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"]] as const) {
    assert.equal(profileMetrics.formatClubOwnerRankingPosition(rank, "en-GB"), expected);
  }
});

test("header catalogues cover exact8locale vocabulary and preserve EN/PT while six stay draft", async () => {
  const mod = await loadCopy();
  const codes = ['en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'];
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_STATUS, 'draft');
  for (const locale of ['en-GB', 'pt-BR'] as const) assert.deepEqual(mod.getTouchlineClubOwnerMarketCopy(locale), baseline[locale]);
  for (const [locale, copy] of Object.entries(mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES)) {
    assert.deepEqual(Object.keys(copy), Object.keys(baseline['en-GB']));
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]/);
      if (!['planStandardPrice', 'planProPrice'].includes(key)) assert.doesNotMatch(value, /€|£|\b(?:GBP|BRL|0 TC)\b|9[,.]99/);
    }
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(mod.getTouchlineClubOwnerMarketCopy(locale), mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES['en-GB']);
      for (const key of ['photoUnavailable', 'planInactiveDetail', 'virtualBudgetSeparate'] as const) assert.notEqual(copy[key], baseline['en-GB'][key]);
      const html = renderHeader(null, locale, mod);
      assert.doesNotMatch(html, /role="tablist"|data-plan-offer=/);
      assert.match(html, />View plans</);
      assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
    }
  }
  for (const locale of [undefined, null, '', 'invalid']) assert.equal(mod.getTouchlineClubOwnerMarketCopy(locale), mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES['en-GB']);
});
