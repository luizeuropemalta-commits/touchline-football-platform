import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium, webkit, expect, type Locator, type Page } from "@playwright/test";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";
import { getTouchLineAuthCopy } from "../lib/touchlineArena/auth-i18n.ts";
import { getTouchlineNotificationCentreCopy } from "../lib/touchlineArena/notification-centre-i18n.ts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://customer-auth-landscape.test";
const routes = ["/notifications", "/inbox", "/login", "/register", "/forgot-password", "/reset-password"];
const locales = ["pt-BR", "en-GB", "ar-SA"];
const viewports = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1280, height: 900 }, { width: 1440, height: 900 }];
const syntheticPreferences = {
  accountId: "11111111-1111-4111-8111-111111111111",
  settings: { playerRumours: false, availability: false, confirmedLineup: false, goalsAndEvents: false,
    selectedLiveMatches: false, leagueLeadership: false, transfersAndOffers: false, creditsPromotionsRewards: false,
    accountSecurity: false, generalComms: false,
    scopes: { clubs: ["Synthetic club"], players: ["Synthetic player"], competitions: ["Synthetic competition"], fixtures: [] } },
  channels: { in_app: false, push: false, email: false }, frequency: "paused",
  quietHours: { enabled: false, start: "21:35", end: "06:45", timezone: "Europe/Malta" },
  explicitConsentAt: null, updatedAt: null,
};

async function paintedKeyboardFocus(page: Page, target: Locator, key: string) {
  await page.locator("#touchline-main-content").focus();
  const shadowBefore = await target.evaluate(node => getComputedStyle(node).boxShadow);
  let reached = false;
  for (let step = 0; step < 96; step++) {
    await page.keyboard.press(key);
    if (await target.evaluate(node => node === document.activeElement)) { reached = true; break; }
  }
  assert.equal(reached, true, "native keyboard traversal reaches the target without activating it");
  await expect(target).toBeFocused();
  await expect.poll(() => target.evaluate((node, previousShadow) => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node);
    const outline = !["none", "hidden"].includes(style.outlineStyle) && parseFloat(style.outlineWidth) > 0;
    const ring = style.boxShadow !== "none" && style.boxShadow !== previousShadow;
    const timeEditor = node instanceof HTMLInputElement && node.type === "time";
    return node === document.activeElement && (node.matches(":focus-visible") || timeEditor)
      && (outline || ring) && box.left >= -1 && box.right <= innerWidth + 1
      && box.top >= -1 && box.bottom <= innerHeight + 1;
  }, shadowBefore)).toBe(true);
}

