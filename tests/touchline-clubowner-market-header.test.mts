import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
const stage = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const headerPath = new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url);
const header = existsSync(headerPath) ? readFileSync(headerPath, "utf8") : "";
const loadCopy = () => import("../lib/touchlineArena/club-owner-market-i18n.ts");
const baseline = {
  "en-GB": {
    nameUnavailable: "Name unavailable", photoAria: "Change profile photo — unavailable", photoUnavailable: "Photo updates are not available yet",
    yourProfile: "YOUR PROFILE", location: "Location", nationality: "Nationality", memberSince: "Member since", watchIntro: "Watch intro",
    bank: "Bank", inactive: "INACTIVE", credits: "TouchLine Credits",
    purchasesUnavailable: "Credit purchases are not available yet. No payment can be made in this area.", buyCredits: "Buy credits",
    notCreditBalance: "Your XI budget and points appear below. They are not a credit balance.",
  },
  "pt-BR": {
    nameUnavailable: "Nome não disponível", photoAria: "Alterar foto do perfil — indisponível", photoUnavailable: "Alteração de foto ainda indisponível",
    yourProfile: "SEU PERFIL", location: "Localização", nationality: "Nacionalidade", memberSince: "Membro desde", watchIntro: "Ver intro",
    bank: "Banco", inactive: "INATIVO", credits: "Créditos TouchLine",
    purchasesUnavailable: "A compra de créditos ainda não está disponível. Nenhum pagamento pode ser feito nesta área.", buyCredits: "Comprar créditos",
    notCreditBalance: "Seu orçamento do XI e seus pontos aparecem abaixo. Não são saldo de créditos.",
  },
};

test("the actual account owns the ClubOwner header, while Market labels only player selection", () => {
  assert.match(page, /<ClubOwnerMarketHeader/);
  assert.match(page, /clubOwner\?\.isAuthenticatedClubOwner \? clubOwner : null/);
  assert.match(header, /<h1>ClubOwner<\/h1>/);
  assert.match(header, /owner\?\.name/);
  assert.doesNotMatch(header, /PUBLIC_CLUB_OWNER|Luiz Lopez|localStorage/);
  assert.doesNotMatch(stage, /styles\.clubOwnerArea|data-market-club-owner-area/);
  assert.match(stage, /<h2>\{workflowCopy\.market\}<\/h2>/);
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("en-GB").market, "Market");
  assert.equal(getTouchlineFantasyMarketWorkflowCopy("pt-BR").market, "Mercado");
});

test("the bank is explicit, unavailable and has no invented payment or balance", () => {
  assert.match(header, /data-bank-state="inactive"/);
  assert.match(header, /disabled aria-describedby="clubowner-bank-status"/);
  assert.doesNotMatch(header, /fetch\(|localStorage|checkout|stripe|walletBalance|amountMinor|£|€|\bGBP\b|\bBRL\b/);
});

test("existing live account metrics and market clock remain attached to canonical state", () => {
  assert.match(stage, /data-market-owner-metrics="true"/);
  assert.match(stage, /validation\?\.budgetRemainingEur \?\? snapshot.config.budgetEur/);
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
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "next/image") return function FixtureImage({ unoptimized: _unoptimized, ...props }: Record<string, unknown>) { return React.createElement("img", props); };
    if (name === "next/link") return function FixtureLink(props: Record<string, unknown>) { return React.createElement("a", props); };
    if (name === "@/lib/touchlineArena/club-owner-market-i18n") return copyModule;
    if (name === "./ClubOwnerAvatarControl") return { __esModule: true, default: control ?? (() => { throw Error("OFF must not render recovery"); }) };
    return require(name);
  };
  runInNewContext(output, { exports: loaded.exports, module: loaded, require: requireView });
  return renderToStaticMarkup(React.createElement(loaded.exports.default, { owner, locale, ...extraProps })) as string;
}

