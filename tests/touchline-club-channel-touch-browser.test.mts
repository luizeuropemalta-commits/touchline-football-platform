import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { chromium, webkit, expect } from "@playwright/test";
import ts from "typescript";
import * as copy from "../lib/touchlineArena/club-official-channels-i18n.ts";
import { getTouchlineOfficialClubChannels } from "../lib/touchlineArena/club-official-channels.ts";

const sharedControlsCss = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.module.css", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
// Use the site's actual preflight, root tokens and body typography. Decorative
// global layers and the orientation gate are outside this isolated cover proof.
const preflightCss = readFileSync(new URL("../node_modules/tailwindcss/preflight.css", import.meta.url), "utf8");
const siteBaseCss = preflightCss + globalCss.slice(globalCss.indexOf(":root {"), globalCss.indexOf("body::before {"))
  + globalCss.match(/button, a, input, textarea, select \{[^}]+\}/)![0];


test("real official-channel component retains safe exits, keyboard focus and 44px touch targets", { timeout: 45_000 }, async t => {
  const root = resolve(import.meta.dirname, "..");
  const allowModeratePressure = process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI;
  const allowLowDisk = process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI;
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true, allowModerateDarwinPressure: allowModeratePressure, allowLowDarwinDisk: allowLowDisk });
  if (allowLowDisk) t.diagnostic("capacityException=local-500MiB-reserve; memory checks preserved; never CI");
  if (allowModeratePressure) t.diagnostic("capacityException=local-moderate-pressure; memory>=25%; configured disk reserve checked; critical pressure refused");
  const requestedEngine = process.env.TOUCHLINE_CHANNEL_BROWSER_ENGINE;
  assert.ok(requestedEngine === undefined || ["chromium", "webkit"].includes(requestedEngine));
  const engines = [chromium, webkit].filter(engine => requestedEngine === undefined || engine.name() === requestedEngine);
  capacity();
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
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch();
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const width of [390, 844, 1440]) {
        capacity();
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
        const errors: string[] = [], forbidden: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => { forbidden.push(route.request().url()); return route.abort(); });
        await page.setContent(`<style>${siteBaseCss}${sharedControlsCss}${css}body{padding:12px}.channel{margin-bottom:12px}</style>${markup}`);
        const links = page.locator("a");
        assert.equal(await links.count(), 5);
        for (const link of await links.all()) {
          // macOS WebKit uses Option-Tab to include links without changing the user's keyboard settings.
          await page.keyboard.press(engine === webkit ? "Alt+Tab" : "Tab");
          const result = await link.evaluate(a => {
            const bounds = a.getBoundingClientRect(), style = getComputedStyle(a);
            return { height: bounds.height, width: bounds.width, focused: document.activeElement === a,
              minHeight: parseFloat(style.minHeight), outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
              target: a.target, rel: a.rel, protocol: new URL(a.href).protocol };
          });
          assert.ok(result.minHeight >= 44 && result.height >= 44 - 0.001 && result.width >= 44 - 0.001, JSON.stringify({ width, result }));
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
        assert.equal(await page.locator(".hero").first().locator(".heroCrest").count(), 0, "A channel without clubIdentity must not invent a fallback crest");
        assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
        } finally { await page.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});


