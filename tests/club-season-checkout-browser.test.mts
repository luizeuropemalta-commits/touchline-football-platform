import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium, firefox, webkit, expect, type Page } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const repo = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://season-checkout-fixture.invalid";
const output = "/tmp/touchline-season-visual";
const enabled = process.env.TOUCHLINE_RUN_SEASON_CHECKOUT_BROWSER === "1";
type Props = { mode: "plans" | "return"; locale: string; sessionId?: string; checkout?: "processing" | "cancelled" };
type FixtureWindow = Window & { renderSeasonFixture(props: Props): void; fixtureRefreshes: number };

async function render(page: Page, props: Props) {
  await page.evaluate(value => (window as unknown as FixtureWindow).renderSeasonFixture(value), props);
}
async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector("dialog");
    return { page: document.documentElement.scrollWidth - innerWidth,
      dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 0 };
  });
  assert.ok(geometry.page <= 1, `page horizontal overflow ${geometry.page}`);
  assert.ok(geometry.dialog <= 1, `dialog horizontal overflow ${geometry.dialog}`);
}

// Real components/styles and browser engines; routes and Next refresh are
// explicit synthetic boundaries. This is not authenticated or physical-device QA.
test("season checkout offers and return states render safely across PT/EN and three engines", { skip: !enabled, timeout: 300_000 }, async t => {
  requireBrowserCapacity(repo);
  mkdirSync(output, { recursive: true });
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/ClubSeasonCheckoutReturn.tsx",
    additionalEntryPaths: ["components/touchline/ClubOwnerPlanOnboarding.tsx"],
    requiredSources: ["components/touchline/ClubSeasonCheckoutReturn.tsx", "components/touchline/ClubOwnerPlanOnboarding.tsx",
      "components/touchline/ClubOwnerPlanOnboarding.module.css", "components/touchline/ClubOwnerPlanShowcase.module.css", "components/touchline/TouchlineGlobalNavigation.module.css"],
    allowSyntheticRouteRefresh: true,
    mountScript: `const Return=loadEntry().default,Plans=loadAdditionalEntry('components/touchline/ClubOwnerPlanOnboarding.tsx').default;
      window.fixtureRefreshes=0;window.onFixtureRouteRefresh=()=>{window.fixtureRefreshes++;};
      window.renderSeasonFixture=props=>flushSync(()=>root.render(props.mode==='plans'
        ?React.createElement(Plans,{open:true,locale:props.locale,activePlanKey:'standard',checkoutEnabled:true,checkoutOffers:{master:{amountMinor:4000}},onDismiss:()=>root.render(null)})
        :React.createElement(Return,{checkout:props.checkout||'processing',sessionId:props.sessionId||'cs_test_pending',locale:props.locale})));`,
  });
  const sourceHashes = Object.fromEntries(bundle.sources.map(source => {
    const bytes = readFileSync(path.join(repo, source)); assert.ok(bytes.length > 0, `source empty: ${source}`);
    return [source, createHash("sha256").update(bytes).digest("hex")];
  }));
  writeFileSync(path.join(output, "source-receipt.json"), JSON.stringify({ sources: sourceHashes,
    scope: "Isolated real components and CSS; mocked HTTP and refresh intent; not hosted/account/device proof" }, null, 2));
  const publicRoot = realpathSync(path.join(repo, "public"));
  const cases: { name: string; passed: boolean }[] = [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>*{box-sizing:border-box}body{margin:0;background:#07120e;color:#f6ffec;font:16px/1.5 Arial,sans-serif}button{font:inherit}
    #root{min-height:100dvh}${bundle.css}</style></head><body><div id="root"></div></body></html>`;
  for (const engine of [chromium, firefox, webkit]) {
    requireBrowserCapacity(repo); assert.ok(existsSync(engine.executablePath()), "installed browsers only");
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"]) for (const [width, height] of [[1440, 960], [1024, 768], [844, 390]]) {
        const name = `${engine.name()}-${locale}-${width}x${height}`;
        await t.test(name, async () => {
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 844 ? 2 : 1, serviceWorkers: "block" });
          try {
            const page = await context.newPage();
            const errors: string[] = [], unexpected: string[] = [], posts: unknown[] = [];
            const statusCounts = new Map<string, number>();
            let releaseCheckout: (() => void) | undefined, statusMode = "pending";
            page.on("pageerror", error => errors.push(error.message));
            await context.route("**/*", async route => {
              const request = route.request(), url = new URL(request.url());
              if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
              if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: html });
              if (url.pathname === "/api/touchline-fantasy/season-checkout" && request.method() === "POST") {
                posts.push(request.postDataJSON());
                await new Promise<void>(resolve => { releaseCheckout = resolve; });
                return route.fulfill({ status: 503, json: { ok: false } });
              }
              if (url.pathname === "/api/touchline-fantasy/season-checkout/status" && request.method() === "GET") {
                const session = url.searchParams.get("session_id")!; statusCounts.set(session, (statusCounts.get(session) ?? 0) + 1);
                if (statusMode === "timeout") return; // Browser abort deadline is advanced through Playwright's clock.
                return route.fulfill({ json: { ok: true, status: statusMode } });
              }
              const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
              if (request.method() === "GET" && asset.startsWith(publicRoot + path.sep) && existsSync(asset)
                && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep) && /\.(png|webp|svg|jpe?g)$/i.test(asset)) {
                const bytes = readFileSync(asset); assert.ok(bytes.length > 0, `asset empty: ${asset}`);
                const extension = path.extname(asset).toLowerCase();
                return route.fulfill({ body: bytes, contentType: extension === ".svg" ? "image/svg+xml" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : `image/${extension.slice(1)}` });
              }
              unexpected.push(request.url()); return route.abort();
            });
            await page.goto(`${origin}/fixture`); await page.clock.install();
            await page.addScriptTag({ content: `(() => {${bundle.script}})()` });
            await render(page, { mode: "plans", locale });
            await page.getByRole("button", { name: locale === "pt-BR" ? "Ver benefícios: Master" : "View benefits: Master", exact: true }).click();
            const quote = page.locator('[data-checkout-quote="master"]');
            await expect(quote).toContainText(locale === "pt-BR" ? "40,00" : "40.00");
            await expect(quote).not.toContainText(/89[,.]90/); await quote.scrollIntoViewIfNeeded(); await noOverflow(page);
            await page.screenshot({ path: path.join(output, `${name}-offer.png`) });
            await page.getByRole("button", { name: locale === "pt-BR" ? "Continuar para pagamento de teste" : "Continue to test checkout", exact: true }).click();
            await expect(page.getByRole("button", { name: locale === "pt-BR" ? "Preparando pagamento de teste…" : "Preparing test checkout…", exact: true })).toBeDisabled();
            await expect.poll(() => posts.length).toBe(1); assert.deepEqual(posts[0], { plan: "master", expectedAmountMinor: 4000 });
            await noOverflow(page); await page.screenshot({ path: path.join(output, `${name}-checkout-loading.png`) });
            releaseCheckout!(); await expect(page.getByRole("alert")).toBeVisible();

            // Mount the actual return component without recreating the browser.
            await render(page, { mode: "return", locale, sessionId: "cs_test_pending" });
            await expect(page.locator('[data-season-checkout-return="pending"]')).toBeVisible();
            await expect.poll(() => statusCounts.get("cs_test_pending")).toBe(1);
            await noOverflow(page); await page.screenshot({ path: path.join(output, `${name}-return-pending.png`) });
            statusMode = "paid"; await page.clock.runFor(3_010);
            await expect(page.locator('[data-season-checkout-return="paid"]')).toBeVisible();
            assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureRefreshes), 1);
            await page.clock.runFor(30_000); assert.equal(statusCounts.get("cs_test_pending"), 2);
            assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureRefreshes), 1); await noOverflow(page);
            await page.screenshot({ path: path.join(output, `${name}-return-paid.png`) });

            statusMode = "timeout"; await render(page, { mode: "return", locale, sessionId: "cs_test_timeout" });
            await expect.poll(() => statusCounts.get("cs_test_timeout")).toBe(1); await page.clock.runFor(8_010);
            await expect(page.locator('[data-season-checkout-return="unavailable"]')).toBeVisible(); await noOverflow(page);
            await page.screenshot({ path: path.join(output, `${name}-return-timeout.png`) });
            statusMode = "review";
            await page.getByRole("button", { name: locale === "pt-BR" ? "Verificar novamente" : "Check again", exact: true }).click();
            await expect(page.locator('[data-season-checkout-return="review"]')).toBeVisible();
            await expect(page.getByRole("status")).not.toContainText(locale === "pt-BR" ? "Pagamento de teste confirmado" : "Test payment confirmed");
            assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).fixtureRefreshes), 1); await noOverflow(page);
            await page.screenshot({ path: path.join(output, `${name}-return-review.png`) });
            assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
            cases.push({ name, passed: true });
          } finally { await context.close(); }
        });
      }
    } finally { await browser.close(); }
  }
  writeFileSync(path.join(output, "result-receipt.json"), JSON.stringify({ cases, expectedCases: 18 }, null, 2));
  assert.equal(cases.length, 18); t.diagnostic(`18 real browser/viewport/language cases; screenshots and receipts: ${output}`);
});