test("C3 server header forwards only sanitized recovery props while Bank and identity remain server-rendered", async () => {
  const copy = await loadCopy(), props: Record<string, unknown>[] = [], React = createRequire(import.meta.url)("react");
  const accountId = "11111111-1111-4111-8111-111111111111";
  const avatarContext = { accountId, revision: "0", avatarUrl: null, generation: "0", activeOperationId: null, fencedThroughGeneration: "-1",
    operationId: null, operationState: null, committedRevision: null, uploadAllowed: true, canUpload: false, readyForSelection: false };
  const owner = { name: "Real Owner & Co", avatarUrl: "/actual-owner.webp", city: "Valletta", nationality: "Malta", since: "2024" };
  const html = renderHeader(owner, "pt-BR", copy, { accountId, avatarContext }, input => { props.push(input); return React.createElement("div", { "data-recovery-child": "true" }, input.children); });
  assert.equal(props.length, 1); assert.deepEqual(Object.keys(props[0]).sort(), ["accountId", "children", "context", "draftLocalesEnabled", "locale"]);
  assert.equal(props[0].draftLocalesEnabled, false);
  assert.equal(props[0].accountId, accountId); assert.equal(props[0].context, avatarContext); assert.equal(props[0].locale, "pt-BR");
  assert.match(html, /Real Owner &amp; Co/); assert.match(html, /src="\/actual-owner.webp"/); assert.match(html, /data-bank-state="inactive"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1); assert.doesNotMatch(header, /["']use client["']/);
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
    assert.match(html, /Valletta/);
    assert.match(html, /2024/);
    assert.match(html, locale === "pt-BR" ? />Banco<\/h2>/ : />Bank<\/h2>/);
    for (const [key, value] of Object.entries(baseline[locale])) if (key !== "nameUnavailable") assert.ok(html.includes(value), key);
    assert.ok(html.includes(`href="/intro?lang=${locale}&amp;intro=first"`));
    assert.ok(html.includes(`aria-label="${baseline[locale].photoAria}"`));
    assert.match(html, /aria-describedby="clubowner-photo-status"/);
    assert.match(html, /id="clubowner-photo-status"/);
    assert.match(html, /aria-describedby="clubowner-bank-status"/);
    assert.match(html, /id="clubowner-bank-status"/);
    assert.match(html, /data-bank-state="inactive"/);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
    assert.doesNotMatch(html, /type="file"|£|€|Luiz Lopez/);
  }
});

test("missing owner and empty facts remain honest fallbacks without invented account data", async () => {
  const copyModule = await loadCopy();
  for (const locale of ["pt-BR", "en-GB"] as const) for (const owner of [null, { name: '', avatarUrl: '', city: '', nationality: '', since: '' }]) {
    const html = renderHeader(owner, locale, copyModule);
    assert.ok(html.includes(`<h2 id="clubowner-heading">${baseline[locale].nameUnavailable}</h2>`));
    assert.ok(html.includes(`alt="${baseline[locale].nameUnavailable}"`));
    assert.match(html, /src="\/icons\/touchline-512.png"/);
    assert.equal((html.match(/<dd>—<\/dd>/g) ?? []).length, 3);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  }
});

test("actual rendered header takes all14 messages from the catalogue without duplicating copy", () => {
  const calls: string[] = [];
  const markerCopy = Object.fromEntries(Object.keys(baseline['en-GB']).map(key => [key, `copy-${key}`]));
  const html = renderHeader(null, 'pt-BR', { getTouchlineClubOwnerMarketCopy: (locale: string) => { calls.push(locale); return markerCopy; } });
  assert.deepEqual(calls, ['pt-BR']);
  for (const value of Object.values(markerCopy)) assert.ok(html.includes(value), value);
  assert.match(html, /<span>TOUCHLINE<\/span><h1>ClubOwner<\/h1>/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
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
    for (const value of Object.values(copy)) {
      assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]/);
      assert.doesNotMatch(value, /€|£|\b(?:GBP|BRL|0 TC)\b|9[,.]99/);
    }
    if (locale !== 'en-GB' && locale !== 'pt-BR') {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(mod.getTouchlineClubOwnerMarketCopy(locale), mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES['en-GB']);
      for (const key of ['photoUnavailable', 'purchasesUnavailable', 'notCreditBalance'] as const) assert.notEqual(copy[key], baseline['en-GB'][key]);
      const html = renderHeader(null, locale, mod);
      assert.ok(html.includes(baseline['en-GB'].purchasesUnavailable));
      assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
    }
  }
  for (const locale of [undefined, null, '', 'invalid']) assert.equal(mod.getTouchlineClubOwnerMarketCopy(locale), mod.TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES['en-GB']);
});
