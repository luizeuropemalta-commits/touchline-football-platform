import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, webkit, expect, type Locator } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { getExchangeNegotiationCopy } from "../lib/touchlineFantasy/exchange-negotiations-i18n.ts";
import { CLUB_ROSTER_CAPACITY } from "../lib/touchlineFantasy/club-roster.ts";

const origin = "https://exchange-hub-fixture.invalid";
// Approved full-screen smoke surface: transparent content on a dark translucent
// overlay. Assert the effective layer rather than the obsolete opaque dialog.
async function assertSmokeDialog(dialog: Locator, width: number) {
  await expect(dialog).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(dialog).toHaveCSS("border-top-width", "0px");
  const overlay = dialog.locator("..");
  await expect(overlay).toHaveCSS("position", "fixed");
  await expect(overlay).toHaveCSS("background-color", "rgba(0, 5, 6, 0.72)");
  assert.equal(await overlay.evaluate(node => {
    const css = getComputedStyle(node);
    return css.getPropertyValue("backdrop-filter") || css.getPropertyValue("-webkit-backdrop-filter");
  }), "blur(8px)");
  const bounds = await overlay.boundingBox();
  assert.ok(bounds && Math.abs(bounds.x) <= 1 && Math.abs(bounds.width - width) <= 1);
}

