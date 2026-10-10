import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { CLUB_OWNER_PLAN_PREVIEWS, CLUB_OWNER_PLAN_SHOWCASE_COPY, getClubOwnerPlanShowcaseCopy } from "../lib/touchlineArena/club-owner-plan-showcase.ts";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");

test("plan catalogue keeps the approved proposals separate from the real XI budget", () => {
  assert.deepEqual(CLUB_OWNER_PLAN_PREVIEWS.map(({ id, budget }) => [id, budget]), [
    ["standard", 500_000_000], ["pro", 1_000_000_000], ["master", 2_000_000_000], ["vip", null],
  ]);
  const view = readFileSync(join(root, "components/touchline/ClubOwnerPlanShowcase.tsx"), "utf8");
  assert.doesNotMatch(view, /fetch\(|localStorage|sessionStorage|router\.|useEffect|checkout|stripe/);
  assert.match(view, /setIndex\(value =>/);
  assert.match(view, /data-current-xi-budget/);
  assert.match(view, /plan\.id === "vip" \? labels\.invitation/);
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
    if (!locales.slice(0, 2).includes(locale)) assert.deepEqual(getClubOwnerPlanShowcaseCopy(locale), getClubOwnerPlanShowcaseCopy("en-GB"));
  }
});

function harness(locale: string, initialPlan = "pro", panelWidth = 600, gallery = false, surface = "showcase") {
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
  function bundle(path: string): string {
    if (modules[path]) return path;
    if (path.endsWith(".css")) { modules[path] = 'exports.default=new Proxy({},{get:(_,key)=>String(key)});'; return path; }
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
  const entry = bundle(join(root, `components/touchline/${surface === "cover" ? "ClubOwnerMarketHeader" : surface === "login" ? "LoginPlanGallery" : "ClubOwnerPlanShowcase"}.tsx`));
  const css = ["TouchlineGlobalNavigation.module.css", "ClubOwnerPlanShowcase.module.css", ...(surface === "cover" ? ["ClubOwnerMarketHeader.module.css"] : surface === "login" ? ["LoginPlanGallery.module.css"] : [])].map(file => readFileSync(join(root, "components/touchline", file), "utf8")).join("\n").replace(/:global\(([^)]+)\)/g, "$1");
  const defs = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  return `<!doctype html><html dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#08100c;color:white;padding:24px;font-family:Arial,sans-serif}#root{max-width:${gallery ? 1680 : panelWidth}px;margin:auto;${gallery ? "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px" : ""}}${css}</style><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}},modules={${defs}},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const React=require('react');require('react-dom/client').createRoot(document.getElementById('root')).render(${JSON.stringify(gallery ? CLUB_OWNER_PLAN_PREVIEWS.map(plan => plan.id) : [initialPlan])}.map(tier => React.createElement(require(${JSON.stringify(entry)}).default,{key:tier,initialPlan:tier,planPreview:tier,owner:{name:'ClubOwner',avatarUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',city:'',nationality:'',since:''},name:'ClubOwner',locale:${JSON.stringify(locale)},remainingMarketPower:${surface === "cover" ? "121000000" : "'121M'"},rankingPoints:63.25,rankingPosition:1,draftLocalesEnabled:true})));
  </script></html>`;
}

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
        await page.setContent(harness(locale, "pro", 1500, false, surface));
        const labels = getClubOwnerPlanShowcaseCopy(locale, true);
        if (surface === "cover") {
          const cover = page.locator('[data-cover-preview="true"]');
          await expect(cover).toBeVisible();
          await expect(cover.locator(".coverPattern")).toHaveAttribute("aria-hidden", "true");
          for (const [tier, color] of [["pro", "#e7cf91"], ["master", "#a5e4b6"], ["vip", "#d5b4f6"], ["standard", "#d2dce5"]]) {
            await expect(cover.locator(`[data-profile-tier="${tier}"]`)).toBeVisible();
            assert.equal(await cover.locator("[data-profile-tier]:visible").count(), 1);
            assert.equal(await cover.evaluate(el => getComputedStyle(el).getPropertyValue("--cover-accent").trim()), color);
            await expect(cover.locator(".facts")).toContainText((63.25).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            await expect(page.locator("[data-current-xi-budget]")).toContainText(new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(121_000_000));
            await page.getByRole("button", { name: labels.next }).click();
          }
          await expect(cover.locator('[data-profile-tier="pro"]')).toBeVisible();
        } else {
          await expect(page.locator("[data-plan-offer]")).toHaveCount(4);
          for (const tier of ["standard", "pro", "master", "vip"]) {
            const offer = page.locator(`article[data-plan-preview="${tier}"]`);
            await expect(offer.locator("h3")).toBeVisible();
            await offer.locator("summary").focus(); await page.keyboard.press("Enter");
            await expect(offer.locator("details")).toHaveAttribute("open");
            await page.keyboard.press("Enter");
            assert.equal(await offer.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
          }
          await expect(page.locator("article[data-plan-preview='master']")).toContainText(labels.pricePending);
          await expect(page.locator("article[data-plan-preview='vip']")).toContainText(labels.invitation);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []); assert.deepEqual(requests, []);
        if (engine === chromium && process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-${surface}-${width}.png`, fullPage: true });
        await page.close();
      }
    } finally { await browser.close(); }
  }
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
          if (path === "/") return route.fulfill({ contentType: "text/html", body: harness(locale, "pro", panelWidth) });
          return route.fulfill({ status: 404, body: "" });
        });
        await page.goto("http://plan-preview.test/");
        const labels = getClubOwnerPlanShowcaseCopy(locale, true);
        const bank = page.locator("section[data-plan-preview]");
        const next = page.getByRole("button", { name: labels.next });
        const previous = page.getByRole("button", { name: labels.previous });
        await expect(bank).toHaveAttribute("data-plan-preview", "pro");
        await expect(bank.locator(".cardKicker")).toHaveText(labels.fantasyFootball);
        await expect(bank.locator("svg.cardPattern")).toHaveAttribute("aria-hidden", "true");
        await expect(bank.locator("svg.cardPattern")).toHaveAttribute("focusable", "false");
        assert.equal(await bank.locator("svg.cardPattern").evaluate(el => getComputedStyle(el).animationName), "none");
        await expect(bank.locator(".marketPowerValue strong")).toHaveText("1B");
        await expect(bank.locator(".planAction")).toBeEnabled();
        assert.equal(await bank.locator(".planAction").evaluate(el => getComputedStyle(el).minHeight), "32px");
        assert.equal(await bank.locator(".planAction").evaluate(el => getComputedStyle(el).animationName), "none");
        await next.focus();
        for (const [id, amount] of [["master", "2B"], ["vip", "∞"], ["standard", "500M"], ["pro", "1B"]]) {
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
          if (id === "master") await expect(bank.locator("[data-plan-price]")).toHaveText(labels.pricePending);
          if (id === "vip") {
            await expect(bank.locator(".planAction")).toHaveText(labels.invitation);
            await expect(bank.locator(".marketPowerValue small")).toHaveText(labels.unlimited);
            assert.equal(await bank.evaluate(el => getComputedStyle(el).getPropertyValue("--plan-surface").trim()), "#2b1e38");
          }
          if (process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX && engine === chromium && (width === 1280 || (width === 390 && locale === "pt-BR"))) await page.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-${id}-${width}-${locale}.png`, fullPage: true });
          await bank.locator(".planAction").click();
          const modal = bank.getByRole("dialog");
          await expect(modal).toBeVisible();
          await expect(modal.locator("[data-current-xi-budget]")).toHaveText("121M TC");
          await expect(modal).toContainText(labels.preview);
          await expect(modal).toContainText(id === "vip" ? labels.vipBenefit : labels.currentBudget);
          await page.keyboard.press("Escape");
          await expect(modal).not.toBeVisible();
          await expect(bank.locator(".planAction")).toBeFocused();
          await next.focus();
        }
        await previous.click(); await expect(bank).toHaveAttribute("data-plan-preview", "standard");
        await previous.click(); await expect(bank).toHaveAttribute("data-plan-preview", "vip");
        const vipTab = bank.getByRole("tab", { name: "VIP" });
        await vipTab.focus(); await page.keyboard.press("Home");
        await expect(bank.locator('[role="tab"][data-tier="standard"]')).toBeFocused();
        await page.keyboard.press(locale === "ar-SA" ? "ArrowLeft" : "ArrowRight");
        await expect(bank).toHaveAttribute("data-plan-preview", "pro");
        await page.keyboard.press("End"); await expect(vipTab).toBeFocused();
        await page.keyboard.press(locale === "ar-SA" ? "ArrowLeft" : "ArrowRight");
        await expect(bank).toHaveAttribute("data-plan-preview", "standard");
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
        await gallery.setContent(harness("pt-BR", "pro", 600, true));
        await expect(gallery.getByRole("tablist")).toHaveCount(4);
        await gallery.screenshot({ path: `${process.env.TOUCHLINE_PLAN_CAPTURE_PREFIX}-four-plans.png`, fullPage: true });
        await gallery.close();
      }
    } finally { await browser.close(); }
  }
});
