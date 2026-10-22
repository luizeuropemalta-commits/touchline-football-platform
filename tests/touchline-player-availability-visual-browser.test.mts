import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { chromium } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { resolvePlayerAvailabilityBadge, playerAvailabilityBadgeLabel } from "../lib/touchlineArena/player-availability-badge.ts";

test("the approved red cross SSR preserves its accessible label and artwork", { skip: process.env.TOUCHLINE_RUN_PLAYER_AVAILABILITY_BROWSER_TESTS !== "1" }, async () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlinePlayerAvailabilityBadge.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlinePlayerAvailabilityBadge.module.css", import.meta.url), "utf8");
  const exports: Record<string, unknown> = {};
  const classes = { default: new Proxy({}, { get: (_, key) => String(key) }) };
  const labelModule = { playerAvailabilityBadgeLabel };
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name: string) => {
    if (name === "react") return React;
    if (name === "react-dom") return { createPortal: () => null };
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/image") return { default: ({ unoptimized: _unoptimized, ...props }: Record<string, unknown>) => React.createElement("img", props) };
    if (name === "@/lib/touchlineArena/player-availability-badge") return labelModule;
    if (name === "./TouchlinePlayerAvailabilityBadge.module.css") return classes;
    assert.fail(`Unexpected boundary ${name}`);
  } });
  const Component = exports.default as React.ComponentType<{ badge: NonNullable<ReturnType<typeof resolvePlayerAvailabilityBadge>>; locale: "en-GB" }>;
  const badge = resolvePlayerAvailabilityBadge({ source: "sportmonks", fixtureId: "1", playerId: "2", confirmed: true, reason: "injury" }, "1", "2");
  assert.ok(badge);
  const image = readFileSync(new URL(`../public${badge.asset}`, import.meta.url)).toString("base64");
  const markup = renderToStaticMarkup(React.createElement(Component, { badge, locale: "en-GB" }))
    .replaceAll(badge.asset, `data:image/png;base64,${image}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 1 });
    await page.setContent(`<style>${css}</style><main style="display:grid;place-items:center;height:280px;background:#07120e">${markup}</main>`);
    const trigger = page.getByRole("button", { name: "Injured — unavailable for this match" });
    await trigger.waitFor();
    assert.equal(await page.locator("[data-player-availability-badge=injury] img").count(), 1);
    const renderedSource = await page.locator("[data-player-availability-badge=injury] img").getAttribute("src");
    assert.equal(renderedSource?.startsWith("data:image/png;base64,"), true, renderedSource?.slice(0, 100));
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>("[data-player-availability-badge=injury] img");
      return Boolean(image?.complete && image.naturalWidth > 0);
    });
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    const imageBounds = await page.locator("[data-player-availability-badge=injury] img").boundingBox();
    assert.equal(imageBounds?.width, 48);
    assert.equal(imageBounds?.height, 48);
    if (process.env.TOUCHLINE_VISUAL_CAPTURE) await page.screenshot({ path: process.env.TOUCHLINE_VISUAL_CAPTURE });
  } finally {
    await browser.close();
  }
});
