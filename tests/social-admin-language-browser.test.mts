import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { socialAdminFixture } from "./helpers/social-admin-language-fixture.mts";

test("social Admin real render and actions preserve PT/EN payloads, denied/error states and approval locks", {
  skip: process.env.TOUCHLINE_RUN_SOCIAL_ADMIN_LANGUAGE_BROWSER !== "1", timeout: 120_000,
}, async () => {
  const entry = "components/touchline/admin/TouchlineSocialDraftReviewActions.tsx";
  const delivery = "components/touchline/admin/TouchlineSocialDeliveryControlActions.tsx";
  const template = "components/touchline/admin/TouchlineSocialTemplatePolicyActions.tsx";
  const out = process.env.TOUCHLINE_SOCIAL_ADMIN_SCREENSHOTS === "1" ? mkdtempSync(`${tmpdir()}/social-admin-language-`) : null;
  const bundle = bundleIsolatedBrowserFixture({ entryPath: entry, additionalEntryPaths: [delivery, template], requiredSources: [entry, delivery, template], allowSyntheticRouteRefresh: true,
    mountScript: `window.refreshes=0;window.onFixtureRouteRefresh=()=>window.refreshes++;let revision=0;
      window.renderSocial=(options={})=>{const locale=options.locale??'en-GB';if(!options.preserveState)revision++;
        flushSync(()=>root.render(React.createElement('main',{key:revision,lang:locale},
          React.createElement('section',{id:'draft'},React.createElement(loadEntry().default,{locale,draftId:'draft-1',manifestChecksum:'sha256:manifest',artifactChecksum:'sha256:art',captionChecksum:'sha256:caption',artworkPreviewUrl:options.missing?null:'/art.png'+(options.imageFail?'?fail=1':''),artworkPreviewAlt:'Synthetic PNG',artworkApproved:!!options.approved,captionApproved:!!options.approved,generationCurrent:options.current!==false})),
          React.createElement('section',{id:'delivery'},React.createElement(loadAdditionalEntry(${JSON.stringify(delivery)}).default,{locale,scopeKey:'GLOBAL',killSwitchEngaged:options.engaged!==false,dailyQuota:7,minimumGapSeconds:90})),
          React.createElement('section',{id:'template'},React.createElement(loadAdditionalEntry(${JSON.stringify(template)}).default,{locale,templateId:'template-1',templateIdentityChecksum:'sha256:identity',visualTemplateChecksum:'sha256:visual',baseCopyChecksum:'sha256:copy',state:options.state??'TEMPLATE_APPROVED',artworkApproved:!!options.templateApproved,captionApproved:!!options.templateApproved}))
        )));};window.renderSocial();`,
  });
  const require = createRequire(import.meta.url), tailwind = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwind("@tailwindcss/node"), { Scanner } = tailwind("@tailwindcss/oxide");
  const files = [entry, delivery, template, "app/(app)/admin/social-publications/page.tsx", "components/arena-admin-ui.tsx"];
  const candidates = new Scanner({ sources: [] }).scanFiles(files.map(file => ({ content: readFileSync(file, "utf8"), extension: "tsx" })));
  const globals = path.resolve("app/globals.css");
  const css = (await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} })).build(candidates);
  const origin = "https://social-admin-language.invalid";
  const png = await sharp({ create: { width: 4, height: 5, channels: 4, background: "#123456" } }).png().toBuffer();
  let renders = 0, actions = 0;
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 844, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
      const page = await context.newPage(), errors: string[] = [], requests: { url: string; body: unknown }[] = [];
      page.on("pageerror", error => errors.push(error.message));
      let responseMode = "ok";
      let holdResponse = false;
      let releaseResponse: (() => void) | null = null;
      await context.route("**/*", async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<meta charset="utf-8"><style>${css}body{margin:0;padding:16px;background:#07110e}section{margin-bottom:16px}img{max-height:100px}</style><div id="root"></div><script>${bundle.script.replace(/<\/script/gi, "<\\/script")}</script>` });
        if (url.pathname === "/art.png") return url.search ? route.fulfill({ status: 500, body: "" }) : route.fulfill({ contentType: "image/png", body: png });
        assert.ok(["/api/admin/social-publications/review", "/api/admin/social-publications/template-policy"].includes(url.pathname));
        assert.equal(req.method(), "POST");
        assert.match(req.headers()["content-type"], /application\/json/);
        requests.push({ url: url.pathname, body: req.postDataJSON() });
        if (holdResponse) await new Promise<void>(resolve => { releaseResponse = resolve; });
        if (responseMode === "network") return route.abort();
        if (responseMode === "malformed") return route.fulfill({ status: 502, body: "not json" });
        return route.fulfill(responseMode === "denied" ? { status: 403, json: { ok: false, error: "Owner access required." } }
          : responseMode === "conflict" ? { status: 409, json: { ok: false, error: "The reviewed content changed; review the current revision again." } }
          : { json: { ok: true } });
      });
      await page.goto(origin);
      const render = (options: Record<string, unknown>) => page.evaluate(options => (window as unknown as { renderSocial(options: unknown): void }).renderSocial(options), options);
      for (const locale of ["pt-BR", "en-GB"]) {
        const pt = locale === "pt-BR";
        await render({ locale, current: false });
        await expect(page.locator("#draft button").nth(0)).toBeDisabled();
        await expect(page.locator("#draft button").nth(1)).toBeDisabled();
        await expect(page.locator("#draft [role=alert]").filter({ hasText: pt ? "fonte oficial" : "official source" })).toBeVisible();
        const before = requests.length;
        await render({ locale, imageFail: true });
        await expect(page.locator("#draft [role=alert]")).toContainText(pt ? "não carregou" : "did not load");
        await expect(page.locator("#draft button").nth(0)).toBeDisabled();
        await render({ locale, missing: true });
        await expect(page.locator("#draft")).toContainText(pt ? "Arte imutável indisponível" : "Immutable artwork unavailable");
        await render({ locale, approved: true, state: "REVOKED" });
        for (const button of await page.locator("#draft button, #template button").all()) await expect(button).toBeDisabled();
        assert.equal(requests.length, before, "rendering and disabled states never mutate");

        const cases = [
          { section: "draft", index: 0, options: {}, body: { action: "approve-artwork", draftId: "draft-1", expectedChecksum: "sha256:art", expectedManifestChecksum: "sha256:manifest" } },
          { section: "draft", index: 1, options: {}, body: { action: "approve-caption", draftId: "draft-1", expectedChecksum: "sha256:caption", expectedManifestChecksum: "sha256:manifest" } },
          { section: "delivery", index: 0, options: {}, body: { action: "set-delivery-control", scopeKey: "GLOBAL", killSwitchEngaged: false, dailyQuota: 7, minimumGapSeconds: 90 } },
          { section: "delivery", index: 0, options: { engaged: false }, body: { action: "set-delivery-control", scopeKey: "GLOBAL", killSwitchEngaged: true, dailyQuota: 7, minimumGapSeconds: 90 } },
          ...["approve-template-artwork", "approve-template-caption", "enable-auto-publish", "pause-template", "revoke-template"].map((action, index) => ({ section: "template", index, options: { templateApproved: index >= 2 }, body: {
            action, templateId: "template-1", expectedIdentityChecksum: "sha256:identity", ...(index < 2 ? { expectedContentChecksum: index === 0 ? "sha256:visual" : "sha256:copy" } : {}),
          } })),
        ];
        for (const c of cases) {
          await render({ locale, ...c.options });
          const button = page.locator(`#${c.section} button`).nth(c.index);
          await expect(button).toBeEnabled();
          const refreshes = await page.evaluate(() => (window as unknown as { refreshes: number }).refreshes);
          holdResponse = true; releaseResponse = null;
          await button.click();
          await expect(button).toHaveAttribute("aria-busy", "true");
          await expect(button).toBeDisabled();
          await expect.poll(() => releaseResponse !== null).toBe(true);
          holdResponse = false;
          (releaseResponse as unknown as () => void)();
          await expect.poll(() => page.evaluate(() => (window as unknown as { refreshes: number }).refreshes)).toBe(refreshes + 1);
          assert.deepEqual(requests.at(-1)?.body, c.body);
          assert.equal(requests.at(-1)?.url, c.section === "draft" ? "/api/admin/social-publications/review" : "/api/admin/social-publications/template-policy");
          const status = page.locator(`#${c.section} [aria-live=polite]`);
          await expect(status).not.toBeEmpty();
          assert.doesNotMatch(await status.innerText(), pt ? /updated successfully|approved for|Emergency pause/ : /aprovada|atualizada|acionado|liberado/);
          const oldMessage = await status.innerText(), writeCount = requests.length;
          await render({ ...c.options, locale: pt ? "en-GB" : "pt-BR", preserveState: true });
          await expect(status).not.toBeEmpty();
          await expect(status).not.toHaveText(oldMessage);
          assert.doesNotMatch(await status.innerText(), pt ? /aprovada|atualizada|acionado|liberado/ : /updated successfully|approved for|Emergency pause/);
          assert.equal(requests.length, writeCount, "locale change must not repeat a mutation");
          assert.equal(await page.evaluate(() => (window as unknown as { refreshes: number }).refreshes), refreshes + 1);
          actions++;
        }
        for (const section of ["draft", "delivery", "template"]) for (const mode of ["denied", "conflict", "malformed", "network"]) {
          responseMode = mode; await render({ locale });
          const refreshes = await page.evaluate(() => (window as unknown as { refreshes: number }).refreshes);
          const button = page.locator(`#${section} button`).nth(section === "draft" ? 1 : 0);
          await button.click();
          const status = page.locator(`#${section} [aria-live=polite]`);
          await expect(status).toContainText(mode === "denied" ? pt ? "Acesso do proprietário" : "Owner access"
            : mode === "conflict" ? pt ? "conteúdo revisado mudou" : "reviewed content changed"
            : pt ? "Confira o histórico" : "Check its history");
          await expect(button).toBeEnabled();
          assert.equal(await page.evaluate(() => (window as unknown as { refreshes: number }).refreshes), refreshes);
          const writeCount = requests.length;
          await render({ locale: pt ? "en-GB" : "pt-BR", preserveState: true });
          await expect(status).toContainText(mode === "denied" ? pt ? "Owner access" : "Acesso do proprietário"
            : mode === "conflict" ? pt ? "reviewed content changed" : "conteúdo revisado mudou"
            : pt ? "Check its history" : "Confira o histórico");
          assert.equal(requests.length, writeCount, "locale change must preserve the error without retrying");
        }
        responseMode = "ok";
        for (const width of [390, 844, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const markup = await socialAdminFixture({ invalidDates: true }).render({ lang: locale, draftPage: "1", reviewPage: "1" });
          await page.setContent(`<html lang="${locale}"><meta charset="utf-8"><style>${css}body{margin:0;padding:16px;background:#07110e}</style>${markup}</html>`);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(pt ? "Publicações sociais" : "Social publications");
          await expect(page.getByRole("navigation", { name: pt ? "Idioma" : "Language", exact: true }).getByRole("link", { name: pt ? "Português" : "English" })).toHaveAttribute("aria-current", "page");
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine.name()}/${locale}/${width}: overflow`);
          const screenshot = await page.screenshot({ ...(out && width !== 844 ? { path: `${out}/${engine.name()}-${locale}-${width}.png` } : {}), fullPage: false });
          assert.ok(screenshot.byteLength > 0); renders++;
        }
        await page.goto(origin);
      }
      assert.deepEqual(errors, []); await context.close();
    } finally { await browser.close(); }
  }
  assert.equal(actions, 54); assert.equal(renders, 18);
  console.log(`Social Admin: ${renders} real-page render cases, ${actions} exact action payloads, 72 localized failure cases. Synthetic transport only. Screenshots: ${out ?? "in-memory only"}`);
});