test("compact cover channels occupy the lower right with complete copy and accessible actions", { timeout: 90_000 }, async t => {
  const root = resolve(import.meta.dirname, "..");
  const allowModeratePressure = process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI;
  const allowLowDisk = process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI;
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true, allowModerateDarwinPressure: allowModeratePressure, allowLowDarwinDisk: allowLowDisk });
  if (allowLowDisk) t.diagnostic("capacityException=local-500MiB-reserve; memory checks preserved; never CI");
  if (allowModeratePressure) t.diagnostic("capacityException=local-moderate-pressure; memory>=25%; configured disk reserve checked; critical pressure refused");
  const requestedEngine = process.env.TOUCHLINE_CHANNEL_BROWSER_ENGINE;
  assert.ok(requestedEngine === undefined || ["chromium", "webkit"].includes(requestedEngine));
  const engines = [chromium, webkit].filter(engine => requestedEngine === undefined || engine.name() === requestedEngine);
  capacity();
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.module.css", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const heroCss = pageSource.split("<style>{`")[1].split("`}</style>")[0];
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return icons;
    if (name === "next/image") return { default: () => assert.fail("The compact cover must not render promotional artwork or decorative crests") };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith("club-official-channels-i18n")) return copy;
    throw new Error(`Unexpected import: ${name}`);
  } });
  assert.ok(exports.default);
  const Channel = exports.default;
  const matrix = [
    ...[390, 600, 768, 844, 1440].flatMap(width => ["pt-BR", "de-DE", "ar-SA"].map(locale => ({ width, locale, group: "base", clubs: ["manchester-city", "arsenal"] }))),
    ...[600, 844].flatMap(width => Object.keys(copy.TOUCHLINE_CLUB_OFFICIAL_CHANNELS_COPY).map(locale => ({ width, locale, group: "long-name", clubs: ["brighton"] }))),
  ];
  const selectedMatrix = matrix.filter(item => !process.env.TOUCHLINE_CHANNEL_BROWSER_CASE || `${item.width}:${item.locale}:${item.group}` === process.env.TOUCHLINE_CHANNEL_BROWSER_CASE);
  assert.ok(selectedMatrix.length > 0, "The optional case filter must select a real scenario");
  t.diagnostic(`Cover matrix: ${requestedEngine ?? "chromium+webkit"}; 390/600/768/844/1440; PT/DE/AR base15 + Brighton 600/844×8 locales; canonical CTA11px at600 and12px above620; 390 is blocked-portrait defensive fallback only; real channel and profile CSS, synthetic identity/honours, not full-page or native-device proof`);
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const { width, locale, group, clubs } of selectedMatrix) {
        capacity();
        const page = await browser.newPage({ viewport: { width, height: width === 844 || width === 600 ? 390 : 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const errors: string[] = [], forbidden: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => { forbidden.push(route.request().url()); return route.abort(); });
          const labels = copy.getTouchlineClubOfficialChannelsCopy(locale, true);
          const markup = clubs.map(slug => {
            const channels = getTouchlineOfficialClubChannels(slug);
            const actions = ["membership", "store"].map(kind => renderToStaticMarkup(React.createElement(Channel,
              { channels, kind, variant: "cover", locale, draftLocalesEnabled: true,
                clubIdentity: { name: slug, crestUrl: "/must-not-load.png" } }))).join("");
            return `<header class="club-hub-hero" data-club="${slug}" style="--club-accent:#6cabdd;--club-secondary:#1c2c5b">
              <div class="club-hub-identity"><div class="club-hub-logo-stack"><span class="club-hub-logo" aria-hidden="true">C</span></div><div class="club-hub-title-block"><h1>${slug === "manchester-city" ? "Manchester City" : slug === "brighton" ? "Brighton &amp; Hove Albion" : "Arsenal FC"}</h1></div></div>
              <div class="club-hub-hero-channels">${actions}</div>
              <div class="club-hub-hero-footer"><div class="club-hub-honours"><span>Honours fixture</span></div></div>
            </header>`;
          }).join("");
          await page.setContent(`<style>${siteBaseCss}${sharedControlsCss}${heroCss}${css}body{padding:12px}header{margin-bottom:18px}</style><span class="link" data-canonical-action aria-hidden="true" style="position:absolute;left:-10000px">Reference</span>${markup}`);
          const reference = await page.locator("[data-canonical-action]").evaluate(node => {
            const style = getComputedStyle(node);
            return { fontSize: parseFloat(style.fontSize), minHeight: parseFloat(style.minHeight),
              overflowWidth: node.scrollWidth - node.clientWidth, overflowHeight: node.scrollHeight - node.clientHeight };
          });
          assert.equal(reference.fontSize, width <= 620 ? 11 : 12);
          assert.equal(reference.minHeight, 44);
          const siteTypography = await page.locator("h1").first().evaluate(node => ({ font: getComputedStyle(node).fontFamily, color: getComputedStyle(node).color }));
          assert.match(siteTypography.font, /Arial/);
          assert.equal(siteTypography.color, "rgb(237, 248, 255)");
          const links = page.locator("a");
          await expect(links).toHaveCount(clubs.length * 2);
          await expect(page.locator("img")).toHaveCount(0);
          for (const channel of await page.locator(".cover").all()) {
            const membership = await channel.getAttribute("data-clubhub-official-channel") === "membership";
            await expect(channel.locator("h2")).toHaveText(membership ? labels.membershipTitle : labels.storeTitle);
            await expect(channel.locator("a span")).toHaveText(membership ? labels.learnMembership : labels.exploreCollection);
            if (membership) await expect(channel.locator("p")).toHaveText(labels.membershipDescription);
            const typography = await channel.evaluate(node => ({
              title: parseFloat(getComputedStyle(node.querySelector("h2")!).fontSize),
              action: parseFloat(getComputedStyle(node.querySelector("a")!).fontSize),
              description: node.querySelector("p") ? parseFloat(getComputedStyle(node.querySelector("p")!).fontSize) : null,
            }));
            assert.ok(typography.title >= 14 && typography.action === reference.fontSize && (typography.description === null || typography.description >= 12), JSON.stringify(typography));
          }
          for (const link of await links.all()) {
            await page.keyboard.press(engine === webkit ? "Alt+Tab" : "Tab");
            await expect(link).toBeFocused();
            const target = await link.evaluate(a => {
              const bounds = a.getBoundingClientRect(), style = getComputedStyle(a);
              return { width: bounds.width, height: bounds.height, minHeight: parseFloat(style.minHeight), outline: style.outlineStyle,
                outlineWidth: parseFloat(style.outlineWidth), target: a.target, rel: a.rel, href: a.href };
            });
            assert.ok(target.minHeight >= 44 && target.width >= 44 - 0.001 && target.height >= 44 - 0.001, JSON.stringify(target));
            assert.ok(target.outline !== "none" && target.outlineWidth >= 2);
            assert.equal(target.target, "_blank");
            assert.ok(target.rel.includes("noopener") && target.rel.includes("noreferrer"));
            assert.equal(new URL(target.href).protocol, "https:");
          }
          for (const hero of await page.locator("header").all()) {
            const geometry = await hero.evaluate((node, canonicalOverflow) => {
              const hero = node.getBoundingClientRect(), style = getComputedStyle(node);
              const channels = node.querySelector<HTMLElement>(".club-hub-hero-channels")!;
              const channelBox = channels.getBoundingClientRect();
              const identity = node.querySelector(".club-hub-identity")!.getBoundingClientRect();
              const honours = node.querySelector(".club-hub-hero-footer")!.getBoundingClientRect();
              const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
                && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
              return { rightGap: hero.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) - channelBox.right,
                bottomGap: hero.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom) - channelBox.bottom,
                width: channelBox.width, contained: channelBox.left >= hero.left && channelBox.right <= hero.right,
                overlap: intersects(channelBox, identity) || intersects(channelBox, honours),
                identityFits: Array.from(node.querySelectorAll<HTMLElement>(".club-hub-logo,.club-hub-title-block")).every(element => {
                  const box = element.getBoundingClientRect();
                  return box.left >= identity.left - 1 && box.right <= identity.right + 1
                    && element.scrollWidth <= element.clientWidth + 1;
                }),
                rightColumn: channelBox.left >= Math.max(identity.right, honours.right) - 1,
                identityAboveHonours: identity.bottom <= honours.top + 1,
                stackedAfterHonours: channelBox.top >= honours.bottom - 1,
                columns: style.gridTemplateColumns.split(" ").length,
                clippedElements: Array.from(channels.querySelectorAll<HTMLElement>("h2,p,a,a span")).flatMap(element => {
                  const rect = element.getBoundingClientRect();
                  const action = element.tagName === "A";
                  // The shared focus halo (::after, inset:-3px) intentionally
                  // contributes scroll overflow. Compare that with the actual
                  // canonical reference while separately bounding text/children.
                  const allowedX = action ? canonicalOverflow.overflowWidth : 0;
                  const allowedY = action ? canonicalOverflow.overflowHeight : 0;
                  const range = document.createRange(); range.selectNodeContents(element);
                  const content = range.getBoundingClientRect();
                  const childrenOutside = action && Array.from(element.querySelectorAll("span,svg")).some(child => {
                    const box = child.getBoundingClientRect();
                    return box.left < rect.left - 1 || box.right > rect.right + 1
                      || box.top < rect.top - 1 || box.bottom > rect.bottom + 1;
                  });
                  const clipped = childrenOutside || element.scrollWidth > element.clientWidth + allowedX + 1
                    || element.scrollHeight > element.clientHeight + allowedY + 1
                    || rect.left < channelBox.left - 1 || rect.right > channelBox.right + 1
                    || content.left < rect.left - 1 || content.right > rect.right + 1
                    || content.top < rect.top - 1 || content.bottom > rect.bottom + 1;
                  return clipped ? [{ tag: element.tagName, text: element.textContent, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
                    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, allowedX, allowedY,
                    box: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
                    content: { left: content.left, right: content.right, top: content.top, bottom: content.bottom } }] : [];
                }), height: channelBox.height };
            }, reference);
            assert.ok(Math.abs(geometry.rightGap) <= 1 && Math.abs(geometry.bottomGap) <= 1, JSON.stringify({ width, locale, geometry }));
            assert.ok(geometry.width <= 350.1 && geometry.contained && !geometry.overlap && geometry.clippedElements.length === 0, JSON.stringify({ width, locale, geometry }));
            assert.equal(geometry.columns, width > 480 ? 2 : 1, "Every tested landscape including 600 retains the desktop two-column organisation");
            assert.ok(geometry.identityFits, `The scaled left identity must fit its reserved column: ${JSON.stringify({ width, geometry })}`);
            assert.ok(geometry.identityAboveHonours, "Identity remains above honours in the left column or narrow stack");
            assert.ok(width > 480 ? geometry.rightColumn : geometry.stackedAfterHonours,
              `Channels stay beside both left-column sections; only blocked portrait fallback may stack: ${JSON.stringify({ width, geometry })}`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
          if (process.env.TOUCHLINE_CHANNEL_CAPTURE_PREFIX) {
            await page.screenshot({ path: `${process.env.TOUCHLINE_CHANNEL_CAPTURE_PREFIX}-${engine.name()}-${width}-${locale}-${group}.png`, fullPage: true });
          }
          t.diagnostic(`${engine.name()} ${width} ${locale} ${group}: ${clubs.join(",")}, complete text, 44px native keyboard actions, lower-right geometry`);
        } finally { await page.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});

// These are real channel components in bounded containers, not a mounted zoom
// dialog or a complete matchday rail. The public profile/zoom parent stays LTR.
test("restricted official channels retain complete localized content in rail and supplement containers", { timeout: 90_000 }, async t => {
  const root = resolve(import.meta.dirname, "..");
  const allowModeratePressure = process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" && !process.env.CI;
  const allowLowDisk = process.env.TOUCHLINE_LOCAL_ALLOW_500MIB_RESERVE === "1" && !process.env.CI;
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true, allowModerateDarwinPressure: allowModeratePressure, allowLowDarwinDisk: allowLowDisk });
  if (allowLowDisk) t.diagnostic("capacityException=local-500MiB-reserve; memory checks preserved; never CI");
  if (allowModeratePressure) t.diagnostic("capacityException=local-moderate-pressure; memory>=25%; configured disk reserve checked; critical pressure refused");
  const requestedEngine = process.env.TOUCHLINE_CHANNEL_BROWSER_ENGINE;
  assert.ok(requestedEngine === undefined || ["chromium", "webkit"].includes(requestedEngine));
  const engines = [chromium, webkit].filter(engine => requestedEngine === undefined || engine.name() === requestedEngine);
  capacity();
  const source = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/ClubHubOfficialChannel.module.css", import.meta.url), "utf8");
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return icons;
    if (name === "next/image") return { default: () => assert.fail("Default channels do not render artwork") };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith("club-official-channels-i18n")) return copy;
    throw new Error(`Unexpected import: ${name}`);
  } });
  assert.ok(exports.default);
  const Channel = exports.default;
  const locales = ["de-DE", "ar-SA", "fr-FR", "en-GB", "pt-BR", "es-ES", "it-IT", "tr-TR"];
  const channels = getTouchlineOfficialClubChannels("arsenal");
  const scenarios = [290, 340].flatMap(width => ["tickets", "playerCollection"].map(kind => ({ width, kind })));
  t.diagnostic("Isolated real-component proof: tickets/default and playerCollection/compact in 290/340px containers; eight locales, 600/844px viewports. Not a real zoom or full matchday page.");
  for (const engine of engines) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewportWidth of [600, 844]) for (const locale of locales) {
        capacity();
        const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const errors: string[] = [], forbidden: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => { forbidden.push(route.request().url()); return route.abort(); });
          const labels = copy.getTouchlineClubOfficialChannelsCopy(locale, true);
          const markup = scenarios.map(({ width, kind }) => `<div data-channel-container="${kind}" data-width="${width}" dir="ltr" lang="${locale}" style="width:${width}px;margin:16px 0">${renderToStaticMarkup(React.createElement(Channel, { channels, kind, locale, draftLocalesEnabled: true }))}</div>`).join("");
          await page.setContent(`<style>${siteBaseCss}${sharedControlsCss}${css}body{padding:16px}</style><span class="link" data-canonical-action aria-hidden="true" style="position:absolute;left:-10000px">Reference</span>${markup}`);
          const reference = await page.locator("[data-canonical-action]").evaluate(node => ({
            overflowWidth: node.scrollWidth - node.clientWidth, overflowHeight: node.scrollHeight - node.clientHeight,
            fontSize: getComputedStyle(node).fontSize,
          }));
          await expect(page.locator("a")).toHaveCount(scenarios.length);
          await expect(page.locator("img")).toHaveCount(0);
          for (const container of await page.locator("[data-channel-container]").all()) {
            const kind = await container.getAttribute("data-channel-container");
            const label = kind === "tickets" ? labels.viewTickets : labels.playerCollection;
            await expect(container.locator("h2")).toHaveText(kind === "tickets" ? labels.ticketsTitle : labels.storeTitle);
            await expect(container.locator("a span")).toHaveText(label);
            await expect(container.locator("a")).toHaveAttribute("aria-label", `${label}. ${labels.externalSite}`);
            const metrics = await container.evaluate((node, canonical) => {
              const box = node.getBoundingClientRect();
              const channel = node.querySelector<HTMLElement>("[data-clubhub-official-channel]")!;
              const action = node.querySelector<HTMLAnchorElement>("a")!;
              const actionBox = action.getBoundingClientRect(), style = getComputedStyle(action);
              // Container containment alone misses copy painting into the CTA.
              // Measure actual text fragments against the sibling action, in
              // either a horizontal row or a wrapped/stacked flow.
              const separation = (rect: DOMRect) => Math.max(
                actionBox.left - rect.right, rect.left - actionBox.right,
                actionBox.top - rect.bottom, rect.top - actionBox.bottom,
              );
              const heading = node.querySelector("h2")!;
              const textFragments = (element: Element) => {
                const range = document.createRange(); range.selectNodeContents(element);
                return Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
              };
              const headingFragments = textFragments(heading);
              const copyFragments = Array.from(channel.querySelectorAll(".copy h2,.copy p")).flatMap(textFragments);
              const iconBox = channel.querySelector(".copy > span")!.getBoundingClientRect();
              const siblingSpacing = {
                headingFragments: headingFragments.length,
                headingGap: Math.min(...headingFragments.map(separation)),
                copyContentGap: Math.min(...copyFragments.map(separation), separation(iconBox)),
                heading: heading.textContent,
                action: { left: actionBox.left, right: actionBox.right, top: actionBox.top, bottom: actionBox.bottom },
                fragments: headingFragments.map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
              };
              const failures = Array.from(node.querySelectorAll<HTMLElement>("section,h2,a,a span,svg")).flatMap(element => {
                const rect = element.getBoundingClientRect();
                const isAction = element === action;
                const allowedX = isAction ? canonical.overflowWidth : 0, allowedY = isAction ? canonical.overflowHeight : 0;
                const text = element.matches("h2,a span");
                const ranges = text ? (() => { const range = document.createRange(); range.selectNodeContents(element); return Array.from(range.getClientRects()); })() : [];
                const outside = rect.left < box.left - 1 || rect.right > box.right + 1
                  || element.scrollWidth > element.clientWidth + allowedX + 1
                  || element.scrollHeight > element.clientHeight + allowedY + 1
                  || ranges.some(fragment => fragment.left < rect.left - 1 || fragment.right > rect.right + 1
                    || fragment.top < rect.top - 1 || fragment.bottom > rect.bottom + 1);
                const outsideAction = element.matches("a span,a svg") && (rect.left < actionBox.left - 1 || rect.right > actionBox.right + 1
                  || rect.top < actionBox.top - 1 || rect.bottom > actionBox.bottom + 1);
                return outside || outsideAction ? [{ tag: element.tagName, text: element.textContent,
                  scroll: [element.scrollWidth, element.scrollHeight], client: [element.clientWidth, element.clientHeight],
                  bounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, allowedX, allowedY }] : [];
              });
              return { width: box.width, direction: getComputedStyle(channel).direction, failures, siblingSpacing,
                actionWidth: actionBox.width, actionHeight: actionBox.height, minHeight: parseFloat(style.minHeight), fontSize: style.fontSize,
                href: action.href, target: action.target, rel: action.rel };
            }, reference);
            t.diagnostic(`Sibling spacing: ${JSON.stringify({ engine: engine.name(), viewportWidth, locale, kind, width: metrics.width, ...metrics.siblingSpacing })}`);
            assert.ok(metrics.siblingSpacing.headingFragments > 0, "The heading must have measurable visible text");
            assert.ok(metrics.siblingSpacing.headingGap >= 8 - 0.001 && metrics.siblingSpacing.copyContentGap >= 8 - 0.001,
              `Copy and CTA must retain at least 8px separation, including text fragments: ${JSON.stringify({ engine: engine.name(), viewportWidth, locale, kind, width: metrics.width, spacing: metrics.siblingSpacing })}`);
            assert.deepEqual(metrics.failures, [], JSON.stringify({ engine: engine.name(), viewportWidth, locale, kind, metrics }));
            assert.ok(metrics.minHeight >= 44 && metrics.actionHeight >= 44 - 0.001 && metrics.actionWidth >= 44 - 0.001);
            assert.equal(metrics.fontSize, reference.fontSize);
            assert.equal(metrics.href, kind === "tickets" ? channels.tickets!.url : channels.playerCollection!.url);
            assert.equal(metrics.target, "_blank");
            assert.ok(metrics.rel.includes("noopener") && metrics.rel.includes("noreferrer"));
            await page.keyboard.press(engine === webkit ? "Alt+Tab" : "Tab");
            const action = container.locator("a"); await expect(action).toBeFocused();
            assert.ok(await action.evaluate(node => getComputedStyle(node).outlineStyle !== "none" && parseFloat(getComputedStyle(node).outlineWidth) >= 2));
            if (locale === "ar-SA") t.diagnostic(`${engine.name()} ${viewportWidth} Arabic ${kind}/${metrics.width}: effective direction=${metrics.direction}; full Arabic text and every text fragment bounded; no full-page bidi approval`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
          if (process.env.TOUCHLINE_CHANNEL_CAPTURE_PREFIX) await page.screenshot({ path: `${process.env.TOUCHLINE_CHANNEL_CAPTURE_PREFIX}-${engine.name()}-${viewportWidth}-${locale}-restricted.png`, fullPage: true });
          t.diagnostic(`${engine.name()} ${viewportWidth} ${locale}: four restricted channel containers`);
        } finally { await page.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
});
