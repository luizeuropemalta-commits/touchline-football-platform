import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { chromium, webkit } from "@playwright/test";
import ts from "typescript";
import * as copy from "../lib/touchlineArena/club-official-channels-i18n.ts";
import { getTouchlineOfficialClubChannels } from "../lib/touchlineArena/club-official-channels.ts";

test("real official-channel component retains safe exits, keyboard focus and 44px touch targets", { timeout: 45_000 }, async () => {
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.module.css", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return icons;
    if (name === "next/image") return { default: (props: Record<string, unknown>) => props.className === "heroCrest"
      ? React.createElement("img", { className: props.className, alt: "", width: props.width, height: props.height }) : null };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith("club-official-channels-i18n")) return copy;
    throw new Error(`Unexpected import: ${name}`);
  } });
  assert.ok(exports.default);
  const channels = getTouchlineOfficialClubChannels("manchester-city");
  const markup = [
    { kind: "membership", variant: "hero" }, { kind: "store" },
    { kind: "tickets" }, { kind: "playerCollection" },
  ].map(props => renderToStaticMarkup(React.createElement(exports.default!, { ...props, channels, locale: "pt-BR" }))).join("")
    + renderToStaticMarkup(React.createElement(exports.default!, {
      channels: getTouchlineOfficialClubChannels("arsenal"), kind: "membership", variant: "hero", locale: "pt-BR",
      clubIdentity: { name: "Arsenal", crestUrl: "/fixture-crest.png" },
    }));
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 844, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#03100c}.channel{margin-bottom:12px}${css}</style>${markup}`);
        const links = page.locator("a");
        assert.equal(await links.count(), 5);
        for (const link of await links.all()) {
          // macOS WebKit uses Option-Tab to include links without changing the user's keyboard settings.
          await page.keyboard.press(engine === webkit ? "Alt+Tab" : "Tab");
          const result = await link.evaluate(a => {
            const bounds = a.getBoundingClientRect(), style = getComputedStyle(a);
            return { height: bounds.height, width: bounds.width, focused: document.activeElement === a,
              outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
              target: a.target, rel: a.rel, protocol: new URL(a.href).protocol };
          });
          assert.ok(result.height >= 44 && result.width >= 44, JSON.stringify({ width, result }));
          assert.ok(result.focused && result.outline !== "none" && result.outlineWidth >= 2, JSON.stringify({ engine: engine.name(), width, result }));
          assert.equal(result.target, "_blank");
          assert.equal(result.protocol, "https:");
          assert.ok(result.rel.includes("noopener") && result.rel.includes("noreferrer"));
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const crest = await page.locator(".heroCrest").boundingBox();
        const action = await page.locator(".hero").last().locator("a").boundingBox();
        assert.ok(crest && action);
        assert.ok(crest.y + crest.height + 8 <= action.y, `crest must remain above Membership action at ${width}px`);
        assert.equal(await page.locator(".hero").first().locator(".heroCrest").count(), 0, "Manchester City artwork must not gain a fallback crest");
        await page.close();
      }
    } finally { await browser.close(); }
  }
});
