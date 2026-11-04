import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const enabled = process.env.TOUCHLINE_RUN_ADMIN_MOBILE_BROWSER_TESTS === "1";
const engineName = process.env.TOUCHLINE_ADMIN_MOBILE_BROWSER_ENGINE ?? "webkit";
assert.ok(["chromium", "webkit"].includes(engineName));

// Compile installed Tailwind utilities from the actual bundled JSX literals.
// The test does not replace product layout rules with a handwritten facsimile.
async function fixtureStyles(sources: string[], modules: string) {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(dirname(require.resolve("tailwindcss")));
  const candidates = new Set<string>();
  for (const file of sources.filter(file => file.endsWith(".tsx"))) {
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        for (const token of node.text.split(/\s+/)) if (token) candidates.add(token);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const compiler = await require("tailwindcss").compile(readFileSync(join(packageRoot, "theme.css"), "utf8") + "\n@tailwind utilities;");
  const globals = readFileSync("app/globals.css", "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
  return readFileSync(join(packageRoot, "preflight.css"), "utf8") + compiler.build([...candidates]) + globals + modules;
}

function contrast(a: number[], b: number[]) {
  const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test(`admin mobile (${engineName}): actual shell focus, Escape, resize, readable text and labelled native fields`, { skip: !enabled, timeout: 150_000 }, async () => {
  requireBrowserCapacity(process.cwd(), { darwinFreePercent: true, allowModerateDarwinPressure: process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" });
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/AdminMobileBrowserFixture.tsx", cssPrefix: "adminmobile",
    requiredSources: ["components/arena-admin-shell.tsx", "components/arena-admin-shell.module.css", "components/admin-card-inventory-actions.tsx", "components/admin-promotions-actions.tsx", "components/touchline/a11y/TouchlineDialog.tsx"],
    mountScript: "flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(loadEntry().default))));document.addEventListener('click',e=>{const link=e.target.closest?.('a');if(link){window.fixtureNavigation=link.getAttribute('href');e.preventDefault();}});",
  });
  const css = await fixtureStyles(bundle.sources, bundle.css);
  const screenshots = mkdtempSync(join(tmpdir(), `touchline-admin-mobile-${engineName}-`));
  console.info("Synthetic browser evidence:", screenshots);
  const browser = await (engineName === "webkit" ? webkit : chromium).launch({ headless: true });
  try {
    // Narrow pointer-fine viewports exercise layout below the desktop breakpoint.
    // Real coarse-touch mode uses landscape, respecting the product orientation gate.
    for (const locale of ["pt-BR", "en-GB"] as const) for (const width of [320, 390, 844]) {
      const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, hasTouch: width === 844, isMobile: width === 844, deviceScaleFactor: 2, serviceWorkers: "block" });
      try {
        const page = await context.newPage(); const errors: string[] = []; const writes: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => {
          const request = route.request();
          if (request.method() !== "GET") writes.push(request.method());
          if (!request.isNavigationRequest()) return route.abort();
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><button id="outside">Outside fixture</button><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script></html>` });
        });
        await page.goto(`https://admin-mobile.invalid/admin/cards?lang=${locale}`);
        const trigger = page.getByRole("button", { name: locale === "pt-BR" ? "Abrir menu" : "Open menu", exact: true, includeHidden: true });
        assert.deepEqual(errors, [], "Fixture boot errors");
        const localeSelect = page.locator(".auth-language-switcher select");
        await expect(localeSelect).toHaveCount(1);
        const closeName = locale === "pt-BR" ? "Fechar menu" : "Close menu";
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        const names = locale === "pt-BR" ? ["Estado do card", "Disponibilidade", "Estado da arte", "Cor da moldura", "Nome da promoção", "Descrição", "Estado da promoção", "ID do usuário ClubOwner", "Valor em TC", "Motivo obrigatório", "Chave de idempotência (opcional)"] : ["Card status", "Availability", "Artwork status", "Frame colour", "Promotion name", "Description", "Promotion status", "ClubOwner user ID", "Amount in TC", "Required reason", "Idempotency key (optional)"];
        for (const name of names) {
          const control = page.getByLabel(name, { exact: true });
          assert.equal(await control.count(), 1, JSON.stringify({name, labels: await page.locator("label").evaluateAll(nodes => nodes.map(n => ({text:n.textContent,for:(n as HTMLLabelElement).htmlFor}))), errors}));
          assert.ok((await control.boundingBox())!.height >= 44, `${engineName}/${width}/${name}`);
          assert.equal(await control.evaluate(n => getComputedStyle(n).fontSize), "16px");
        }
        assert.equal(await page.locator("#secondary-copy").evaluate(n => getComputedStyle(n).fontSize), "14px");
        const colour = await page.locator("#secondary-copy").evaluate(n => getComputedStyle(n).color);
        assert.ok(contrast(colour.match(/\d+/g)!.map(Number), [26, 49, 68]) >= 4.5, colour);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (locale === "pt-BR" && width === 390) await page.screenshot({ path: join(screenshots, "fields-390.png"), fullPage: true });
        await trigger.click();
        const dialog = page.getByRole("dialog"); const close = dialog.getByRole("button", { name: closeName, exact: true });
        await expect(close).toBeFocused(); await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(localeSelect).toHaveCount(1);
        await expect(localeSelect).toBeVisible();
        await expect(localeSelect).toHaveAttribute("aria-label", locale === "pt-BR" ? "Selecionar idioma" : "Select language");
        assert.deepEqual(await localeSelect.locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value)), ["pt-BR", "en-GB"]);
        assert.ok((await localeSelect.boundingBox())!.height >= 44);
        // Missing fixture auth deliberately blocks persistence; no account write is simulated.
        await expect(localeSelect).toBeDisabled();
        assert.equal(await page.locator("#outside").evaluate(n => (n as HTMLElement).inert), true);
        assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "hidden");
        if (width === 844) assert.equal(await dialog.locator("aside").evaluate(n => getComputedStyle(n).backdropFilter), "none");
        if (locale === "pt-BR" && width === 390) await page.screenshot({ path: join(screenshots, "menu-390.png") });
        for (let i = 0; i < 20; i++) {
          await page.keyboard.press("Tab");
          assert.ok(await dialog.evaluate(n => n.contains(document.activeElement)), "Tab escaped modal navigation");
        }
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        await expect.poll(() => page.locator("#outside").evaluate(n => (n as HTMLElement).inert), { timeout: 1000 }).toBe(false);
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow), { timeout: 1000 }).not.toBe("hidden");
        await trigger.click(); await expect(dialog).toBeVisible();
        await page.setViewportSize({ width: 1280, height: 800 });
        await expect(dialog).toHaveCount(0);
        await expect(localeSelect).toHaveCount(1);
        // Wait for the passive dialog cleanup, not only its preceding DOM commit.
        await expect.poll(() => page.locator("#outside").evaluate(n => (n as HTMLElement).inert), { timeout: 1000 }).toBe(false);
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow), { timeout: 1000 }).not.toBe("hidden");
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await trigger.click(); await expect(dialog).toBeVisible();
        await dialog.getByRole("link", { name: locale === "pt-BR" ? "Atividade Telemetria própria TouchLine" : "Activity First-party TouchLine telemetry", exact: true }).click();
        await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        assert.equal(await page.evaluate(() => (window as Window & { fixtureNavigation?: string }).fixtureNavigation), `/admin/analytics?lang=${locale}`);
        assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
