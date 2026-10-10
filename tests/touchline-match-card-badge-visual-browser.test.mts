import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { chromium } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { matchCardLabel } from "../lib/touchlineFantasy/match-card-i18n.ts";

test("original match cards SSR preserves artwork and accessible labels at desktop and phone widths", async () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineMatchCardBadge.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineMatchCardBadge.module.css", import.meta.url), "utf8");
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    if (name === "react") return React;
    if (name === "react-dom") return { createPortal: () => null };
    if (name === "react/jsx-runtime") return jsx;
    if (name === "@/lib/touchlineFantasy/match-card-i18n") return { matchCardLabel };
    if (name === "./TouchlineMatchCardBadge.module.css") return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.fail(`Unexpected boundary ${name}`);
  } });
  const Component = exports.default as React.ComponentType<{ kind: "yellow" | "red"; playerName: string; locale: string; draftLocalesEnabled: boolean }>;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 360 } });
      const markup = renderToStaticMarkup(React.createElement("div", { className: "pitch" },
        React.createElement("div", { className: "slot" },
          React.createElement(Component, { kind: "yellow", playerName: "Player A", locale: "pt-BR", draftLocalesEnabled: true })),
        React.createElement("div", { className: "slot", "data-pitch-edge": "end" },
          React.createElement(Component, { kind: "red", playerName: "Player B", locale: "ar-SA", draftLocalesEnabled: true }))));
      await page.setContent(`<style>${css.replaceAll(":global([data-pitch-edge=end])", "[data-pitch-edge=end]")}.pitch{position:relative;width:min(90vw,800px);height:280px;margin:20px auto;overflow:hidden;background:#082412}.slot{position:absolute;top:120px;right:20px;width:100px;height:100px}.slot:first-child{right:auto;left:20px}</style>${markup}`);
      const yellow = page.getByRole("button", { name: "Player A — Cartão amarelo nesta partida" });
      const red = page.getByRole("button", { name: "Player B — بطاقة حمراء في هذه المباراة" });
      assert.equal(await yellow.isVisible(), true);
      assert.equal(await red.isVisible(), true);
      assert.equal(await page.locator("[data-match-card=yellow] .card").evaluate((element) => getComputedStyle(element).width), "17px");
      assert.equal(await yellow.getAttribute("aria-expanded"), "false");
      assert.equal(await red.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("[data-match-card=red] .card").evaluate(element => getComputedStyle(element).height), "25px");
      if (process.env.TOUCHLINE_MATCH_CARD_VISUAL_CAPTURE) {
        await page.screenshot({ path: `${process.env.TOUCHLINE_MATCH_CARD_VISUAL_CAPTURE}-${width}.png` });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
