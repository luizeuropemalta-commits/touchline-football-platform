import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
type ComponentProps = Record<string, unknown>;
function load(file: string) {
  const exports: { default?: React.ComponentType<ComponentProps> } = {};
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsx, "react-dom": {},
    "./exchange-showcase": { CLUBOWNER_EXCHANGE_NAME: "ClubOwner Exchange" },
    "@/components/touchline/a11y/TouchlineDialog": {},
  };
  const js = ts.transpileModule(read(file), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(js, { exports, require(name: string) {
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (!(name in modules)) throw new Error(`Unexpected runtime dependency: ${name}`);
    return modules[name];
  } });
  if (!exports.default) throw new Error(`Missing component: ${file}`);
  return exports.default;
}
const Room = load("components/touchline/market/ClubOwnerNegotiationRoom.tsx");
const Hub = load("components/touchline/market/ClubOwnerExchangeHub.tsx");
const css = [
  "components/touchline/TouchlineGlobalNavigation.module.css",
  "components/touchline/market/ClubOwnerNegotiationRoom.module.css",
  "components/touchline/market/ClubOwnerExchangeHub.module.css",
].map(read).join("\n");

// Rendering-only fixture: real component SSR and CSS, no authenticated data,
// server, catalogue, contracts, network requests or hydrated account mutations.
function renderDocument(ownerName?: string) {
  const hub = React.createElement(Hub, { locale: "pt-BR", plan: "vip", state: null, ready: false, catalogue: [] });
  const room = renderToStaticMarkup(React.createElement(Room, { locale: "pt-BR", plan: "vip", ownerName, agentNotice: hub }));
  return `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#060d0a;color:#edf5e9;font-family:Arial,sans-serif}main{max-width:1120px;margin:auto;min-width:0}button{font:inherit} ${css}</style><main>${room}</main></html>`;
}

test("original Exchange header keeps the single representative, real unavailable notice and controls inside mobile widths", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.setContent(renderDocument());
    await expect(page.locator(".representative")).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("Não é possível verificar novas negociações");
    await expect(page.getByRole("button")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      await button.focus();
      await expect(button).toBeFocused();
    }
    const notice = await page.locator(".agentNotice").boundingBox();
    const figure = await page.locator(".soloArt").boundingBox();
    expect(notice!.x).toBeGreaterThanOrEqual(figure!.x + figure!.width);
    const screenshot = testInfo.outputPath(`exchange-header-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`exchange-header-${viewport.width}`, { path: screenshot, contentType: "image/png" });
  }
  expect(pageErrors).toEqual([]);
});

test("unbroken owner names and reduced motion do not create horizontal scroll or continuous animation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(renderDocument("SyntheticLongNameForLayoutOnly".repeat(4)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".glint")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".glint")).toHaveCSS("display", "none");
  await expect(page.getByRole("button")).toHaveCount(3);
});
