import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
function harness(locale: string) {
  const react = dirname(require.resolve("react")), dom = dirname(require.resolve("react-dom/client"));
  const scheduler = dirname(createRequire(require.resolve("react-dom/client")).resolve("scheduler"));
  const modules: Record<string, string> = {
    react: readFileSync(join(react, "cjs/react.development.js"), "utf8"),
    "react/jsx-runtime": readFileSync(join(react, "cjs/react-jsx-runtime.development.js"), "utf8"),
    "react-dom": readFileSync(join(dom, "cjs/react-dom.development.js"), "utf8"),
    "react-dom/client": readFileSync(join(dom, "cjs/react-dom-client.development.js"), "utf8"),
    scheduler: readFileSync(join(scheduler, "cjs/scheduler.development.js"), "utf8"),
  };
  function bundle(path: string): string {
    if (modules[path]) return path;
    if (path.endsWith(".css")) { modules[path] = 'exports.default=new Proxy({},{get:(_,key)=>String(key)});'; return path; }
    modules[path] = "";
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    modules[path] = code.replace(/require\("([^"]+)"\)/g, (all, id: string) => {
      if (!id.startsWith(".") && !id.startsWith("@/")) return all;
      let target = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(path), id);
      if (!/\.(ts|tsx|css)$/.test(target)) target += ".ts";
      return `require(${JSON.stringify(bundle(target))})`;
    });
    return path;
  }
  const entry = bundle(join(root, "components/touchline/ClubHubFixtureStrip.tsx"));
  const css = readFileSync(join(root, "components/touchline/ClubHubFixtureStrip.module.css"), "utf8") + readFileSync(join(root, "components/touchline/TouchlineGlobalNavigation.module.css"), "utf8");
  const defs = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#08100c;color:white;padding:10px}img{width:100%;height:100%}${css}</style><div id="root"></div><script>
  const process={env:{NODE_ENV:'development'}},modules={${defs}},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
  const React=require('react');require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(entry)}).default,{locale:${JSON.stringify(locale)},draftLocalesEnabled:true}));
  </script>`;
}

test("compact strip shows only correctly-proportioned crests and match values with accessible motion", { timeout: 90_000 }, async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [width, locale] of [[1280, "pt-BR"], [390, "pt-BR"], [390, "ar-SA"]] as const) {
        const page = await browser.newPage({ viewport: { width, height: 260 }, reducedMotion: "reduce" });
        const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
        await page.route("**/*", route => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith(".png")) return route.fulfill({ contentType: "image/png", body: readFileSync(join(root, "public", path)) });
          if (path === "/api/football-data/fantasy/livescores") return route.fulfill({ json: { ok: true, state: "partial-persisted-schedule", degraded: true, data: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), providerId: String(i + 1), status: i === 0 ? "FullTime" : "Not started", startsAt: "2030-10-09T18:00:00Z", homeScore: 2, awayScore: 1, homeTeam: { id: "19", providerId: "19", name: "Arsenal", logoUrl: "/touchlineArena/shared/club-logos/2026-27/arsenal.png" }, awayTeam: { id: "71", providerId: "71", name: "Leeds", logoUrl: "/touchlineArena/shared/club-logos/2026-27/leeds-united.png" } })) } });
          return route.fulfill({ contentType: "text/html", body: harness(locale) });
        });
        await page.goto("http://fixture-strip.test/");
        await expect(page.locator(".fixture")).toHaveCount(10);
        await page.waitForFunction(() => [...document.querySelectorAll("img")].every(img => img.complete && img.naturalWidth > 0));
        assert.equal(await page.locator("header").count(), 0);
        assert.equal(await page.locator(".fixture").first().innerText(), "2 – 1");
        const dimensions = await page.locator("img").evaluateAll(images => images.map(img => { const box = img.getBoundingClientRect(); return { w: box.width, h: box.height, ratio: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit }; }));
        for (const d of dimensions) { assert.ok(d.w <= 28.1 && d.h <= 32.1); assert.ok(Math.abs(d.w / d.h - d.ratio) < .02); assert.equal(d.fit, "contain"); }
        const bounds = await page.locator(".strip").boundingBox(); assert.ok(bounds && bounds.height < 90);
        assert.ok(await page.locator(".fixture").first().getAttribute("title"));
        await page.waitForTimeout(120);
        assert.equal(await page.locator(".viewport").evaluate(node => node.scrollLeft), 0, "reduced motion keeps strip still");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await expect.poll(() => page.locator(".viewport").evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
        await page.getByRole("button").click(); await expect(page.getByRole("button")).toHaveAttribute("aria-pressed", "true");
        await page.locator(".viewport").evaluate(node => { node.scrollLeft = node.scrollWidth; });
        assert.ok(await page.locator(".viewport").evaluate(node => node.scrollLeft > 0));
        await page.locator(".viewport").evaluate(node => { node.scrollLeft = 0; });
        if (process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX && engine === chromium) await page.screenshot({ path: `${process.env.TOUCHLINE_STRIP_CAPTURE_PREFIX}-${width}-${locale}.png` });
        assert.deepEqual(errors, []); await page.close();
      }
    } finally { await browser.close(); }
  }
});
