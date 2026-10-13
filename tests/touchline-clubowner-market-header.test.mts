import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import * as profileMetrics from "../lib/touchlineArena/club-owner-profile-metrics.ts";
import * as planShowcase from "../lib/touchlineArena/club-owner-plan-showcase.ts";

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
    planUntil: "Valid until {date}", planActiveNoEnd: "Your plan is active.", planInactiveDetail: "Activate a plan to manage your XI.", planStandardPrice: "€49.90/year", planStandardBenefit: "Full access to the game and rankings.", planProPrice: "€89.90/year", planProBenefit: "Premium visual, history, reports and alerts.",
    planActionUnavailable: "Plan activation and renewal are not available yet.", virtualBudgetSeparate: "Your XI budget remains separate from your plan.",
  },
  "pt-BR": {
    nameUnavailable: "Nome não disponível", photoAria: "Alterar foto do perfil — indisponível", photoUnavailable: "Alteração de foto ainda indisponível",
    yourProfile: "SEU PERFIL", location: "Localização", nationality: "Nacionalidade", memberSince: "Membro desde", watchIntro: "Ver intro",
    plan: "Meu plano", planStandard: "Standard", planPro: "PRO", planActive: "ATIVO", planInactive: "NÃO ATIVO", marketPower: "Poder de mercado", marketPowerUnavailable: "Poder de mercado indisponível", activatePlan: "Ativar plano", renewPlan: "Renovar", proMember: "MEMBRO PRO", proAccess: "ACESSO PRO", proPrivileges: "Benefícios exclusivos do membro",
    planUntil: "Válido até {date}", planActiveNoEnd: "Seu plano está ativo.", planInactiveDetail: "Ative um plano para gerenciar seu XI.", planStandardPrice: "€49,90/ano", planStandardBenefit: "Acesso completo ao jogo e ao ranking.", planProPrice: "€89,90/ano", planProBenefit: "Visual premium, histórico, relatórios e alertas.",
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
  assert.match(stage, /data-market-heading="status">\s*<MarketWindowClock/);
  assert.doesNotMatch(stage, /<h2>\{workflowCopy\.market\}<\/h2>/);
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("en-GB").market, "Market");
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("pt-BR").market, "Mercado");
});

test("the plan is explicit, uses entitlement state and has no invented payment or balance", () => {
  assert.match(header, /data-plan-state=/);
  assert.match(header, /onPreviewChange=\{setVisualTier\}/);
  assert.doesNotMatch(header, /showAllPlans/);
  assert.doesNotMatch(header, /fetch\(|localStorage|checkout|stripe|walletBalance|amountMinor|£|€|\bGBP\b|\bBRL\b/);
});

test("the right-hand plan selector owns the premium interaction without an old gallery", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.match(header, /<ClubOwnerPlanShowcase/);
  assert.match(header, /className=\{styles\.bank\}/);
  assert.match(css, /\.profile::before, \.bank::before/);
  assert.match(css, /\.header\[data-plan-preview\] :is\(\.profile,\.bank\)/);
  assert.doesNotMatch(header, /styles\.(?:deposit|activatePlan)/);
});

test("market power stays inside the compact right-hand selector", async () => {
  const html = renderHeader(null, "pt-BR", await loadCopy(), { remainingMarketPower: 121_000_000 });
  assert.match(html, /Poder de mercado/);
  assert.match(html, /121\s*mi/);
  assert.match(html, /Moeda TouchLine TC/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/data-plan-offer=/g) ?? []).length, 1);
});

test("local Pro preview marks only the rendered sample, not the account entitlement", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "pro" });
  assert.match(html, /data-plan-tier="pro"/);
  assert.match(html, /class="header"/);
  assert.match(html, /Meu plano/);
  assert.match(html, /Real Owner/);
  assert.equal((html.match(/data-plan-tier="pro"/g) ?? []).length, 1);
  assert.match(html, /data-profile-tier="pro"/);
});

