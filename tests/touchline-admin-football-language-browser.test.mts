import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { footballDataFixture } from "./helpers/admin-football-page-fixture.mts";

test("real football Admin renders official data and safe synchronization controls in both languages", {
  skip: process.env.TOUCHLINE_RUN_ADMIN_FOOTBALL_BROWSER !== "1", timeout: 120_000,
}, async () => {
  requireBrowserCapacity(process.cwd());
  const out = mkdtempSync(`${tmpdir()}/touchline-football-language-`);
  const require = createRequire(import.meta.url), tailwind = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwind("@tailwindcss/node"), { Scanner } = tailwind("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles(["app/(app)/admin/football-data/page.tsx", "components/arena-admin-ui.tsx", "components/admin-football-data-sync-controls.tsx", "components/admin-football-roster-controls.tsx", "components/ui.tsx"].map(file => ({ content: readFileSync(file, "utf8"), extension: "tsx" })));
  const globals = path.resolve("app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = compiler.build(candidates);
  let cases = 0;
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"]) for (const width of [390, 844, 1280]) for (const state of ["empty", "populated", "error"]) {
        const failed = state === "error";
        const f = footballDataFixture({ state: state as "empty" | "populated" | "error" });
        const markup = await f.render(locale);
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
        const page = await context.newPage(), errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await context.route("**/*", route => route.abort());
        await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px;background:#07110e}</style>${markup}</html>`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "pt-BR" ? "Base de dados de futebol" : "Football Data Foundation");
        await expect(page.getByRole("link", { name: locale === "pt-BR" ? "Administração" : "Owner Admin", exact: true })).toHaveAttribute("href", `/admin?lang=${locale}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${width}: horizontal overflow`);
        if (failed) await expect(page.getByText(locale === "pt-BR" ? "Não foi possível consultar os clubes." : "Normalized clubs could not be read.", { exact: true })).toBeVisible();
        else if (state === "populated") await expect(page.getByText("Synthetic Player", { exact: true })).toBeVisible();
        else await expect(page.getByText(locale === "pt-BR" ? "Nenhuma competição foi importada ainda." : "No competitions normalized yet.", { exact: true })).toBeVisible();
        const clipped = await page.locator("[data-football-layout]").evaluateAll(elements => elements.filter(el => {
          const rect = el.getBoundingClientRect(), panel = el.closest("section")!.getBoundingClientRect();
          return rect.right > panel.right + 1 || rect.left < panel.left - 1 || el.scrollWidth > el.clientWidth + 1;
        }).map(el => el.getAttribute("data-football-layout")));
        assert.deepEqual(clipped, [], `${engine.name()}/${locale}/${width}: internal clipping`);
        if (state === "populated" && width !== 844) await page.screenshot({ path: `${out}/${engine.name()}-${locale}-${width}-${state}.png`, fullPage: true });
        await expect(page.getByRole("button", { name: locale === "pt-BR" ? "Atualizar jogos e notas" : "Update fixtures and ratings", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: locale === "pt-BR" ? "Reconciliação contínua de elencos" : "Continuous roster reconciliation", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: locale === "pt-BR" ? "Capturar observação" : "Capture observation", exact: true })).toBeDisabled();
        assert.equal(await page.getByRole("button", { name: /20.*QA/ }).count(), 0);
        await expect(page.getByRole("link", { name: locale === "pt-BR" ? "Busca de futebol" : "Football Search", exact: true })).toHaveAttribute("href", `/football-search?lang=${locale}`);
        assert.deepEqual(errors, []); cases++; await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(cases, 54);
  console.log(`Football local matrix: ${cases} SSR cases; source page and actual UI/CSS including roster loading/disabled state, synthetic external clients; no external requests. Roster hydration/actions covered separately by roster-reconciliation-browser.test.mts. Evidence: ${out}`);
});
