import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { ownerFixture } from "./helpers/admin-owner-page-fixture.mts";

test("real owner dashboard renders PT/EN navigation and error states across devices", {
  skip: process.env.TOUCHLINE_RUN_ADMIN_OWNER_BROWSER !== "1", timeout: 120_000,
}, async () => {
  const out = mkdtempSync(`${tmpdir()}/touchline-owner-language-`);
  const require = createRequire(import.meta.url), tailwind = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwind("@tailwindcss/node"), { Scanner } = tailwind("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles(["app/(app)/admin/page.tsx", "components/arena-admin-ui.tsx"].map(file => ({ content: readFileSync(file, "utf8"), extension: "tsx" })));
  const globals = path.resolve("app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = compiler.build(candidates);
  let cases = 0;
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"]) for (const width of [390, 844, 1280]) for (const state of ["empty", "populated", "error"]) {
        const failed = state === "error";
        const f = ownerFixture({ fail: failed, populated: state === "populated" });
        const markup = await f.render(locale);
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
        const page = await context.newPage(), errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await context.route("**/*", route => route.abort());
        await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px;background:#07110e}</style>${markup}</html>`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "pt-BR" ? "Painel do proprietário TouchLine" : "TouchLine Owner Panel");
        await expect(page.getByRole("link", { name: locale === "pt-BR" ? "Inventário de cards Arte, publicação e disponibilidade" : "Card Inventory Art, publication and supply", exact: true })).toHaveAttribute("href", `/admin/cards?lang=${locale}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${width}: horizontal overflow`);
        if (failed) await expect(page.getByText(locale === "pt-BR" ? "Os usuários autenticados estão temporariamente indisponíveis." : "Authenticated users are temporarily unavailable.", { exact: true })).toBeVisible();
        else if (state === "populated") await expect(page.getByText("Synthetic Member", { exact: true })).toBeVisible();
        else await expect(page.getByText(locale === "pt-BR" ? "Nenhum ClubOwner cadastrado ainda." : "No ClubOwners registered yet.", { exact: true })).toBeVisible();
        await page.screenshot({ path: `${out}/${engine.name()}-${locale}-${width}-${state}.png`, fullPage: true });
        assert.deepEqual(errors, []); cases++; await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(cases, 54);
  console.log(`Owner local matrix: ${cases} cases; source page and actual UI/CSS, synthetic external clients; no external requests.`);
});
