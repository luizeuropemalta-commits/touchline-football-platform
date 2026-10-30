import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUB_OWNER_PLAN_PREVIEWS, CLUB_OWNER_PLAN_SHOWCASE_COPY, getClubOwnerPlanBenefits, getClubOwnerPlanBenefitTerms, getClubOwnerPlanShowcaseCopy, getClubOwnerVipPlanName } from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import { getTouchlineClubOwnerMarketCopy } from "../lib/touchlineArena/club-owner-market-i18n.ts";
import { getClubCollectionBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");

test("plan catalogue keeps the approved proposals separate from the real XI budget", () => {
  assert.deepEqual(CLUB_OWNER_PLAN_PREVIEWS.map(({ id, budget }) => [id, budget]), [
    ["beta", 100_000_000], ["standard", 750_000_000], ["master", 1_500_000_000], ["vip", 3_000_000_000],
  ]);
  const view = readFileSync(join(root, "components/touchline/ClubOwnerPlanShowcase.tsx"), "utf8");
  assert.doesNotMatch(view, /fetch\(|localStorage|sessionStorage|router\.|useEffect|checkout|stripe/);
  assert.match(view, /const move = \(delta: number\) =>/);
  assert.match(view, /data-current-xi-budget/);
  assert.doesNotMatch(view, /labels\.invitation|labels\.vipBenefit/);
  assert.match(view, /labels\.vipPrice/);
  assert.match(view, /aria-haspopup="dialog"/);
  const route = readFileSync(join(root, "app/clubowner/page.tsx"), "utf8");
  assert.match(route, /process\.env\.NODE_ENV === "development"/);
});

test("showcase copy covers eight languages and preserves the public draft gate", () => {
  const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  assert.deepEqual(Object.keys(CLUB_OWNER_PLAN_SHOWCASE_COPY), locales);
  const keys = Object.keys(getClubOwnerPlanShowcaseCopy("en-GB"));
  for (const locale of locales) {
    const copy = getClubOwnerPlanShowcaseCopy(locale, true);
    assert.deepEqual(Object.keys(copy), keys);
    for (const value of Object.values(copy)) assert.ok(value.trim());
    assert.ok(getClubOwnerVipPlanName(locale, true).includes("VIP"));
    assert.notEqual(getClubOwnerVipPlanName(locale, true), copy.betaPrice);
    if (!locales.slice(0, 2).includes(locale)) assert.deepEqual(getClubOwnerPlanShowcaseCopy(locale), getClubOwnerPlanShowcaseCopy("en-GB"));
  }
  assert.equal(getClubOwnerVipPlanName("pt-BR"), "VIP");
});

test("actual showcase keeps every plan and XI balance finite or unavailable", () => {
  const source = readFileSync(join(root, "components/touchline/ClubOwnerPlanShowcase.tsx"), "utf8");
  const tree = ts.createSourceFile("showcase.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ClubOwnerPlanShowcase");
  assert.ok(component);
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  const Showcase = vm.runInNewContext(ts.transpileModule(`${component.getText(tree).replace(/^export default\s+/, "")}\nClubOwnerPlanShowcase;`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, { React, CLUB_OWNER_PLAN_PREVIEWS, getTouchlineClubOwnerMarketCopy, getClubCollectionBudgetCopy, getClubOwnerPlanBenefits, getClubOwnerPlanBenefitTerms, getClubOwnerPlanShowcaseCopy, getClubOwnerVipPlanName,
    useState: (initial: () => unknown) => [initial(), () => assert.fail("SSR cannot activate a plan")],
    useId: () => "fixture-showcase", useRef: () => ({ current: null }), styles, controls: styles,
    ChevronDown: "svg", ChevronLeft: "svg", ChevronRight: "svg", LockKeyhole: "svg", X: "svg", ClubOwnerPlanCard: () => null });
  for (const locale of Object.keys(CLUB_OWNER_PLAN_SHOWCASE_COPY)) {
    for (const { id: initialPlan } of CLUB_OWNER_PLAN_PREVIEWS) {
      for (const [amount, expected] of [[null, "— TC"], ["121M", "121M TC"]] as const) {
        const html = renderToStaticMarkup(React.createElement(Showcase, { initialPlan, name: "", locale,
          draftLocalesEnabled: true, remainingMarketPower: amount }));
        const current = html.match(/<dd data-current-xi-budget="true"[^>]*>([^<]+)<\/dd>/)?.[0];
        assert.ok(current, "real current-budget element exists");
        assert.ok(current.endsWith(`>${expected}</dd>`));
        assert.doesNotMatch(current, /data-current-xi-unlimited|∞/);
        assert.match(html, /data-plan-state="inactive"/);
        assert.doesNotMatch(html, /href="#clubowner-plan-interest"/, "standalone previews cannot offer a plan change without a destination");
      }
    }
  }
});

test("actual Beta card and login gallery reuse the artwork with 100M TC, free access and no plan activation", () => {
  const view = readFileSync(join(root, "components/touchline/ClubOwnerPlanShowcase.tsx"), "utf8");
  const tree = ts.createSourceFile("plans.tsx", view, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const card = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ClubOwnerPlanCard");
  assert.ok(card);
  const css = new Proxy({}, { get: (_target, key) => String(key) });
  const context = { React, CLUB_OWNER_PLAN_PREVIEWS, getTouchlineClubOwnerMarketCopy, getClubOwnerPlanShowcaseCopy, getClubOwnerVipPlanName,
    styles: css, cardStyles: css, tierIcons: { beta: "svg", standard: "svg", pro: "svg", master: "svg", vip: "svg" },
    ChevronDown: "svg", TouchlineCoinMark: () => React.createElement("span", { "data-coin": "TC" }) };
  const execute = (source: string, scope: Record<string, unknown>) => vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  const Card = execute(`${card.getText(tree).replace(/^export\s+/, "")}\nClubOwnerPlanCard;`, context);
  let priceDeclaration = "";
  function findPrice(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "priceFor") priceDeclaration = node.getText(tree);
    ts.forEachChild(node, findPrice);
  }
  findPrice(tree);
  assert.ok(priceDeclaration);
  const gallery = readFileSync(join(root, "components/touchline/LoginPlanGallery.tsx"), "utf8");
  const galleryTree = ts.createSourceFile("gallery.tsx", gallery, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const galleryNode = galleryTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "LoginPlanGallery");
  assert.ok(galleryNode);
  const Gallery = execute(`${galleryNode.getText(galleryTree).replace(/^export default\s+/, "")}\nLoginPlanGallery;`, { ...context, ClubOwnerPlanCard: Card });
  for (const locale of Object.keys(CLUB_OWNER_PLAN_SHOWCASE_COPY)) {
    const labels = getClubOwnerPlanShowcaseCopy(locale, true);
    const copy = getTouchlineClubOwnerMarketCopy(locale, true);
    const priceFor = execute(`const ${priceDeclaration}; priceFor;`, { ...context, labels, copy });
    assert.equal(priceFor("beta"), labels.betaPrice);
    assert.equal(priceFor("master"), labels.masterPrice);
    assert.equal(priceFor("standard"), copy.planStandardPrice);
    assert.equal(priceFor("pro"), copy.planProPrice);
    assert.equal(priceFor("vip"), labels.vipPrice);
    const beta = renderToStaticMarkup(React.createElement(Card, { tier: "beta", locale, draftLocalesEnabled: true }));
    const standard = renderToStaticMarkup(React.createElement(Card, { tier: "standard", locale, draftLocalesEnabled: true }));
    assert.ok(beta.includes('<strong>100M</strong><small>TC</small>'));
    assert.doesNotMatch(beta, /€|EUR|500M/);
    const pattern = beta.match(/<svg class="cardPattern"[\s\S]+?<\/svg>/)?.[0];
    assert.ok(pattern);
    assert.equal(pattern, standard.match(/<svg class="cardPattern"[\s\S]+?<\/svg>/)?.[0]);
    assert.equal((pattern.match(/<path d="M\d+ -30C/g) ?? []).length, 3);
    assert.doesNotMatch(pattern, /<rect|<circle/);
    assert.ok(beta.includes(`<span class="cardKicker">${labels.membership}</span>`));
    const html = renderToStaticMarkup(React.createElement(Gallery, { locale, draftLocalesEnabled: true }));
    const offers = [...html.matchAll(/<article\b[\s\S]+?<\/article>/g)].map(match => match[0]);
    assert.equal(offers.length, 4);
    assert.ok(offers[0].includes('data-plan-preview="beta"'));
    assert.ok(offers[1].includes('data-plan-preview="standard"'));
    assert.ok(offers[0].includes(labels.betaPrice));
    assert.ok(offers[0].includes(labels.betaBenefit.replaceAll("&", "&amp;").replaceAll("'", "&#x27;")));
    assert.ok(!offers[0].includes(labels.pricePending));
    assert.ok(offers[0].includes(labels.seasonalPrice));
    assert.ok(offers[2].includes(labels.masterPrice));
    assert.ok(offers[3].includes(labels.seasonalPrice));
    assert.ok(offers[1].includes(copy.planStandardPrice));
    assert.ok(offers[3].includes(labels.vipPrice));
    for (const offer of offers) {
      assert.doesNotMatch(offer, /data-touchline-club-perimeter-trace|memberNeon/);
      assert.match(offer, /<span class="tierSeal" aria-hidden="true"><span class="tierIcon">/);
      assert.equal((offer.match(/class="tierIconGlint"/g) ?? []).length, 1);
      assert.equal((offer.match(/focusable="false"/g) ?? []).length, 3, "pattern and both decorative icon layers cannot take focus");
      assert.match(offer, /<div dir="ltr" class="memberCard"/);
    }
    assert.doesNotMatch(html, /<form|<button|href=/);
  }
});

test("membership light moves only through its icon without changing palettes or reduced motion", () => {
  const css = readFileSync(join(root, "components/touchline/ClubOwnerPlanShowcase.module.css"), "utf8");
  const neon = css.match(/^\.tierIconGlint\s*\{([^}]+)\}/m)?.[1];
  assert.ok(neon);
  assert.match(neon, /animation:\s*planIconSweep 2\.8s linear infinite/);
  assert.match(neon, /color:\s*var\(--plan-accent\)/);
  assert.match(neon, /-webkit-mask-image:\s*linear-gradient/);
  assert.match(neon, /mask-image:\s*linear-gradient/);
  assert.doesNotMatch(css, /\.memberNeon/);
  assert.match(css, /\.tierIcon > svg, \.tierIconGlint\s*\{\s*grid-area:\s*1 \/ 1/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^}]+animation:\s*none !important/);
  assert.match(css, /\.tierIconGlint\s*\{\s*animation:\s*none !important;\s*-webkit-mask-image:\s*none;\s*mask-image:\s*none;/);
  for (const [tier, color] of [["beta", "#ff888e"], ["standard", "#75bbff"], ["master", "#a5e4b6"], ["vip", "#d5b4f6"]]) {
    assert.ok(css.includes(`[data-plan-preview="${tier}"] { --plan-accent: ${color};`));
  }
  assert.match(css, /\.planShowcase\s*\{\s*--plan-accent:\s*#e7cf91/);
});

test("approved prices are Beta free, Master 89.90 and VIP 169.90 EUR per season", () => {
  const expected = {
    "en-GB": ["Free", "€169.90/season"], "pt-BR": ["Gratuito", "€169,90/temporada"],
    "es-ES": ["Gratis", "169,90 €/temporada"], "it-IT": ["Gratuito", "169,90 €/stagione"],
    "fr-FR": ["Gratuit", "169,90 €/saison"], "ar-SA": ["مجاني", "169.90 € لكل موسم"],
    "tr-TR": ["Ücretsiz", "169,90 €/sezon"], "de-DE": ["Kostenlos", "169,90 €/Saison"],
  };
  for (const [locale, prices] of Object.entries(expected)) {
    const labels = getClubOwnerPlanShowcaseCopy(locale, true);
    assert.deepEqual([labels.betaPrice, labels.vipPrice], prices);
    assert.equal(labels.masterPrice, prices[1].replace("169", "89"));
    assert.ok(labels.seasonalPrice.length > 0);
  }
});

const fixtureCssModules = new Map<string, { css: string; classes: Record<string, string> }>();

test("benefit blocks use approved plan rules and retain top-up conditions", () => {
  assert.deepEqual(getClubOwnerPlanBenefits("beta", "pt-BR").map(item => item.value), ["35", "Ilimitado", "7%", "Sem taxa + metade da taxa do proponente em TC", "10%"]);
  for (const [plan, rate, refundRate, price] of [["standard", "5%", "10%", "€10.00"], ["master", "4%", "10%", "€8.00"], ["vip", "2%", "10%", "€6.00"]] as const) {
    const blocks = getClubOwnerPlanBenefits(plan, "en-GB");
    assert.deepEqual(blocks.map(item => item.value), ["35", "Unlimited", rate, "No fee + half the sender's fee in TC", refundRate, price, "200M TC"]);
    assert.equal(new Set(blocks.map(item => item.label)).size, blocks.length);
  }
  assert.match(getClubOwnerPlanBenefitTerms("pt-BR"), /saldo zerado/);
  assert.match(getClubOwnerPlanBenefitTerms("en-GB"), /only when the exchange completes/);
});

function fixtureCssModule(path: string) {
  const cached = fixtureCssModules.get(path);
  if (cached) return cached;
  // Use the installed Next webpack CSS Modules pipeline, including its actual
  // local-name generator, rather than merging unscoped component class names.
  const nextRequire = createRequire(require.resolve("next/package.json"));
  const postcss = nextRequire("postcss");
  const { getModulesPlugins } = nextRequire("next/dist/build/webpack/loaders/css-loader/src/utils");
  const { getCssModuleLocalIdent } = nextRequire("next/dist/build/webpack/config/blocks/css/loaders/getCssModuleLocalIdent");
  const { extractICSS } = nextRequire("next/dist/compiled/icss-utils");
  const context = { rootContext: root, resourcePath: path, emitError: (error: Error) => { throw error; } };
  const plugins = getModulesPlugins({ modules: {
    mode: "pure", getLocalIdent: getCssModuleLocalIdent,
    localIdentName: "[hash:base64]", localIdentContext: root,
    localIdentHashPrefix: "", exportGlobals: false,
  } }, context);
  const result = postcss(plugins).process(readFileSync(path, "utf8"), { from: path, map: false }).sync();
  const { icssImports, icssExports } = extractICSS(result.root);
  assert.deepEqual(icssImports, {}, "fixture CSS must not omit a composed/imported module");
  const compiled = { css: result.root.toString(), classes: icssExports as Record<string, string> };
  fixtureCssModules.set(path, compiled);
  return compiled;
}

// A real-component browser fixture, not a full Next page, authenticated session
// or hosted QA proof. Plain class-name aliases are retained solely for readable
// test selectors: all stylesheet rules and keyframes use Next's scoped names.
function harness(locale: string, initialPlan = "standard", panelWidth = 600, gallery = false, surface = "showcase") {
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
    [join(root, "components/touchline/ClubOwnerAvatarControl.tsx")]: "exports.default=()=>{throw Error('No avatar interaction in membership fixture')};",
  };
  const stylesheets = new Map<string, string>();
  function bundle(path: string): string {
    if (modules[path]) return path;
    if (path.endsWith(".css")) {
      const compiled = fixtureCssModule(path);
      stylesheets.set(path, compiled.css);
      const aliases = Object.fromEntries(Object.entries(compiled.classes).map(([name, scoped]) => [name, `${scoped} ${name}`]));
      modules[path] = `exports.default=${JSON.stringify(aliases)};`;
      return path;
    }
    modules[path] = "";
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    modules[path] = code.replace(/require\("([^"]+)"\)/g, (all, id: string) => {
      if (!id.startsWith(".") && !id.startsWith("@/")) return all;
      let target = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(path), id);
      if (!/\.(ts|tsx|css)$/.test(target)) target += existsSync(`${target}.ts`) ? ".ts" : ".tsx";
      return `require(${JSON.stringify(bundle(target))})`;
    });
    return path;
  }
  const entry = bundle(join(root, `components/touchline/${surface === "cover" || surface === "active" ? "ClubOwnerMarketHeader" : surface === "login" ? "LoginPlanGallery" : "ClubOwnerPlanShowcase"}.tsx`));
  const motion = bundle(join(root, "lib/touchlineArena/visible-decoration-motion.ts"));
  const css = [...stylesheets.values()].join("\n");
  const defs = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  return `<!doctype html><html dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#08100c;color:white;padding:24px;font-family:Arial,sans-serif}#root{max-width:${gallery ? 1680 : panelWidth}px;margin:auto;${gallery ? "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px" : ""}}${css}</style><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}},modules={${defs}},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const React=require('react');require('react-dom/client').createRoot(document.getElementById('root')).render(${JSON.stringify(gallery ? CLUB_OWNER_PLAN_PREVIEWS.map(plan => plan.id) : [initialPlan])}.map(tier => React.createElement(require(${JSON.stringify(entry)}).default,{key:tier,initialPlan:tier,planPreview:${surface === "active" ? "null" : "tier"},plan:${surface === "active" ? "{active:true,expiresAt:null}" : "null"},activePlanKey:${surface === "active" ? "'vip'" : "null"},activePlanBudget:${surface === "active" ? "1000000000" : "undefined"},owner:{name:'ClubOwner',avatarUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',city:'',nationality:'',since:''},name:'ClubOwner',locale:${JSON.stringify(locale)},remainingMarketPower:${surface === "cover" || surface === "active" ? "121000000" : "'121M'"},rankingPosition:1,draftLocalesEnabled:true})));
  require(${JSON.stringify(motion)}).observeVisibleDecorationMotion();
  </script></html>`;
}

if (process.env.TOUCHLINE_RUN_PLAN_BROWSER_TESTS === "1") test("membership icon light travels on all four plans and becomes static with reduced motion", { timeout: 120_000 }, async () => {
  const { chromium, webkit, firefox, expect } = await import("@playwright/test");
  const tiers = ["beta", "standard", "master", "vip"];
  const engines = process.env.TOUCHLINE_PLAN_ENGINE === "webkit" ? [webkit] : process.env.TOUCHLINE_PLAN_ENGINE === "firefox" ? [firefox] : process.env.TOUCHLINE_PLAN_ENGINE === "chromium" ? [chromium] : [chromium, webkit];
  for (const engine of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const surface of ["showcase", "login"]) for (const [width, locale] of [[1440, "en-GB"], [844, "pt-BR"], [390, "ar-SA"]] as const) {
        const page = await browser.newPage({ viewport: { width, height: width === 844 ? 390 : 900 }, reducedMotion: "no-preference" });
        const errors: string[] = [], requests: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await page.route("**/*", route => { requests.push(route.request().url()); return route.fulfill({ status: 404, body: "" }); });
        await page.setContent(harness(locale, "beta", surface === "login" ? 1500 : 600, false, surface));
        for (const tier of tiers) {
          if (surface === "showcase") await page.locator(`[role="tab"][data-tier="${tier}"]`).click();
          const card = page.locator(`[data-plan-offer="${tier}"]`);
          const glint = card.locator(".tierIconGlint");
          await expect(card).toBeVisible();
          await expect(card.locator("[data-touchline-club-perimeter-trace]")).toHaveCount(0);
          await expect(glint).toHaveCount(1);
          await expect(card.locator(".tierSeal")).toHaveAttribute("aria-hidden", "true");
          await expect(glint.locator("svg")).toHaveAttribute("focusable", "false");
          await card.scrollIntoViewIfNeeded();
          await expect.poll(() => glint.evaluate(el => el.getAnimations()[0]?.playState)).toBe("running");
          await expect(card).toHaveAttribute("dir", "ltr");
          const style = await glint.evaluate(el => {
            const computed = getComputedStyle(el), card = el.closest("[data-plan-offer]")!;
            const base = el.previousElementSibling!, seal = el.closest(".tierSeal")!;
            const a = el.getBoundingClientRect(), b = base.getBoundingClientRect(), c = seal.getBoundingClientRect();
            return { duration: computed.animationDuration, iterations: computed.animationIterationCount,
              state: el.getAnimations()[0]?.playState, color: computed.color, baseColor: getComputedStyle(base).color,
              glow: computed.filter, mask: computed.maskImage, position: computed.maskPosition,
              transform: getComputedStyle(card).transform, direction: getComputedStyle(card).direction,
              size: b.width, aligned: a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height,
              insideSeal: a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom };
          });
          assert.equal(style.duration, "2.8s");
          assert.equal(style.iterations, "infinite");
          assert.equal(style.state, "running");
          assert.equal(style.color, style.baseColor, `${tier} keeps its existing accent`);
          assert.notEqual(style.glow, "none");
          assert.notEqual(style.mask, "none");
          assert.equal(style.transform, "none");
          assert.equal(style.direction, "ltr");
          assert.ok(style.size >= 22 && style.size <= 32, "shared button styles cannot shrink the plan icon");
          assert.equal(style.aligned, true, "highlight overlays the original icon precisely");
          assert.equal(style.insideSeal, true, "light has no detached card-corner orbit");
          await expect.poll(() => glint.evaluate(el => getComputedStyle(el).maskPosition), { timeout: 3000 }).not.toBe(style.position);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        // Prove the production observer stops this new animation outside the viewport.
        await page.evaluate(() => { document.getElementById("root")!.style.marginTop = "2000px"; window.scrollTo(0, 0); });
        await expect.poll(() => page.locator(".tierIconGlint").evaluateAll(elements => elements.every(el => el.getAnimations().every(animation => animation.playState === "paused")))).toBe(true);
        await page.evaluate(() => { document.getElementById("root")!.style.marginTop = ""; });
        await page.locator(".tierIconGlint").last().scrollIntoViewIfNeeded();
        await expect.poll(() => page.locator(".tierIconGlint").last().evaluate(el => el.getAnimations()[0]?.playState)).toBe("running");
        if (process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX) {
          // Hold the light mid-pass for an inspectable comparison, without changing its geometry.
          await page.locator(".tierIconGlint").evaluateAll(elements => elements.forEach(el => el.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 1400; })));
          await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-${engine.name()}-icons-${surface}-${width}.png`, fullPage: true });
        }
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const tier of tiers) {
          if (surface === "showcase") await page.locator(`[role="tab"][data-tier="${tier}"]`).click();
          const card = page.locator(`[data-plan-offer="${tier}"]`), glint = card.locator(".tierIconGlint");
          await expect.poll(() => glint.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
          const still = await card.evaluate(async el => {
            const glint = el.querySelector(".tierIconGlint")!;
            const before = getComputedStyle(glint).maskPosition;
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            return { before, after: getComputedStyle(glint).maskPosition, mask: getComputedStyle(glint).maskImage,
              opacity: Number(getComputedStyle(glint).opacity), shadow: getComputedStyle(el).boxShadow };
          });
          assert.equal(still.before, still.after);
          assert.equal(still.mask, "none");
          assert.equal(still.opacity, .25);
          assert.notEqual(still.shadow, "none", "static border remains illuminated");
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(requests, []);
        await page.close();
      }
    } finally { await browser.close(); }
  }
});

if (process.env.TOUCHLINE_RUN_PLAN_BROWSER_TESTS === "1") test("membership cover follows every preview while login presents the same four offers", { timeout: 120_000 }, async () => {
  const { chromium, webkit, expect } = await import("@playwright/test");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const surface of ["cover", "login"]) for (const [width, locale] of [[1440, "pt-BR"], [844, "en-GB"], [390, "ar-SA"]] as const) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const errors: string[] = [], requests: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await page.route("**/*", route => { requests.push(route.request().url()); return route.fulfill({ status: 404, body: "" }); });
        await page.setContent(harness(locale, "standard", 1500, false, surface));
        const labels = getClubOwnerPlanShowcaseCopy(locale, true);
        if (surface === "cover") {
          const cover = page.locator('[data-cover-preview="true"]');
          await expect(cover).toBeVisible();
          await expect(cover.locator(".coverPattern")).toHaveAttribute("aria-hidden", "true");
          for (const [, color, rgb] of [["standard", "#75bbff", "65, 139, 226"], ["master", "#a5e4b6", "111, 191, 143"], ["vip", "#d5b4f6", "162, 116, 206"], ["beta", "#ff888e", "203, 67, 79"]]) {
            assert.equal(await cover.evaluate(el => getComputedStyle(el).getPropertyValue("--cover-accent").trim()), color);
            await expect.poll(() => page.locator('[data-clubowner-header="true"]').evaluate(element =>
              Array.from(element.querySelectorAll(".profile, .bank"), panel => getComputedStyle(panel).borderTopColor)
            )).toEqual([`rgba(${rgb}, 0.95)`, `rgba(${rgb}, 0.95)`]);
            await expect(cover.locator(".facts")).not.toContainText("TouchLine Points");
            await expect(page.locator("[data-current-xi-budget]")).toContainText(new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(121_000_000));
            await page.getByRole("button", { name: labels.next }).click();
          }
          await expect.poll(() => page.locator('[data-clubowner-header="true"]').evaluate(element =>
            Array.from(element.querySelectorAll(".profile, .bank"), panel => getComputedStyle(panel, "::before").borderTopColor)
          )).toEqual(["rgba(145, 213, 111, 0.48)", "rgba(145, 213, 111, 0.48)"]);
        } else {
          await expect(page.locator("[data-plan-offer]")).toHaveCount(4);
          for (const tier of ["beta", "standard", "master", "vip"]) {
            const offer = page.locator(`article[data-plan-preview="${tier}"]`);
            await expect(offer.locator("h3")).toBeVisible();
            await offer.locator("summary").focus(); await page.keyboard.press("Enter");
            await expect(offer.locator("details")).toHaveAttribute("open");
            await page.keyboard.press("Enter");
            assert.equal(await offer.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
          }
          await expect(page.locator("article[data-plan-preview='master']")).toContainText(labels.masterPrice);
          await expect(page.locator("article[data-plan-preview='vip']")).toContainText(labels.vipPrice);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []); assert.deepEqual(requests, []);
        if (engine === chromium && process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-${surface}-${width}.png`, fullPage: true });
        await page.close();
      }
    } finally { await browser.close(); }
  }
});

