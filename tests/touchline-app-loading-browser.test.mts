import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, statfsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { webkit } from "@playwright/test";
import * as resolver from "../lib/touchlineArena/root-locale.ts";

const enabled = process.env.TOUCHLINE_RUN_APP_LOADING_BROWSER_TESTS === "1";
test("isolated real loading preserves skeleton geometry and accessible status in EN/PT/AR", { skip: !enabled, timeout: 60_000 }, async t => {
  const root = new URL("../", import.meta.url);
  const capacity = () => {
    const disk = statfsSync(root), freeBytes = disk.bavail * disk.bsize;
    assert.ok(freeBytes > 5 * 1024 ** 3, "stop own test below 5 GiB");
    const output = execFileSync("memory_pressure", { encoding: "utf8" });
    const freeMemory = Number(output.match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(freeMemory) && freeMemory >= 25, "stop own test under memory pressure");
    return { freeBytes, freeMemory };
  };
  const initialCapacity = capacity();
  const source = readFileSync(new URL("app/(app)/loading.tsx", root), "utf8");
  const css = readFileSync(new URL(".next/static/chunks/44gb7hj65y9x4.css", root), "utf8");
  for (const required of [".sr-only", ".skeleton", "1500px", ".h-64", ".h-80"]) assert.ok(css.includes(required), required);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  assert.ok(existsSync(webkit.executablePath()), "installed browser only");
  const browser = await webkit.launch({ headless: true });
  t.signal.addEventListener("abort", () => { void browser.close(); }, { once: true });
  const reports: unknown[] = [];
  try {
    const requestedLocales = (process.env.TOUCHLINE_APP_LOADING_LOCALES ?? "en-GB,pt-BR,ar-SA").split(",");
    assert.ok(requestedLocales.length > 0 && requestedLocales.every(locale => ["en-GB", "pt-BR", "ar-SA"].includes(locale)), "explicit supported locale selection");
    for (const [locale, label] of [["en-GB", "Loading…"], ["pt-BR", "Carregando…"], ["ar-SA", "جارٍ التحميل…"]].filter(([locale]) => requestedLocales.includes(locale))) {
      const modules: Record<string, unknown> = {
        "react/jsx-runtime": jsx, "next/headers": { headers: async () => ({ get: () => locale }) },
        "@/lib/touchlineArena/root-locale": resolver,
        "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => true },
      };
      const exports = {} as { default: () => Promise<ReactElement> };
      runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
      const markup = renderToStaticMarkup(await exports.default());
      for (const [width, height] of [[1280, 800], [844, 390]]) {
        capacity();
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
        const requests: string[] = [], errors: string[] = [];
        await context.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.setContent(`<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`);
          assert.equal(await page.getByRole("status").textContent(), label);
          assert.equal(await page.getByRole("status").getAttribute("lang"), locale);
          assert.equal(await page.locator('[aria-hidden="true"] .skeleton').count(), 12);
          const status = await page.getByRole("status").evaluate(el => { const s = getComputedStyle(el); return { position: s.position, width: s.width, height: s.height, overflow: s.overflow }; });
          assert.deepEqual(status, { position: "absolute", width: "1px", height: "1px", overflow: "hidden" });
          assert.ok((await page.locator("body").ariaSnapshot()).includes(label));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          const boxes = async () => page.locator(".skeleton").evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
          const before = await boxes();
          assert.ok(before.some(box => box[2] > 100 && box[3] >= 250));
          if (process.env.TOUCHLINE_APP_LOADING_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_APP_LOADING_CAPTURE_PREFIX}-${locale}-${width}.png`, fullPage: true });
          await page.getByRole("status").evaluate(el => el.remove());
          await page.locator('[aria-hidden="true"]').evaluate(el => el.replaceWith(...el.childNodes));
          assert.deepEqual(await boxes(), before, "same geometry without new status/wrapper");
          assert.deepEqual(errors, []); assert.deepEqual(requests, []);
          reports.push({ locale, width, height, status, geometryUnchanged: true, requests, errors });
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ cssHash: createHash("sha256").update(css).digest("hex"), initialCapacity, finalCapacity: capacity(), reports }));
});