test("real active VIP displays localized unlimited market power; null and inactive never imply VIP", async () => {
  const copyModule = await loadCopy();
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const labels = planShowcase.getClubOwnerPlanShowcaseCopy(code, true);
    const real = { realUnlimited: true, remainingMarketPower: null, plan: { active: true, expiresAt: null }, draftLocalesEnabled: true };
    const html = renderHeader(null, code, copyModule, real);
    assert.match(html, /data-current-xi-unlimited="true"/);
    assert.ok(html.includes(`>∞ ${labels.unlimited}</dd>`));
    for (const planPreview of ["standard", "pro"]) {
      const preview = renderHeader(null, code, copyModule, { ...real, planPreview });
      assert.match(preview, /data-plan-state="inactive"/);
      assert.match(preview, /data-current-xi-unlimited="true"/);
      assert.ok(preview.includes(`>∞ ${labels.unlimited}</dd>`));
    }
    for (const patch of [{ realUnlimited: false }, { plan: { active: false, expiresAt: null } }, { plan: null }]) {
      const unknown = renderHeader(null, code, copyModule, { ...real, ...patch });
      assert.doesNotMatch(unknown, /data-current-xi-unlimited="true"/);
      assert.doesNotMatch(unknown, /data-current-xi-unlimited="true"/);
    }
  }
});

test("ClubOwner keeps the green sweep on panels and restores the metallic effect on Pro", () => {
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.proTier \.profile/);
  assert.match(css, /\.profile::after, \.bank::after/);
  assert.match(css, /animation: clubOwnerGreenSweep 9s linear infinite/);
  assert.match(css, /\.proBadge \{[^}]+animation: clubOwnerGoldSweep 7s linear infinite/);
  const marketPower = css.match(/\.marketPowerValue strong, \.marketPowerValue small \{([^}]+)\}/)?.[1] ?? "";
  assert.ok(marketPower.includes("color: #f0b631"));
  assert.ok(marketPower.includes("animation: none"));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.standardBadge \{[^}]+animation: none/);
});

test("local Standard preview uses the blue companion badge without changing entitlement", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "standard" });
  assert.equal((html.match(/data-plan-tier="standard"/g) ?? []).length, 1);
  assert.match(html, /data-profile-tier="standard"/);
  assert.match(html, /Standard/);
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  assert.match(css, /\.standardBadge \{[^}]+rgba\(117,187,255/);
});

test("local Standard preview presents its approved annual offer without enabling payment", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, planPreview: "standard" });
  assert.match(html, /data-plan-offer="standard"/);
  assert.match(html, /data-plan-state="inactive"/);
  assert.match(html, /€49,90\/ano/);
  assert.match(html, /Acesso completo ao jogo e ao ranking\./);
  assert.match(html, /Detalhes do plano/);
  assert.match(html, /Prévia do plano — sua assinatura não foi alterada\./);
  assert.doesNotMatch(html, /checkout|stripe|walletBalance|amountMinor/);
});

test("local Pro preview presents its approved annual offer without enabling payment", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, planPreview: "pro" });
  assert.match(html, /data-plan-offer="pro"/);
  assert.match(html, /data-plan-state="inactive"/);
  assert.match(html, /€89,90\/ano/);
  assert.match(html, /Visual premium, histórico, relatórios e alertas\./);
  assert.match(html, /Detalhes do plano/);
  assert.doesNotMatch(html, /checkout|stripe|walletBalance|amountMinor/);
});