const draftLabels = {
  "fr-FR": ["Négociations", "Historique des transferts", "Finances du club", "Fermer"],
  "es-ES": ["Negociaciones", "Historial de transferencias", "Finanzas del club", "Cerrar"],
  "it-IT": ["Negoziazioni", "Storico trasferimenti", "Finanze del club", "Chiudi"],
  "de-DE": ["Verhandlungen", "Transferverlauf", "Vereinsfinanzen", "Schließen"],
  "tr-TR": ["Müzakereler", "Transfer geçmişi", "Kulüp mali durumu", "Kapat"],
  "ar-SA": ["المفاوضات", "سجل الانتقالات", "مالية النادي", "إغلاق"],
} as const;
const draftIncompleteNotices = {
  "fr-FR": "Effectif : 34/35. Complétez les 35 contrats sur le marché original TouchLine pour négocier. Après une résiliation, recrutez un remplaçant pour compléter l'effectif.",
  "es-ES": "Plantilla: 34/35. Completa los 35 contratos en el mercado original TouchLine para negociar. Tras rescindir un contrato, ficha un sustituto para completar la plantilla.",
  "it-IT": "Rosa: 34/35. Completa tutti i 35 contratti nel mercato originale TouchLine per negoziare. Dopo uno svincolo, ingaggia un sostituto per completare la rosa.",
  "de-DE": "Kader: 34/35. Vervollständige alle 35 Verträge im ursprünglichen TouchLine-Markt, um zu verhandeln. Verpflichte nach einer Freigabe einen Ersatz, um den Kader wieder zu vervollständigen.",
  "tr-TR": "Kadro: 34/35. Müzakere için orijinal TouchLine pazarında 35 sözleşmenin tamamını doldurun. Bir oyuncuyu serbest bıraktıktan sonra kadroyu tamamlamak için yerine birini transfer edin.",
  "ar-SA": "قائمة الفريق: 34/35. أكمل العقود البالغ عددها 35 في سوق TouchLine الأصلي للتفاوض. بعد فسخ عقد لاعب، تعاقد مع بديل لاستكمال القائمة.",
} as const;
const players = (["starters", "reserves", "outside"] as const).flatMap(area => Array.from({ length: CLUB_ROSTER_CAPACITY[area] }, (_, slot) => ({
  playerId: `fictional-${area}-${slot}`, area, slot, position: "CB", clubId: "fictional", valueEur: 1_000_000,
})));
test("Exchange Hub actual browser: readiness locales mobile dialogs focus and readonly accounts", {
  skip: process.env.TOUCHLINE_RUN_EXCHANGE_HUB_BROWSER !== "1", timeout: 120_000,
}, async t => {
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "components/touchline/market/ClubOwnerExchangeHub.tsx",
    requiredSources: ["components/touchline/market/ClubOwnerExchangeHub.tsx", "components/touchline/market/ClubOwnerExchangeHub.module.css", "lib/touchlineFantasy/exchange-eligibility.ts"],
    mountScript: `const Hub=loadEntry().default;flushSync(()=>root.render(React.createElement(Hub,window.fixtureProps)));window.unmountFixture=()=>flushSync(()=>root.unmount());`,
  });
  const engine = process.env.TOUCHLINE_EXCHANGE_HUB_ENGINE === "webkit" ? webkit : chromium;
  const draftsOnly = process.env.TOUCHLINE_EXCHANGE_HUB_DRAFTS_ONLY === "1";
  const captureDir = process.env.TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR;
  if (draftsOnly) assert.ok(captureDir, "draft proof requires an explicit artifact directory");
  if (captureDir) {
    assert.ok(path.isAbsolute(captureDir), "capture directory must be absolute");
    mkdirSync(captureDir, { recursive: true });
  }
  const browser = await engine.launch({ headless: true, timeout: 15_000 });
  try {
    const mobileOnly = process.env.TOUCHLINE_EXCHANGE_HUB_MOBILE_ONLY === "1";
    for (const width of draftsOnly || mobileOnly ? [390] : [1280, 390]) for (const locale of draftsOnly ? Object.keys(draftLabels) : ["en-GB", "pt-BR"]) for (const status of draftsOnly ? ["incomplete"] : ["incomplete", "complete", "unconfirmed"]) {
      await t.test(`${engine.name()} ${width}px ${locale} ${status}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
        const page = await context.newPage(); page.setDefaultTimeout(5_000);
        const errors: string[] = [], requests: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        const count = status === "incomplete" ? 34 : 35;
        const props = { locale, draftLocalesEnabled: draftsOnly, ready: status !== "unconfirmed", plan: "vip", ownerName: "Fictional Owner", catalogue: [{ id: players[0].playerId, name: "Fictional Athlete" }],
          state: { revision: 35, seasonId: "fictional", plan: "vip", formationCode: "4-3-3", balanceEur: 100_000_000,
            coach: { id: "fictional-coach", valueEur: 10_000_000, tier: "radiant-gold" }, players: players.slice(0, count),
            receipts: [{ key: "fictional-receipt", playerId: players[0].playerId, valueEur: 1_000_000, revision: 1 }] } };
        const safe = (value: string) => value.replace(/<\/script/gi, "<\\/script");
        const mount = draftsOnly ? '<main dir="ltr"><div id="root"></div></main>' : '<div id="root"></div>';
        const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#06100b;color:#f2f9ec;font-family:Arial,sans-serif}button{font:inherit}#root{padding:16px;max-width:1100px;margin:auto}${bundle.css}</style>${mount}<script>window.fixtureProps=${safe(JSON.stringify(props))};</script><script>${safe(bundle.script)}</script></html>`;
        await context.route("**/*", async route => {
          if (route.request().method() === "GET" && route.request().url() === `${origin}/fixture`) await route.fulfill({ contentType: "text/html", body: html });
          else { requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); await route.abort("blockedbyclient"); }
        });
        try {
          await page.goto(`${origin}/fixture`, { waitUntil: "domcontentloaded" });
          if (draftsOnly) {
            const labels = draftLabels[locale as keyof typeof draftLabels];
            const artifactBase = path.join(captureDir!, `hub-${engine.name()}-390-${locale}`);
            const directions: unknown[] = [];
            const expectedNotice = draftIncompleteNotices[locale as keyof typeof draftIncompleteNotices];
            await expect(page.locator("#root [data-exchange-readiness]")).toHaveText(expectedNotice);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            await page.screenshot({ path: `${artifactBase}-notice.png` });
            for (const [index, panel] of ["negotiations", "history", "finances"].entries()) {
              const trigger = page.getByRole("button", { name: labels[index], exact: true });
              await trigger.click();
              const dialog = page.getByRole("dialog");
              await expect(dialog).toBeVisible();
              await expect(dialog.getByRole("heading", { name: labels[index], exact: true })).toBeVisible();
              const close = dialog.getByRole("button", { name: labels[3], exact: true });
              await expect(close).toBeFocused();
              await assertSmokeDialog(dialog, width);
              if (index === 0) {
                await expect(dialog.getByRole("status")).toHaveText(getExchangeNegotiationCopy(locale).error);
                await expect(dialog.getByRole("button")).toHaveCount(1); // Close only: no account means no trading controls.
              }
              if (index === 1) await expect(dialog).toContainText("Fictional Athlete");
              if (index === 2) await expect(dialog.locator("dd").first()).toHaveText(`${props.state.balanceEur.toLocaleString(locale)} TC`);
              await page.keyboard.press("Tab");
              assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
              assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
              const bounds = await dialog.boundingBox();
              assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
              await expect(close).toBeInViewport();
              directions.push(await dialog.evaluate((el, panel) => ({ panel,
                htmlLang: document.documentElement.lang, htmlDir: document.documentElement.dir,
                bodyDir: document.body.dir, html: getComputedStyle(document.documentElement).direction,
                body: getComputedStyle(document.body).direction,
                main: getComputedStyle(document.querySelector("main")!).direction,
                root: getComputedStyle(document.querySelector("#root")!).direction,
                dialog: getComputedStyle(el).direction,
              }), panel));
              await page.screenshot({ path: `${artifactBase}-${panel}.png` });
              if (index === 0) await page.keyboard.press("Escape"); else await close.click();
              await expect(dialog).toHaveCount(0);
              await expect(trigger).toBeFocused();
            }
            assert.deepEqual(errors, []); assert.deepEqual(requests, []);
            assert.equal(await page.evaluate("JSON.stringify(window.fixtureProps)"), JSON.stringify(props));
            const sources = bundle.sources.map(file => ({ file, sha256: createHash("sha256").update(readFileSync(new URL(`../${file}`, import.meta.url))).digest("hex") }));
            writeFileSync(`${artifactBase}-receipt.json`, JSON.stringify({ engine: engine.name(), version: browser.version(), locale,
              width, ownedCount: 34, draftLocalesEnabled: true, directions, sources, errors, requests,
              result: "mounted assertions passed; screenshots await visual review; no native RTL acceptance" }, null, 2));
            return;
          }
          const pt = locale === "pt-BR";
          const notice = page.locator("#root [data-exchange-readiness]");
          await expect(notice).toHaveAttribute("data-exchange-readiness", status);
          if (status === "incomplete") await expect(notice).toContainText("34/35");
          if (status === "complete") await expect(notice).toContainText(pt ? "Abra Negociações para consultar a disponibilidade atual." : "Open Negotiations to check current availability.");
          if (status === "unconfirmed") await expect(notice).not.toContainText("35");
          if (status === "incomplete" && process.env.TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR) await page.screenshot({ path: `${process.env.TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR}/exchange-hub-${engine.name()}-${width}-${locale}-notice.png` });
          const negotiations = page.getByRole("button", { name: pt ? "Negociações" : "Negotiations", exact: true });
          await negotiations.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await assertSmokeDialog(dialog, width);
          // A complete roster is not authentication or permission to trade.
          // This read-only fixture deliberately supplies no expectedAccountId.
          await expect(dialog.getByRole("status")).toHaveText(getExchangeNegotiationCopy(locale).error);
          await expect(dialog.getByRole("button")).toHaveCount(1);
          await expect(dialog.getByRole("button", { name: pt ? "Fechar" : "Close" })).toBeFocused();
          await page.keyboard.press("Tab");
          assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, "keyboard focus stays within dialog");
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
          assert.equal(overflow, false);
          const bounds = await dialog.boundingBox(); assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
          if (process.env.TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR) await page.screenshot({ path: `${process.env.TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR}/exchange-hub-${engine.name()}-${width}-${locale}-${status}-smoke.png` });
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0); await expect(negotiations).toBeFocused();
          if (status === "incomplete") for (const [name, content] of [[pt ? "Histórico de transferências" : "Transfer history", "Fictional Athlete"], [pt ? "Finanças do clube" : "Club finances", pt ? "Saldo disponível" : "Available balance"]]) {
            const trigger = page.getByRole("button", { name, exact: true }); await trigger.click();
            await expect(dialog).toContainText(content);
            await dialog.getByRole("button", { name: pt ? "Fechar" : "Close" }).click();
            await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
          }
          assert.deepEqual(errors, []); assert.deepEqual(requests, []);
          assert.equal(await page.evaluate("JSON.stringify(window.fixtureProps)"), JSON.stringify(props), "readonly dialogs preserve fictional inputs");
        } finally { await page.evaluate("window.unmountFixture()").catch(() => {}); await context.close(); }
      });
    }
  } finally { await browser.close(); }
});