if (process.env.TOUCHLINE_RUN_PLAN_BROWSER_TESTS === "1") test("active VIP keeps plan-coloured panels with a green inner line and compact catalogue", { timeout: 60_000 }, async () => {
  const { chromium, expect } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await page.setContent(harness("pt-BR", "vip", 1500, false, "active"));
      const header = page.locator('[data-clubowner-header="true"]');
      await expect(header.locator(".profile")).toBeVisible();
      await expect(header.locator(".bank")).toBeVisible();
      await expect(header.locator('[data-current-plan="true"]')).toHaveCount(1);
      await expect(header.locator('[role="tab"]')).toHaveCount(4);
      assert.equal(await header.evaluate(element => getComputedStyle(element).getPropertyValue("--clubowner-ink").trim()), "#d5b4f6");
      await header.locator('[data-current-plan="true"]').click();
      await expect(header.getByRole("dialog")).toBeVisible();
      await expect(header.getByRole("dialog").locator("h2")).toHaveText("VIP");
      await page.keyboard.press("Escape");
      await expect(header.getByRole("dialog")).not.toBeVisible();
      await expect(header.getByRole("button", { name: "Ver plano: VIP", exact: true })).toBeFocused();
      await header.getByRole("button", { name: "Plano anterior", exact: true }).click();
      assert.equal(await header.evaluate(element => getComputedStyle(element).getPropertyValue("--clubowner-ink").trim()), "#a5e4b6");
      await expect(header.locator('.bank')).toHaveAttribute("data-active-plan", "vip");
      await expect(header.locator('[data-account-market-power="true"]')).toBeVisible();
      await expect(header.locator('[data-account-market-power="true"]')).toContainText("121");
      await expect(header.locator('[data-account-market-power="true"]')).not.toContainText("∞");
      await expect(header.locator('[data-profile-tier],[data-profile-active-plan]')).toHaveCount(0);
      await expect(header.locator('[data-plan-offer="master"]')).toHaveCount(1);
      assert.equal(await header.locator(".profile").evaluate(element => getComputedStyle(element).borderTopColor), "rgba(111, 191, 143, 0.95)");
      // Wait for the real pseudo-element transition, not only React's theme
      // attribute: an immediate capture can retain the previous VIP purple.
      await expect.poll(() => header.evaluate(element =>
        Array.from(element.querySelectorAll(".profile, .bank"), panel => getComputedStyle(panel, "::before").borderTopColor)
      )).toEqual(["rgba(145, 213, 111, 0.48)", "rgba(145, 213, 111, 0.48)"]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-active-vip-${width}.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});

if (process.env.TOUCHLINE_RUN_PLAN_BROWSER_TESTS === "1") test("premium plans: tabs, arrows, comparison and details work without changing the account", { timeout: 120_000 }, async () => {
  const { chromium, webkit, expect } = await import("@playwright/test");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [width, locale, panelWidth = 600] of [[1280, "pt-BR"], [844, "en-GB"], [390, "pt-BR"], [390, "ar-SA"], [390, "de-DE"], [390, "fr-FR"], [390, "it-IT"], [390, "es-ES"], [390, "tr-TR"], [320, "en-GB"], [800, "pt-BR", 260], [800, "de-DE", 260], [800, "ar-SA", 260]] as const) {
        const page = await browser.newPage({ viewport: { width, height: 760 }, reducedMotion: "reduce" });
        const errors: string[] = [], requests: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await page.route("**/*", route => {
          const path = new URL(route.request().url()).pathname;
          requests.push(`${route.request().method()} ${path}`);
          if (path === "/") return route.fulfill({ contentType: "text/html", body: harness(locale, "standard", panelWidth) });
          return route.fulfill({ status: 404, body: "" });
        });
        await page.goto("http://plan-preview.test/");
        // Match the application's reset, which removes the UA dialog margins.
        await page.addStyleTag({ content: "dialog { margin: 0; }" });
        const labels = getClubOwnerPlanShowcaseCopy(locale, true);
        const bank = page.locator("section[data-plan-preview]");
        const next = page.getByRole("button", { name: labels.next });
        const previous = page.getByRole("button", { name: labels.previous });
        await expect(bank).toHaveAttribute("data-plan-preview", "standard");
        await expect(bank.locator(".cardKicker")).toHaveText(labels.membership);
        await expect(bank.locator("svg.cardPattern")).toHaveAttribute("aria-hidden", "true");
        await expect(bank.locator("svg.cardPattern")).toHaveAttribute("focusable", "false");
        assert.equal(await bank.locator("svg.cardPattern").evaluate(el => getComputedStyle(el).animationName), "none");
        await expect(bank.locator(".marketPowerValue strong")).toHaveText("750M");
        await expect(bank.locator(".planAction")).toBeEnabled();
        assert.equal(await bank.locator(".planAction").evaluate(el => getComputedStyle(el).minHeight), "32px");
        assert.equal(await bank.locator(".planAction").evaluate(el => getComputedStyle(el).animationName), "none");
        await next.focus();
        for (const [id, amount] of [["master", "1.5B"], ["vip", "3B"], ["beta", "100M"], ["standard", "750M"]]) {
          await page.keyboard.press("Enter");
          await expect(bank).toHaveAttribute("data-plan-preview", id);
          await expect(bank.locator(".marketPowerValue strong")).toHaveText(amount);
          await expect(next).toBeFocused();
          await expect(bank.locator("[data-current-xi-budget]")).toHaveText("121M TC");
          await expect(bank).toHaveAttribute("data-plan-state", "inactive");
          const box = (await bank.boundingBox())!;
          for (const selector of [".showcaseHeading", ".cardIdentity", ".cardBottom", ".offerSummary", ".marketPowerValue", ".planBrowse", ".cardOwner"]) {
            const b = (await bank.locator(selector).boundingBox())!;
            assert.ok(b.x >= box.x && b.x + b.width <= box.x + box.width + 1, `${engine.name()}/${width}/${locale}/${id}/${selector} fits`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const layout = await bank.locator(".memberCard").evaluate(card => {
            const title = card.querySelector("h3")!.getBoundingClientRect();
            const seal = card.querySelector(".tierSeal")!.getBoundingClientRect();
            const bounds = card.getBoundingClientRect();
            return { clipped: card.scrollWidth > card.clientWidth + 1, titleFits: title.left >= bounds.left && title.right <= bounds.right,
              separated: title.right <= seal.left || seal.right <= title.left };
          });
          assert.deepEqual(layout, { clipped: false, titleFits: true, separated: true }, `${engine.name()}/${width}/${panelWidth}/${locale}/${id} card content`);
          assert.equal(await bank.locator(".tierSeal").evaluate(el => getComputedStyle(el).color === getComputedStyle(el.querySelector("svg")!).color), true, "clickable cover preserves the original plan seal colour");
          if (id === "master") await expect(bank.locator("[data-plan-price]")).toHaveText(labels.masterPrice);
          if (id === "vip") {
            await expect(bank.locator(".planAction")).toHaveText(labels.details);
            await expect(bank.locator(".marketPowerValue small")).toHaveText("TC");
            assert.equal(await bank.evaluate(el => getComputedStyle(el).getPropertyValue("--plan-surface").trim()), "#2b1e38");
          }
          if (process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX && engine === chromium && (width === 1280 || (width === 390 && locale === "pt-BR"))) await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-${id}-${width}-${locale}.png`, fullPage: true });
          await bank.locator(".planAction").click();
          const modal = bank.getByRole("dialog");
          await expect(modal).toBeVisible();
          await expect(modal.locator("[data-current-xi-budget]")).toHaveText("121M TC");
          await expect(modal).toContainText(labels.preview);
          await expect(modal).toContainText(labels.currentBudget);
          const modalBounds = await modal.boundingBox();
          assert.ok(modalBounds && modalBounds.x >= 0 && modalBounds.x + modalBounds.width <= width + 1);
          assert.ok(Math.abs(modalBounds.x + modalBounds.width / 2 - width / 2) <= 2, "zoom stays centred");
          assert.equal(await modal.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, "plan zoom has no horizontal overflow");
          if (id !== "beta") await expect(modal.locator(`[data-plan-benefits="${id}"] > div`)).toHaveCount(7);
          if (process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX && engine === chromium && locale === "pt-BR" && (width === 1280 || width === 390)) {
            await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-zoom-${id}-${width}.png`, fullPage: true });
          }
          await page.keyboard.press("Escape");
          await expect(modal).not.toBeVisible();
          await expect(bank.locator(".planAction")).toBeFocused();
          await next.focus();
        }
        await previous.click(); await expect(bank).toHaveAttribute("data-plan-preview", "beta");
        await previous.click(); await expect(bank).toHaveAttribute("data-plan-preview", "vip");
        const vipTab = bank.locator('[role="tab"][data-tier="vip"]');
        await expect(vipTab).toHaveAccessibleName(new RegExp(getClubOwnerVipPlanName(locale, true)));
        await vipTab.focus(); await page.keyboard.press("Home");
        await expect(bank.locator('[role="tab"][data-tier="beta"]')).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(bank).toHaveAttribute("data-plan-preview", "standard");
        await page.keyboard.press("End"); await expect(vipTab).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(bank).toHaveAttribute("data-plan-preview", "beta");
        await bank.locator("summary").focus(); await page.keyboard.press("Enter");
        await expect(bank.getByRole("table")).toBeVisible();
        await bank.getByRole("button", { name: `${labels.viewPlan}: Master`, exact: true }).click();
        await expect(bank).toHaveAttribute("data-plan-preview", "master");
        await expect(bank.locator("details")).not.toHaveAttribute("open");
        await expect(bank.getByRole("tab", { name: "Master" })).toBeFocused();
        await bank.locator(".planAction").click();
        await bank.getByRole("dialog").locator(".dialogClose").click();
        await expect(bank.getByRole("dialog")).not.toBeVisible();
        assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
        assert.deepEqual(errors, []);
        assert.ok(requests.every(request => request === "GET /"), requests.join("\n"));
        assert.equal(page.url(), "http://plan-preview.test/");
        await page.close();
      }
      if (engine === chromium && process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX) {
        const gallery = await browser.newPage({ viewport: { width: 1680, height: 800 }, reducedMotion: "reduce" });
        await gallery.setContent(harness("pt-BR", "standard", 600, true));
        await expect(gallery.getByRole("tablist")).toHaveCount(4);
        await gallery.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-four-plans.png`, fullPage: true });
        await gallery.close();
      }
    } finally { await browser.close(); }
  }
});

test("Beta disclosure agrees on shared budget, balance-based coach choice and fees in all eight locales",()=>{
 const balanceTerms:Record<string,string>={"pt-BR":"conforme seu saldo","en-GB":"within your balance","es-ES":"según tu saldo","it-IT":"in base al tuo saldo","fr-FR":"selon votre solde","ar-SA":"حسب رصيدك","tr-TR":"Bakiyenize uygun","de-DE":"passend zu deinem Guthaben"};
 for(const locale of ["pt-BR","en-GB","es-ES","it-IT","fr-FR","ar-SA","tr-TR","de-DE"]){
  const copy=getClubOwnerPlanShowcaseCopy(locale,true);
  for(const amount of ["100M","35","7",balanceTerms[locale]])assert.ok(copy.betaBenefit.includes(amount));
  const benefits=getClubOwnerPlanBenefits("beta",locale,true);assert.equal(benefits.length,5);assert.equal(benefits[2].value,"7%");assert.equal(benefits[4].value,"10%");
  assert.doesNotMatch(copy.betaBenefit,/50M|95M|5M|Ruby|not available|indisponível/);
 }
});
