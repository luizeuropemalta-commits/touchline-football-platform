import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const require = createRequire(import.meta.url);
test("owner current-data control uses the real UI without old dates, duplicate clicks or false partial success", { timeout: 90_000 }, async t => {
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/admin-football-data-sync-controls.tsx", allowSyntheticRouteRefresh: true,
    requiredSources: ["components/ui.tsx"],
    mountScript: `flushSync(()=>root.render(React.createElement(loadEntry().FootballDataSyncControls,{locale:document.documentElement.lang,allowQaMaintenance:false})));`,
  });
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles(bundle.sources.filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(f, "utf8"), extension: path.extname(f).slice(1) })));
  const globals = path.resolve("app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  const css = compiler.build(candidates) + bundle.css;
  const output = process.env.TOUCHLINE_ADMIN_SYNC_EVIDENCE_DIR;
  if (output) mkdirSync(output, { recursive: true });
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const locale of ["pt-BR", "en-GB"]) {
        const page = await browser.newPage({ viewport: { width: 844, height: 600 }, reducedMotion: "reduce" });
        const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
        await page.route("**/*", route => route.abort());
        await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body style="background:#081613"><div id="root"></div></body></html>`);
        await page.addScriptTag({ content: `window.calls=[];window.refreshes=0;window.onFixtureRouteRefresh=()=>window.refreshes++;window.fetch=(url,options)=>{window.calls.push({url,method:options.method});return new Promise(resolve=>window.finishSync=resolve)};${bundle.script}` });
        const button = page.getByRole("button", { name: locale === "pt-BR" ? "Atualizar jogos e notas" : "Update fixtures and ratings", exact: true });
        assert.ok(!await page.locator("body").innerText().then(text => text.includes("2026-08")));
        assert.equal(await page.getByRole("button", { name: /20.*QA/ }).count(), 0, "QA-only repair controls are absent without capability");
        for (const outcome of ["success", "skipped", "partial", "error"] as const) {
          await button.click();
          await expect(page.getByRole("button", { name: locale === "pt-BR" ? "Atualizando…" : "Updating…", exact: true })).toBeDisabled();
          await page.evaluate(() => document.querySelector("button")?.click());
          assert.equal(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls.length), 1, "pending click cannot enqueue another request");
          await page.evaluate(outcome => {
            const w = window as unknown as { finishSync: (response: Response) => void };
            w.finishSync(new Response(JSON.stringify({ ok: outcome === "success" || outcome === "skipped", status: outcome, runId: "confirmed-run", fixturesUpdated: 2, issueCount: outcome === "partial" ? 1 : 0 }), { status: outcome === "partial" ? 502 : outcome === "error" ? 503 : 200 }));
          }, outcome);
          await expect(button).toBeEnabled();
          const text = await page.getByRole("status").innerText();
          if (outcome === "success") assert.match(text, /2 (jogos|fixtures)/);
          if (outcome === "skipped") assert.match(text, /Nenhuma nova execução|No new run/);
          if (outcome === "partial") assert.match(text, /Atualização parcial|Partial update/);
          if (outcome === "error") assert.match(text, /não confirmada|not confirmed/);
          assert.deepEqual(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls), [{ url: "/api/admin/football-data/sync", method: "POST" }]);
          await page.evaluate(() => { (window as unknown as { calls: unknown[] }).calls = []; });
        }
        assert.equal(await page.evaluate(() => (window as unknown as { refreshes: number }).refreshes), 3, "success, skipped and confirmed partial refresh the history; unknown outcome does not claim success");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
        if (output) await page.screenshot({ path: path.join(output, `${engine.name()}-${locale}.png`) });
        assert.deepEqual(errors, []); await page.close();
      }
    } finally { await browser.close(); }
  }
  t.diagnostic("Real component, shared button and CSS; isolated transport and refresh intent only, not authenticated hosted sync.");
});
