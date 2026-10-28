import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { cardEngineFixture, cardEnginePlayers, cardEngineBatches, cardEngineOverrides } from "./helpers/admin-card-engine-language-fixture.mts";

test("real Card Engine PT/EN tabs, payloads, denied errors, pending states and locale changes", {
  skip: process.env.TOUCHLINE_RUN_CARD_ENGINE_LANGUAGE_BROWSER !== "1", timeout: 120_000,
}, async () => {
  requireBrowserCapacity(process.cwd());
  const entry = "components/admin-card-engine-console.tsx";
  const out = process.env.TOUCHLINE_CARD_ENGINE_SCREENSHOTS === "1" ? mkdtempSync(`${tmpdir()}/admin-card-engine-language-`) : null;
  const bundle = bundleIsolatedBrowserFixture({ entryPath: entry, requiredSources: [entry, "lib/touchlineArena/auth-i18n.ts"],
    mountScript: `let revision=0;window.renderEngine=(options={})=>{if(!options.preserveState)revision++;
      flushSync(()=>root.render(React.createElement(loadEntry().AdminCardEngineConsole,{key:revision,locale:options.locale??'en-GB',players:options.empty?[]:${JSON.stringify(cardEnginePlayers)},batches:options.empty?[]:${JSON.stringify(cardEngineBatches)},overrides:options.empty?[]:${JSON.stringify(cardEngineOverrides)},migrationReady:options.ready!==false,playersAvailable:options.playersAvailable!==false})));};window.renderEngine();`,
  });
  const require = createRequire(import.meta.url), tailwind = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwind("@tailwindcss/node"), { Scanner } = tailwind("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles([entry, "app/(app)/admin/card-engine/page.tsx", "components/arena-admin-ui.tsx"].map(file => ({ content: readFileSync(file, "utf8"), extension: "tsx" })));
  const globals = path.resolve("app/globals.css");
  const css = (await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} })).build(candidates);
  const origin = "https://card-engine-language.invalid", text = "provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n123,UNCHANGED,9,1250000,ELITE";
  let actionCount = 0, renders = 0, failures = 0;
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
      const page = await context.newPage(), errors: string[] = [], requests: { method: string; body: unknown }[] = [];
      page.on("pageerror", error => errors.push(error.message));
      let mode = "ok", documents = 0, hold = false, release: (() => void) | null = null;
      await context.route("**/*", async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/") {
          documents++;
          return route.fulfill({ contentType: "text/html", body: `<meta charset="utf-8"><style>${css}body{margin:0;padding:16px;background:#07110e;color:#fff}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
        }
        assert.equal(url.pathname, "/api/admin/card-engine");
        assert.match(req.headers()["content-type"], /application\/json/);
        requests.push({ method: req.method(), body: req.postDataJSON() });
        if (hold) await new Promise<void>(resolve => { release = resolve; });
        if (mode === "network") return route.abort();
        if (mode === "malformed") return route.fulfill({ status: 502, body: "not json" });
        if (mode === "denied") return route.fulfill({ status: 403, json: { error: "Owner access required." } });
        if (mode === "private") return route.fulfill({ status: 409, json: { error: "PRIVATE_DATABASE_SENTINEL" } });
        return route.fulfill({ json: { ok: true, summary: { matched: 1200, review: 1, conflict: 0, unmatched: 0, PRIVATE_DIAGNOSTIC: "PRIVATE_DATABASE_SENTINEL" } } });
      });
      await page.goto(origin);
      const render = (options: Record<string, unknown>) => page.evaluate(options => (window as unknown as { renderEngine(options: unknown): void }).renderEngine(options), options);
      for (const locale of ["pt-BR", "en-GB"]) {
        const pt = locale === "pt-BR";
        const before = requests.length;
        const tab = (name: string) => page.getByRole("button", { name, exact: true });
        const bulk = pt ? "Importação em lote" : "Bulk Import", review = pt ? "Revisar e publicar" : "Review & Publish", overrides = pt ? "Ajustes editoriais" : "Overrides";
        const preview = pt ? "Somente prévia" : "Preview only";
        await render({ locale, empty: true });
        await expect(page.getByRole("status")).toContainText(pt ? "Nenhum candidato" : "No candidates");
        await tab(review).click(); await expect(page.getByRole("status")).toContainText(pt ? "Nenhum lote" : "No review batches");
        await tab(overrides).click(); await expect(page.getByRole("status")).toContainText(pt ? "Nenhum ajuste" : "No editorial overrides");
        await render({ locale, empty: true, playersAvailable: false, ready: false });
        await expect(page.getByRole("status")).toContainText(pt ? "indisponíveis" : "unavailable");
        await tab(bulk).click(); await expect(tab(preview)).toBeDisabled(); await expect(tab(pt ? "Criar lote para revisão" : "Create review batch")).toBeDisabled();
        assert.equal(requests.length, before, "empty and unavailable renders never dispatch");
        await render({ locale });
        await tab(pt ? "Abrir para revisão" : "Open safely").click();
        await expect(page.getByRole("textbox", { name: pt ? "Conteúdo da importação" : "Import content" })).toHaveValue("provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n123,,,,");
        await tab(review).click(); await expect(page.locator("#root")).toContainText(pt ? "1.200" : "1,200");
        await expect(page.locator("#root")).toContainText(pt ? "Rascunho" : "Draft");
        await expect(page.locator("#root")).toContainText("13:00:00");
        await tab(overrides).click(); await expect(page.locator("#root")).toContainText(pt ? "1.250.000" : "1,250,000");
        await expect(page.locator("#root")).toContainText("HISTORICAL_REASON_UNCHANGED");
        await expect(page.locator("#root")).not.toContainText("Invalid Date");
        for (const name of [pt ? "Qualidade dos dados" : "Data Quality", pt ? "Histórico de auditoria" : "Audit History"]) await tab(name).click();
        assert.equal(requests.length, before);
        for (const action of ["preview", "create", "approve", "publish", "rollback"] as const) {
          await render({ locale });
          if (action === "preview" || action === "create") {
            await tab(bulk).click();
            await page.getByRole("textbox", { name: pt ? "Conteúdo da importação" : "Import content" }).fill(text);
          } else await tab(review).click();
          const name = action === "preview" ? preview : action === "create" ? pt ? "Criar lote para revisão" : "Create review batch" : action === "approve" ? pt ? "Aprovar" : "Approve" : action === "publish" ? pt ? "Publicar" : "Publish" : pt ? "Reverter" : "Rollback";
          const documentCount = documents; hold = true; release = null;
          await tab(name).click(); await expect(tab(name)).toBeDisabled(); await expect(tab(name)).toHaveAttribute("aria-busy", "true");
          await expect.poll(() => release !== null).toBe(true); hold = false; (release as unknown as () => void)();
          const index = action === "approve" ? 0 : action === "publish" ? 1 : 2;
          assert.deepEqual(requests.at(-1), { method: action === "preview" || action === "create" ? "POST" : "PATCH", body: action === "preview" || action === "create" ? { action, text, sourceType: "paste", effectiveSeason: "2026-27" } : { action, batchId: cardEngineBatches[index].id } });
          if (action === "preview") {
            await expect(page.getByRole("status")).toContainText(pt ? "Prévia/resultado" : "Preview/result");
            await expect(page.locator("#root")).not.toContainText("PRIVATE_DATABASE_SENTINEL");
            await render({ locale: pt ? "en-GB" : "pt-BR", preserveState: true });
            await expect(page.getByRole("status")).toContainText(pt ? "Preview/result" : "Prévia/resultado");
            assert.equal(documents, documentCount);
          } else {
            await expect.poll(() => documents).toBe(documentCount + 1);
            await expect(tab("Inbox")).toBeVisible();
          }
          actionCount++;
        }
        await page.setViewportSize({ width: 390, height: 900 });
        for (const sourceType of ["single_edit", "csv"]) {
          await render({ locale });
          for (const name of [review, overrides, pt ? "Qualidade dos dados" : "Data Quality", pt ? "Histórico de auditoria" : "Audit History", bulk]) {
            await tab(name).focus(); await page.keyboard.press("Enter");
            await expect(tab(name)).toHaveAttribute("aria-pressed", "true");
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${name}: mobile overflow`);
          }
          let importText = text;
          if (sourceType === "single_edit") {
            await tab(pt ? "Edição individual" : "Single Edit").click();
            await page.getByRole("combobox").selectOption("123");
            importText = "provider_player_id,display_name,shirt_number,market_value_eur,card_template_key\n123,,,,";
          } else await page.locator('input[type="file"]').setInputFiles({ name: "fixture.csv", mimeType: "text/csv", buffer: Buffer.from(importText) });
          await page.getByRole("textbox", { name: pt ? "Conteúdo da importação" : "Import content" }).waitFor();
          await expect(page.getByRole("textbox", { name: pt ? "Conteúdo da importação" : "Import content" })).toHaveValue(importText);
          await page.getByRole("textbox", { name: pt ? "Temporada" : "Season", exact: true }).fill("2027-28");
          await tab(preview).click(); await expect(page.getByRole("status")).toContainText(pt ? "Prévia/resultado" : "Preview/result");
          assert.deepEqual(requests.at(-1), { method: "POST", body: { action: "preview", text: importText, sourceType, effectiveSeason: "2027-28" } });
          const writeCount = requests.length;
          await render({ locale: pt ? "en-GB" : "pt-BR", preserveState: true });
          await expect(page.getByRole("textbox", { name: pt ? "Import content" : "Conteúdo da importação" })).toHaveValue(importText);
          await expect(page.getByRole("textbox", { name: pt ? "Season" : "Temporada", exact: true })).toHaveValue("2027-28");
          assert.equal(requests.length, writeCount); actionCount++;
        }
        await page.setViewportSize({ width: 1280, height: 900 });
        for (const failure of ["denied", "private", "malformed", "network"]) {
          mode = failure; await render({ locale }); await tab(bulk).click();
          await tab(preview).click();
          await expect(page.getByRole("alert")).toContainText(failure === "denied" ? pt ? "Acesso do proprietário" : "Owner access" : pt ? "histórico de auditoria" : "audit history");
          await expect(page.locator("#root")).not.toContainText("PRIVATE_DATABASE_SENTINEL");
          const count = requests.length; await render({ locale: pt ? "en-GB" : "pt-BR", preserveState: true });
          await expect(page.getByRole("alert")).toContainText(failure === "denied" ? pt ? "Owner access" : "Acesso do proprietário" : pt ? "audit history" : "histórico de auditoria");
          assert.equal(requests.length, count); failures++;
        }
        mode = "ok";
        await render({ locale }); await tab(bulk).click();
        await page.locator('input[type="file"]').setInputFiles({ name: "too-large.csv", mimeType: "text/csv", buffer: Buffer.alloc(250001) });
        await expect(page.getByRole("alert")).toContainText("250 KB");
        for (const width of [390, 844, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const html = await cardEngineFixture().render({ lang: locale });
          await page.setContent(`<html lang="${locale}"><meta charset="utf-8"><style>${css}body{margin:0;padding:16px;background:#07110e;color:#fff}</style>${html}</html>`);
          await expect(page.getByRole("navigation")).toContainText(pt ? "Voltar ao Admin" : "Back to Admin");
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${width}: overflow`);
          if (out && width !== 844) assert.ok((await page.screenshot({ path: `${out}/${engine.name()}-${locale}-${width}.png`, fullPage: false })).byteLength > 0);
          renders++;
        }
        await page.goto(origin);
      }
      assert.deepEqual(errors, []); await context.close();
    } finally { await browser.close(); }
  }
  assert.equal(actionCount, 42); assert.equal(failures, 24); assert.equal(renders, 18);
  console.log(`Card Engine: ${actionCount} exact action payloads, ${failures} localized failures, ${renders} page renders; synthetic transport only; screenshots ${out ?? "not requested"}`);
});