test("local Pro preview renders a member pass without changing the account entitlement", async () => {
  const html = renderHeader({ name: "Real Owner", avatarUrl: "/owner.webp", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), { planPreview: "pro" });
  assert.match(html, /data-plan-offer="pro"/);
  assert.match(html, /Assinatura/);
  assert.match(html, /Real Owner/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /Comparar planos/);
  assert.match(readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8"), /\.memberCard \{[^}]+border-radius: 18px/);
});

test("membership design stays inside the local sample with eight languages and static gold budget", async () => {
  const copyModule = await loadCopy();
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const copy = copyModule.getTouchlineClubOwnerMarketCopy(code, true);
    const html = renderHeader({ name: "Sample Owner", avatarUrl: "", city: "", nationality: "", since: "" }, code, copyModule,
      { planPreview: "pro", remainingMarketPower: 121_000_000, draftLocalesEnabled: true });
    assert.match(html, /data-plan-preview="pro"/);
    for (const value of [copy.planProPrice, copy.planProBenefit, planShowcase.getClubOwnerPlanShowcaseCopy(code, true).preview]) assert.ok(html.includes(value));
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
function renderHeader(owner: Owner | null, locale: string, copyModule: Record<string, unknown>, extraProps = {}, control?: (props: Record<string, unknown>) => unknown) {
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
    if (name === "./ClubOwnerPlanShowcase" || name === "./TouchlineClubPerimeterTrace") {
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
  return renderToStaticMarkup(React.createElement(loaded.exports.default, { owner, locale, ...extraProps })) as string;
}

if (process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1") test("membership preview fits the existing profile on desktop and phone", async () => {
  const { chromium } = await import("@playwright/test");
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  const controls = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.module.css", import.meta.url), "utf8");
  const membershipCss = readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 844, 390]) for (const locale of ["pt-BR", "ar-SA"]) {
      const markup = renderHeader({ name: "Sample Owner", avatarUrl: "", city: "", nationality: "", since: "" }, locale, await loadCopy(),
        { planPreview: "pro", remainingMarketPower: 121_000_000, draftLocalesEnabled: true }).replace(/<link rel="preload"[^>]*>/g, "");
      const page = await browser.newPage({ viewport: { width, height: width === 844 ? 390 : 900 }, reducedMotion: "reduce" });
      await page.route("https://preview.invalid/**", route => route.fulfill({ status: 404, body: "" }));
      await page.setContent(`<html dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><base href="https://preview.invalid/"><style>body{margin:0;background:#07100b;color:#fff;padding:16px;font-family:Arial,sans-serif}*{box-sizing:border-box}${controls}${css}${membershipCss}</style></head><body>${markup}</body></html>`);
      const bank = page.locator('.bank .planShowcase[data-plan-preview="pro"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const box = (await bank.boundingBox())!;
      for (const selector of [".showcaseHeading", ".cardIdentity", ".offerSummary", ".marketPowerValue"]) {
        const rect = (await bank.locator(selector).boundingBox())!;
        assert.ok(rect.width > 0 && rect.x >= box.x && rect.x + rect.width <= box.x + box.width + 1, `${locale}/${width}: ${selector} stays in frame`);
      }
      assert.equal(await bank.locator(".planAction").isDisabled(), false);
      assert.equal(await bank.locator(".planAction").evaluate(el => getComputedStyle(el).animationName), "none");
      await bank.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await bank.locator("details").evaluate((el: HTMLDetailsElement) => el.open), true);
      await page.keyboard.press("Enter");
      assert.equal(await bank.locator("details").evaluate((el: HTMLDetailsElement) => el.open), false);
      if (locale === "pt-BR") await page.screenshot({ path: `/private/tmp/touchline-membership-profile-${width}.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});

if (process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1") test("inactive plan comparison opens with keyboard without duplicating the gallery", async () => {
  const { chromium } = await import("@playwright/test");
  const css = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.module.css", import.meta.url), "utf8");
  const planCss = readFileSync(new URL("../components/touchline/ClubOwnerPlanShowcase.module.css", import.meta.url), "utf8");
  const controls = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.module.css", import.meta.url), "utf8");
  const markup = renderHeader(null, "pt-BR", await loadCopy()).replace(/<link rel="preload"[^>]*>/g, "");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<style>body{margin:0;background:#07100b;color:#fff;padding:12px;box-sizing:border-box}*{box-sizing:border-box}${controls}${css}${planCss}</style>${markup}`);
      const details = page.locator('.bank .comparison');
      const planTopAligned = await page.locator('.bank[data-plan-state="inactive"]').evaluate((element: HTMLElement) => {
        const heading = element.querySelector("h2")!;
        return Math.abs(heading.getBoundingClientRect().top - element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).paddingTop)) < 8;
      });
      assert.equal(planTopAligned, true, "plan heading starts at the top padding, not vertically centered");
      assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), false);
      const compactHeight = (await details.boundingBox())?.height ?? 0;
      await page.screenshot({ path: `/private/tmp/touchline-clubowner-bank-closed-${width}.png`, fullPage: true });
      await details.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.evaluate((element: HTMLDetailsElement) => element.open), true);
      assert.equal(await page.locator('[data-plan-offer]').count(), 1);
      assert.equal(await page.locator('[data-current-plan]').count(), 0);
      assert.ok((await details.boundingBox())!.height > compactHeight + 30);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/private/tmp/touchline-clubowner-bank-${width}.png`, fullPage: true });
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
    for (const [key, value] of Object.entries(baseline[locale])) if (!["nameUnavailable", "location", "nationality", "memberSince", "watchIntro", "planStandard", "planPro", "planActive", "planInactive", "planUntil", "planActiveNoEnd", "planInactiveDetail", "activatePlan", "renewPlan", "planStandardPrice", "planStandardBenefit", "planProPrice", "planProBenefit", "proMember", "proAccess", "proPrivileges"].includes(key)) assert.ok(html.includes(value), key);
    for (const key of ["proMember", "proAccess", "proPrivileges"] as const) assert.ok(!html.includes(baseline[locale][key]));
    assert.doesNotMatch(html, /href="\/intro/);
    assert.doesNotMatch(page, /brandAccessory=|\/intro\?/);
    assert.ok(html.includes(`aria-label="${baseline[locale].photoAria}"`));
    assert.ok(html.includes('id="clubowner-photo-status" role="status"'), `${locale}: disabled photo has visible status`);
    assert.match(html, /aria-describedby="clubowner-photo-status"/);
    assert.match(html, /id="clubowner-photo-status"/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /data-plan-state="inactive"/);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
    assert.doesNotMatch(html, /type="file"|Luiz Lopez/);
    assert.match(html, /data-plan-preview="beta"/, "the compact selector starts on Beta outside development");
  }
});

test("missing owner and empty facts remain honest fallbacks without invented account data", async () => {
  const copyModule = await loadCopy();
  for (const locale of ["pt-BR", "en-GB"] as const) for (const owner of [null, { name: '', avatarUrl: '', city: '', nationality: '', since: '' }]) {
    const html = renderHeader(owner, locale, copyModule);
    assert.match(html, new RegExp(`<h2 id="clubowner-heading">${baseline[locale].nameUnavailable}`));
    assert.ok(html.includes(`alt="${baseline[locale].nameUnavailable}"`));
    assert.match(html, /src="\/icons\/touchline-512.png"/);
    assert.equal((html.match(/<dd[^>]*>—<\/dd>/g) ?? []).length, 3);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  }
});

test("actual rendered header and plan catalogue use the same selected locale", () => {
  const calls: string[] = [];
  const markerCopy = Object.fromEntries(Object.keys(baseline['en-GB']).map(key => [key, `copy-${key}`]));
  const html = renderHeader(null, 'pt-BR', { getTouchlineClubOwnerMarketCopy: (locale: string) => { calls.push(locale); return markerCopy; } });
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(locale => locale === 'pt-BR'));
  for (const [key, value] of Object.entries(markerCopy)) if (!["location", "nationality", "memberSince", "watchIntro", "planStandard", "planPro", "planActive", "planInactive", "planUntil", "planActiveNoEnd", "planInactiveDetail", "activatePlan", "renewPlan", "planStandardPrice", "planStandardBenefit", "planProPrice", "planProBenefit", "proMember", "proAccess", "proPrivileges"].includes(key)) assert.ok(html.includes(value), value);
  for (const key of ["proMember", "proAccess", "proPrivileges"]) assert.ok(!html.includes(markerCopy[key]));
  assert.match(html, /<div class="title"><h1>ClubOwner<\/h1><\/div>/);
  assert.doesNotMatch(html, /<span>TOUCHLINE<\/span>/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
});

test("verified active VIP has its real name and amethyst card without opening purchase", async () => {
  const html = renderHeader({ name: "Customer", avatarUrl: "", city: "", nationality: "", since: "" }, "pt-BR", await loadCopy(), {
    plan: { active: true, expiresAt: null }, activePlanKey: "vip", activePlanBudget: null, realUnlimited: true,
  });
  assert.match(html, /data-profile-active-plan="vip"[\s\S]*VIP<\/span>/);
  assert.match(html, /data-active-plan="vip"/);
  assert.match(html, /data-plan-preview="vip"/);
  assert.match(html, /data-current-plan="true"/);
  assert.match(html, /data-plan-state="active"/);
  assert.match(html, /data-current-xi-unlimited="true"/);
  assert.doesNotMatch(html, />Renovar<\/button>/);
  assert.equal((html.match(/data-current-plan="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /checkout|stripe|type="file"/);
});

test("paid plan validity and available budget remain visible outside the plan dialog", async () => {
  const html = renderHeader(null, "en-GB", await loadCopy(), {
    plan: { active: true, expiresAt: "2026-11-08T00:00:00.000Z" }, activePlanKey: "standard", remainingMarketPower: 121_000_000,
  });
  assert.match(html, /data-plan-validity="true">Valid until 8 Nov 2026/);
  assert.match(html, /data-account-market-power="true"[\s\S]*121m/);
  assert.equal((html.match(/<h2[^>]*>My plan/g) ?? []).length, 1);
  for (const [activePlanKey, expiresAt] of [["vip", "2026-11-08"], ["standard", "invalid"]]) {
    const invalid = renderHeader(null, "en-GB", await loadCopy(), { plan: { active: true, expiresAt }, activePlanKey });
    assert.doesNotMatch(invalid, /data-plan-validity=/);
  }
});

test("an account without a plan sees one compact Beta preview and five selector tabs", async () => {
  const html = renderHeader(null, "pt-BR", await loadCopy(), { plan: null });
  assert.match(html, /data-plan-offer="beta"/);
  assert.equal((html.match(/data-plan-offer=/g) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /data-plan-choice=/);
  assert.doesNotMatch(html, /data-current-plan="true"/);
});

test("profile metrics preserve identity and use only the viewer ranking across eight locales", async () => {
  assert.equal(profileMetrics.getClubOwnerProfileMetricsCopy("pt-BR").ranking, "Ranking");
  assert.equal(profileMetrics.getClubOwnerProfileMetricsCopy("en-GB").ranking, "Ranking");
  const owner = { name: "Real Owner", avatarUrl: "/actual-owner.webp", city: "Old city", nationality: "Old nation", since: "1900" };
  const score = profileMetrics.clubOwnerRankingPoints([{ isCurrentManager: false, score: 999 }, { isCurrentManager: true, score: 63.25 }]);
  assert.equal(score, 63.25);
  assert.equal(profileMetrics.clubOwnerRankingPosition([{ isCurrentManager: false, rank: 1 }, { isCurrentManager: true, rank: 7 }]), 7);
  for (const rank of [0, -1, 1.2, NaN]) assert.equal(profileMetrics.clubOwnerRankingPosition([{ isCurrentManager: true, rank }]), null);
  assert.equal(profileMetrics.clubOwnerRankingPosition([]), null);
  assert.equal(profileMetrics.clubOwnerRankingPoints([]), null);
  assert.equal(profileMetrics.clubOwnerRankingPoints([{ isCurrentManager: true, score: NaN }]), null);
  assert.equal(profileMetrics.clubOwnerRankingPoints([{ isCurrentManager: true, score: 0 }]), 0);
  assert.equal(profileMetrics.clubOwnerRankingPoints([{ isCurrentManager: true, score: 1 }, { isCurrentManager: true, score: 2 }]), null);
  assert.match(page, /rankingPoints=\{clubOwnerRankingPoints\(snapshot\?\.seasonRanking\)\}/);
  assert.match(page, /rankingPosition=\{clubOwnerRankingPosition\(snapshot\?\.seasonRanking\)\}/);
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    const labels = profileMetrics.getClubOwnerProfileMetricsCopy(code, true);
    const html = renderHeader(owner, code, await loadCopy(), { rankingPoints: score, rankingPosition: 7, draftLocalesEnabled: true });
    for (const label of [labels.points, labels.followers, labels.ranking]) assert.ok(html.includes(label));
    const facts = html.match(/<dl class="facts">([\s\S]*?)<\/dl>/)?.[1] ?? "";
    assert.ok(facts.indexOf(labels.points) >= 0);
    assert.ok(facts.indexOf(labels.ranking) > facts.indexOf(labels.points));
    assert.ok(facts.indexOf(labels.followers) > facts.indexOf(labels.ranking));
    assert.doesNotMatch(html, /class="followers"/);
    assert.match(html, /class="photoStatus" id="clubowner-photo-status" role="status"/);
    const expectedRank = { "en-GB": "7th", "pt-BR": "7º", "es-ES": "7.º", "it-IT": "7º", "fr-FR": "7e", "ar-SA": "المركز ٧", "tr-TR": "7.", "de-DE": "7." }[code];
    assert.ok(html.includes(`<dd>${expectedRank}</dd>`));
    assert.ok(!html.includes(`<dt>${labels.following}</dt>`));
    assert.ok(html.includes((63.25).toLocaleString(code, { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    assert.match(html, /Real Owner/);
    assert.doesNotMatch(html, /Old city|Old nation|1900|999/);
    assert.equal((html.match(/<dd[^>]*>—<\/dd>/g) ?? []).length, 1, "unknown social counts are not fabricated zeros");
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
      assert.match(html, /role="tablist"/);
      assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
    }
  }
  for (const locale of [undefined, null, '', 'invalid']) assert.equal(mod.getTouchlineClubOwnerMarketCopy(locale), mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES['en-GB']);
});