test("real customer and auth compositions reflow in coarse landscape with persistent labels and readable native controls", {
  skip: process.env.TOUCHLINE_RUN_CUSTOMER_AUTH_LANDSCAPE_TESTS !== "1", timeout: 600_000,
}, async t => {
  const engineFilter = process.env.TOUCHLINE_CUSTOMER_AUTH_ENGINE;
  const routeFilter = process.env.TOUCHLINE_CUSTOMER_AUTH_ROUTE;
  const localeFilter = process.env.TOUCHLINE_CUSTOMER_AUTH_LOCALE;
  const widthFilter = process.env.TOUCHLINE_CUSTOMER_AUTH_WIDTH;
  assert.ok(engineFilter === undefined || ["webkit", "chromium"].includes(engineFilter));
  assert.ok(routeFilter === undefined || routes.includes(routeFilter));
  assert.ok(localeFilter === undefined || locales.includes(localeFilter));
  assert.ok(widthFilter === undefined || viewports.some(value => String(value.width) === widthFilter));
  assert.notEqual(process.env.TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE, "1", "memory bypass is not allowed for this matrix");
  const capacity = () => requireBrowserCapacity(root, { darwinFreePercent: true,
    allowModerateDarwinPressure: !process.env.CI && process.env.TOUCHLINE_LOCAL_ALLOW_MODERATE_PRESSURE === "1" });
  capacity();
  const evidence = mkdtempSync("/private/tmp/touchline-customer-auth-landscape-");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", path.join(root, "tests/helpers/touchline-customer-auth-landscape-compile-worker.mts"), evidence], { cwd: root, stdio: "pipe" });
    let failure: Error | undefined, diagnostic = "";
    child.stderr.on("data", chunk => { diagnostic = (diagnostic + String(chunk)).slice(-4000); });
    const abort = () => { failure = new Error("Fixture compilation aborted"); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { failure = new Error("Fixture compiler exceeded 60s"); child.kill("SIGKILL"); }, 60_000);
    t.signal.addEventListener("abort", abort, { once: true });
    child.once("error", error => { failure = error; });
    child.once("close", code => {
      clearTimeout(timer); t.signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Fixture compiler failed ${code}: ${diagnostic}`));
      else resolve();
    });
    if (t.signal.aborted) abort();
  });
  const script = readFileSync(path.join(evidence, "fixture.js"), "utf8");
  const css = readFileSync(path.join(evidence, "fixture.css"), "utf8");
  const receipt = JSON.parse(readFileSync(path.join(evidence, "sources.json"), "utf8")) as { sources: string[]; sha256: Record<string, string> };
  for (const source of receipt.sources) {
    assert.ok(!path.isAbsolute(source) && !source.split(/[\\/]/).includes(".."));
    assert.equal(createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex"), receipt.sha256[source]);
  }
  t.diagnostic(JSON.stringify({ evidence, scope: "actual route JSX/AuthLayout/forms/customer shell/boundary/CSS; client mount, synthetic GET only; not authenticated QA, Next hydration or native iPhone pinch/keyboard proof" }));
  const publicRoot = realpathSync(path.join(root, "public"));
  const results: unknown[] = [];
  for (const engine of [webkit, chromium].filter(value => engineFilter === undefined || value.name() === engineFilter)) {
    capacity(); assert.ok(existsSync(engine.executablePath()));
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of viewports.filter(value => widthFilter === undefined || String(value.width) === widthFilter))
        for (const locale of locales.filter(value => localeFilter === undefined || value === localeFilter))
          for (const pathname of routes.filter(value => routeFilter === undefined || value === routeFilter)) {
            capacity();
            const mobile = viewport.width < 1280;
            const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile,
              reducedMotion: "reduce", serviceWorkers: "block", permissions: [] });
            try {
              const page = await context.newPage(); page.setDefaultTimeout(6000);
              // Keep this session until context.close: detaching clears its
              // coarse-pointer override after Chromium's headless resize.
              const touchSession = mobile && engine.name() === "chromium" ? await context.newCDPSession(page) : null;
              const errors: string[] = [], forbidden: string[] = [], requests: string[] = [];
              let recoveryState: "hold" | "ready" | "invalid" = "hold";
              page.on("pageerror", error => errors.push(error.message));
              page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
              let releaseRecovery: (() => void) | undefined;
              await context.route("**/*", async route => {
                const request = route.request(), url = new URL(request.url());
                if (request.method() !== "GET" || url.origin !== origin) {
                  forbidden.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort();
                }
                if (url.pathname === pathname) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body id="root"></body></html>` });
                if (url.pathname === "/api/notifications/preferences") {
                  requests.push(url.pathname); return route.fulfill({ json: { ok: true, data: syntheticPreferences } });
                }
                if (url.pathname === "/api/auth/recovery") {
                  requests.push(url.pathname);
                  if (recoveryState === "hold") await new Promise<void>(resolve => { releaseRecovery = resolve; });
                  return route.fulfill(recoveryState === "invalid"
                    ? { status: 200, json: { ok: false, error: "invalid" } }
                    : { status: 200, json: { ok: true } }).catch(() => undefined);
                }
                const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
                if (asset.startsWith(publicRoot + path.sep) && existsSync(asset) && statSync(asset).isFile() && realpathSync(asset).startsWith(publicRoot + path.sep)) return route.fulfill({ path: asset });
                forbidden.push(url.pathname); return route.abort();
              });
              // Probe native tab policy before loading the product composition.
              await page.setContent('<a href="#" id="probe-link">Probe</a><input id="probe-input">');
              await page.keyboard.press("Tab");
              let tabKey = "Tab";
              if (!await page.locator("#probe-link").evaluate(node => node === document.activeElement)) {
                assert.equal(engine.name(), "webkit"); tabKey = "Alt+Tab";
              }
              await page.goto(`${origin}${pathname}?lang=${locale}`);
              await page.addScriptTag({ content: `(()=>{${script}})()` });
              await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
              // Match app/layout.tsx: the global portrait rule protects only
              // orientation root/gate siblings mounted directly under body.
              assert.equal(await page.locator("[data-touchline-orientation-gate]").evaluate(node => node.parentElement === document.body), true);
              assert.equal(await page.locator("[data-touchline-orientation-root]").evaluate(node => node.parentElement === document.body), true);
              const authCopy = getTouchLineAuthCopy(locale, true).form;
              if (pathname === "/reset-password") {
                await expect(page.getByRole("status")).toHaveText(authCopy.recoveryChecking);
                await expect.poll(() => Boolean(releaseRecovery)).toBe(true);
                recoveryState = "ready"; releaseRecovery!();
                await expect(page.locator("#touchline-reset-password")).toBeVisible();
              }
              await page.evaluate(() => document.fonts.ready);
              assert.equal(await page.evaluate(() => matchMedia("(pointer:coarse)").matches), mobile);
              const layout = await page.evaluate(() => ({
                innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth, compact: matchMedia("(max-width:1279px)").matches,
              }));
              t.diagnostic(JSON.stringify({ layout, engine: engine.name(), viewport, locale, pathname }));
              // At nominal 1280, WebKit's real 5px scrollbar can place CSS
              // viewport width at 1275. Keep that boundary case and a 1440
              // control that must preserve the original desktop composition.
              if (mobile) assert.equal(layout.compact, true);
              if (viewport.width === 1440) assert.equal(layout.compact, false);
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
              await expect(page.locator("[data-touchline-orientation-gate]")).toBeHidden();
              const fieldValues: Array<{ selector: string; value: string }> = [];
              if (pathname === "/notifications") {
                const copy = getTouchlineNotificationCentreCopy(locale, true);
                const save = page.getByRole("button", { name: copy.save, exact: true });
                await expect(save).toBeEnabled();
                const fields = [copy.quietStart, copy.quietEnd, copy.quietTimezone, copy.clubs, copy.players, copy.competitions, copy.fixtures];
                const values = ["22:40", "07:50", "Europe/Malta", "Synthetic club changed", "Synthetic player changed", "Synthetic competition changed", "Synthetic fixture changed"];
                for (const [index, label] of fields.entries()) {
                  const field = page.locator(`input[aria-label=${JSON.stringify(label)}]`);
                  await expect(field).toBeEnabled();
                  assert.equal(await field.evaluate((node, label) => Array.from((node as HTMLInputElement).labels ?? []).some(item => item.textContent?.trim() === label && getComputedStyle(item).visibility === "visible" && item.getBoundingClientRect().height > 0), label), true, "persistent visible label exists before input");
                  await field.fill(values[index]);
                  await expect(field).toHaveValue(values[index]);
                  assert.equal(await field.evaluate((node, label) => Array.from((node as HTMLInputElement).labels ?? []).some(item => item.textContent?.trim() === label), label), true, "visible identity remains after placeholder disappears");
                  fieldValues.push({ selector: `input[aria-label=${JSON.stringify(label)}]`, value: values[index] });
                }
                const controls = page.locator('main input:not([type="checkbox"]),main select');
                const geometry = await controls.evaluateAll(nodes => nodes.map(node => ({ box: node.getBoundingClientRect().toJSON(), font: parseFloat(getComputedStyle(node).fontSize) })));
                assert.equal(geometry.length, 8);
                for (const control of geometry) { assert.ok(control.box.height >= 44); assert.equal(control.font, mobile ? 16 : 12); }
                const canvas = page.locator('[class$="_canvas"]');
                if (layout.compact) {
                  assert.equal(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.parentElement!.scrollWidth <= node.parentElement!.clientWidth + 1), true);
                  for (const control of geometry) assert.ok(control.box.left >= 0 && control.box.right <= viewport.width + 1);
                  const box = await save.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.height >= 44);
                } else {
                  assert.equal(await canvas.evaluate(node => getComputedStyle(node).minWidth), "1160px");
                  assert.equal(await page.locator('[class$="_panels"]').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);
                  assert.equal(await page.locator('[class$="_quietHours"]').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length), 3);
                }
                await paintedKeyboardFocus(page, page.locator(`input[aria-label=${JSON.stringify(copy.quietTimezone)}]`), tabKey);
                await paintedKeyboardFocus(page, save, tabKey);
                await expect(page.locator('main input[type="checkbox"]:checked')).toHaveCount(0);
              } else if (pathname === "/inbox") {
                const item = page.locator("main ol > li"), action = item.locator("aside button");
                const geometry = await item.evaluate(node => {
                  const message = node.children[0].getBoundingClientRect(), actions = node.children[1].getBoundingClientRect();
                  return { message: message.toJSON(), actions: actions.toJSON() };
                });
                if (layout.compact) {
                  assert.equal(await page.locator('[class$="_canvas"]').evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.parentElement!.scrollWidth <= node.parentElement!.clientWidth + 1), true, "Inbox content needs no horizontal panning");
                  assert.ok(geometry.actions.top >= geometry.message.bottom - 1);
                } else {
                  assert.ok(Math.abs(geometry.actions.top - geometry.message.top) <= 1);
                  assert.ok(geometry.message.right <= geometry.actions.left + 1 || geometry.actions.right <= geometry.message.left + 1);
                }
                const actionBox = await action.boundingBox(); assert.ok(actionBox && actionBox.height >= 44 && actionBox.x >= 0 && actionBox.x + actionBox.width <= viewport.width + 1);
                await paintedKeyboardFocus(page, action, tabKey);
              } else {
                assert.equal(await page.locator(".auth-brand-header").evaluate(node => {
                  const boxes = Array.from(node.querySelectorAll("a,button,select")).map(item => item.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
                  return boxes.every(box => box.left >= 0 && box.right <= innerWidth + 1)
                    && boxes.every((a, index) => boxes.every((b, other) => index === other || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
                }), true, "real brand, audio and locale controls fit without overlaps");
                const inputs = page.locator('.auth-entry-content input:not([type="hidden"]):not([type="checkbox"])');
                assert.ok(await inputs.count() > 0);
                for (const input of await inputs.all()) {
                  const geometry = await input.evaluate(node => ({ box: node.getBoundingClientRect().toJSON(), font: parseFloat(getComputedStyle(node).fontSize), labels: (node as HTMLInputElement).labels?.length ?? 0 }));
                  // The existing unlayered global font: inherit wins over
                  // Tailwind's layered text-sm; fine-pointer baseline is 16px.
                  assert.equal(geometry.font, 16); assert.ok(geometry.box.height >= 44 && geometry.labels > 0);
                  assert.ok(geometry.box.left >= 0 && geometry.box.right <= viewport.width + 1);
                }
                const first = inputs.first();
                await first.fill(pathname === "/reset-password" ? "synthetic-local-value" : pathname === "/register" ? "Synthetic" : "fixture@example.test");
                fieldValues.push({ selector: pathname === "/reset-password" ? "#touchline-reset-password" : pathname === "/register" ? 'input[name="first_name"]' : 'input[name="email"]', value: await first.inputValue() });
                await paintedKeyboardFocus(page, first, tabKey);
              }
              const language = page.locator(".auth-language-switcher select");
              await expect(language).toHaveCount(1);
              const languageGeometry = await language.evaluate(node => {
                const style = getComputedStyle(node);
                const label = (node as HTMLSelectElement).labels?.[0];
                return { box: node.getBoundingClientRect().toJSON(), font: parseFloat(style.fontSize), minHeight: style.minHeight,
                  label: label?.getBoundingClientRect().toJSON(), header: node.closest("header")?.getBoundingClientRect().toJSON() };
              });
              const languageBox = languageGeometry.box;
              assert.ok(languageBox.x >= 0 && languageBox.x + languageBox.width <= viewport.width + 1);
              if (mobile) {
                assert.equal(languageGeometry.font, 16);
                assert.ok(languageBox.height >= 44, "the native locale select itself provides a 44px target");
                assert.ok(languageGeometry.label && languageGeometry.label.height >= 44 && languageGeometry.label.height <= 46,
                  "the associated label adds at most its two 1px borders");
                assert.ok(languageBox.top >= languageGeometry.label.top && languageBox.bottom <= languageGeometry.label.bottom);
              }
              if (mobile) {
                const resize = async (size: { width: number; height: number }) => {
                  await page.setViewportSize(size);
                  if (touchSession) await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
                  assert.equal(await page.evaluate(() => matchMedia("(pointer:coarse)").matches), true);
                };
                await resize({ width: viewport.height, height: viewport.width });
                t.diagnostic(JSON.stringify({ rotation: await page.evaluate(() => ({
                  innerWidth, innerHeight, screenWidth: screen.width, screenHeight: screen.height,
                  clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
                  visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null,
                  coarse: matchMedia("(pointer:coarse)").matches, portrait: matchMedia("(orientation:portrait)").matches,
                  narrow: matchMedia("(max-width:767px)").matches,
                  active: document.activeElement?.tagName,
                })) }));
                await expect(page.locator("[data-touchline-orientation-gate]")).toBeVisible();
                await expect.poll(() => page.locator("#touchline-main-content").evaluate(node => node.inert)).toBe(true);
                await resize(viewport);
                await expect(page.locator("[data-touchline-orientation-gate]")).toBeHidden();
                await expect.poll(() => page.locator("#touchline-main-content").evaluate(node => node.inert)).toBe(false);
                for (const field of fieldValues) await expect(page.locator(field.selector)).toHaveValue(field.value);
              }
              if (locale === "pt-BR") {
                const capture = path.join(evidence, `${engine.name()}-${viewport.width}-${pathname.slice(1)}.png`);
                await page.screenshot({ path: capture, fullPage: true, animations: "disabled" });
              }
              if (pathname === "/reset-password") {
                recoveryState = "invalid";
                await page.reload(); await page.addScriptTag({ content: `(()=>{${script}})()` });
                await expect(page.getByRole("alert")).toHaveText(authCopy.recoveryInvalid);
                await expect(page.locator(".stadium-scoreboard").getByRole("link", { name: authCopy.requestNewReset })).toHaveAttribute("href", `/forgot-password?lang=${locale}`);
              }
              assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
              const result = { engine: engine.name(), viewport, locale, pathname, requests, languageGeometry,
                visualViewportScale: await page.evaluate(() => visualViewport?.scale ?? null) };
              results.push(result); t.diagnostic(JSON.stringify(result));
              writeFileSync(path.join(evidence, "results.json"), JSON.stringify(results, null, 2));
            } finally { await context.close(); }
          }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  const expected = (engineFilter ? 1 : 2) * (widthFilter ? 1 : viewports.length) * (localeFilter ? 1 : locales.length) * (routeFilter ? 1 : routes.length);
  assert.equal(results.length, expected);
});
