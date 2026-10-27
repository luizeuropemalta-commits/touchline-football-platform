import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect, firefox, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// Real client components and focus handlers, not an authenticated session or
// Next transition proof. Browser Tab/scroll remain native. Framework/auth
// transports are forbidden by the existing credential-free bundle boundary.
async function headerFixture() {
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "components/touchline/TouchlineBrandHeader.tsx",
    additionalEntryPaths: ["components/touchline/TouchlineGlobalNavigation.tsx"],
    requiredSources: ["components/touchline/TouchlineNavigationRail.tsx", "components/logo.tsx", "components/touchline/TouchlinePageControls.tsx", "components/touchline/TouchlineSignOutButton.tsx", "components/touchline/TouchlineNavigationLabel.tsx"],
    mountScript: `const locale=document.documentElement.lang;
      flushSync(()=>root.render(React.createElement(loadEntry().default,{
        href:'/clubowner?lang='+locale,locale,draftLocalesEnabled:true,
        accountLocaleContext:{mode:'account',accountId:'isolated-confirmed-account'},
        navigation:React.createElement(loadAdditionalEntry('components/touchline/TouchlineGlobalNavigation.tsx').default,{locale,draftLocalesEnabled:true,currentRoute:'market',surface:'authenticated',showAudioControl:false})
      })));
      window.unmountHeaderFixture=()=>flushSync(()=>root.unmount());`,
  });

  // Use the installed Tailwind compiler only on these loaded source strings.
  // No postcss repository scanner, build, server or new dependency is involved.
  const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
  const { compile } = tailwindRequire("@tailwindcss/node");
  const { Scanner } = tailwindRequire("@tailwindcss/oxide");
  const candidates = new Scanner({ sources: [] }).scanFiles(bundle.sources.filter(file => /\.tsx?$/.test(file)).map(file => ({ content: readFileSync(path.join(root, file), "utf8"), extension: path.extname(file).slice(1) })));
  const globals = path.join(root, "app/globals.css");
  const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
  return { ...bundle, css: `${compiler.build(candidates)}\n${bundle.css}` };
}

test("real BrandHeader navigation endpoints remain reachable with visible keyboard focus in PT, DE and AR", { timeout: 90_000 }, async t => {
  const fixture = await headerFixture();
  t.diagnostic(`Real modules: ${fixture.sources.join(", ")}. Real client mount/handlers; no media provider, downloaded font, real account or Next route transition proof.`);
  const failures: unknown[] = [];
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.route("**/*", route => route.abort());
      // macOS WebKit can require Option-Tab to include links. Probe a native
      // link first (as the existing XI keyboard tests do), without changing the
      // user's keyboard preferences or adding tabindex to product elements.
      const probe = '<!doctype html><a id="native-link" href="#native">Link</a><input id="native-input">';
      await page.setContent(probe);
      await page.keyboard.press("Tab");
      let forward = "Tab";
      if (!await page.locator("#native-link").evaluate(element => element === document.activeElement)) {
        assert.equal(engine.name(), "webkit", "Chromium and Firefox Tab must focus a native link");
        assert.equal(await page.locator("#native-input").evaluate(element => element === document.activeElement), true, "only the known native link-skipping preference permits Option-Tab");
        await page.setContent(probe);
        forward = "Alt+Tab";
        await page.keyboard.press(forward);
        assert.equal(await page.locator("#native-link").evaluate(element => element === document.activeElement), true, "Option-Tab must reach the native link");
      }
      const backward = forward === "Tab" ? "Shift+Tab" : "Alt+Shift+Tab";
      t.diagnostic(`${engine.name()} native full-navigation key: ${forward}`);
      for (const locale of ["pt-BR", "de-DE", "ar-SA"]) {
        for (const width of [320, 390, 768, 844, 1024, 1280, 1920]) {
          await page.setViewportSize({ width, height: 900 });
          // Start a fresh document, including native sequential focus state.
          // setContent alone can retain Firefox's prior keyboard anchor.
          await page.goto("about:blank");
          await page.setContent(`<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fixture.css}</style></head><body><div aria-hidden="true" style="height:800px"></div><div id="root"></div><div aria-hidden="true" style="height:900px"></div></body></html>`);
          await page.addScriptTag({ content: `(() => {${fixture.script}})()` });
          await page.evaluate(() => scrollTo(0, 800));
          const initialPageScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
          assert.ok(initialPageScroll.y > 0, "long page begins at a real positive scroll offset");
          const nav = page.locator("nav[data-touchline-navigation-surface]");
          const rail = nav.locator("..");
          const primary = nav.locator(":scope > a");
          const links = nav.locator(":scope > div > a[data-touchline-navigation-key]");
          assert.equal(await links.count(), 3, "all three general links remain in the actual nav, without mobile hiding");
          const last = rail.locator("button");
          assert.equal(await last.count(), 1, "confirmed account has exactly one real sign-out control");
          assert.equal(await primary.getAttribute("href"), `/clubowner?lang=${locale}`);
          for (const href of await links.evaluateAll(elements => elements.map(element => element.getAttribute("href")))) assert.ok(href?.includes(`lang=${locale}`));
          const geometry = async (phase: string) => {
            const read = () => rail.evaluate(element => {
              const active = document.activeElement as HTMLElement;
              const box = active.getBoundingClientRect(), rail = element.getBoundingClientRect();
              const style = getComputedStyle(active), railStyle = getComputedStyle(element);
              const ring = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
              const clipsX = /auto|scroll|hidden|clip/.test(railStyle.overflowX);
              const clipsY = /auto|scroll|hidden|clip/.test(railStyle.overflowY);
              const left = clipsX ? Math.max(0, rail.left + element.clientLeft) : 0;
              const right = clipsX ? Math.min(innerWidth, rail.left + element.clientLeft + element.clientWidth) : innerWidth;
              const top = clipsY ? Math.max(0, rail.top + element.clientTop) : 0;
              const bottom = clipsY ? Math.min(innerHeight, rail.top + element.clientTop + element.clientHeight) : innerHeight;
              return { text: active.textContent, focusVisible: active.matches(":focus-visible"), box: box.toJSON(), ring, left, right, top, bottom,
                scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
                documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, pageX: scrollX, pageY: scrollY };
            });
            let result = await read();
            const first = result;
            const fits = () => result.focusVisible && result.ring > 0
              && result.box.left - result.ring >= result.left - 1
              && result.box.right + result.ring <= result.right + 1
              && result.box.top - result.ring >= result.top - 1
              && result.box.bottom + result.ring <= result.bottom + 1
              && result.documentWidth <= width
              && result.pageX === initialPageScroll.x && result.pageY === initialPageScroll.y;
            let pollFailure: string | undefined;
            try {
              // Observe native focus scrolling through its bounded settling
              // period; never move the target or rail to make this pass.
              await expect.poll(async () => { result = await read(); return fits(); }, {
                timeout: 1_000, intervals: [16, 32, 64, 128],
                message: "Native focus scrolling must reveal the entire unchanged focus ring",
              }).toBe(true);
            } catch (error) { pollFailure = String(error); }
            const record = { browser: engine.name(), locale, width, phase, initialScrollLeft: first.scrollLeft, initialBox: first.box, pollFailure, ...result };
            t.diagnostic(JSON.stringify(record));
            if (pollFailure || !fits()) failures.push(record);
          };
          // Native Tab starts at the actual logo, then enters ClubOwner. No
          // focus(), scrollIntoView() or injected focus handler masks clipping.
          await page.keyboard.press(forward);
          const firstFocus = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500));
          await page.keyboard.press(forward);
          // Firefox gives an overflowing scroll container a native Tab stop.
          // Accept only this specific rail stop, then require the first link.
          if (await rail.evaluate(element => element === document.activeElement)) {
            t.diagnostic(`${engine.name()} native scroll-container Tab stop: ${locale} ${width}`);
            await page.keyboard.press(forward);
          }
          assert.equal(await primary.evaluate(element => element === document.activeElement), true,
            JSON.stringify({ browser: engine.name(), locale, width, firstFocus,
              secondFocus: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500)) }));
          await geometry("first via Tab");
          for (let index = 0; index < 3; index++) {
            await page.keyboard.press(forward);
            assert.equal(await links.nth(index).evaluate(element => element === document.activeElement), true);
            await geometry(`general ${index + 1} via Tab`);
          }
          await page.keyboard.press(forward);
          assert.equal(await last.evaluate(element => element === document.activeElement), true);
          await geometry("sign-out via Tab");
          for (let index = 0; index < 4; index++) await page.keyboard.press(backward);
          assert.equal(await primary.evaluate(element => element === document.activeElement), true);
          await geometry("first via reverse Tab");
          // The start must remain recoverable at the native scroll origin;
          // centering an overflowing flex row must not create negative content.
          await rail.evaluate(element => { element.scrollLeft = 0; });
          await geometry("first at scroll origin");
          const cleanup = await page.evaluate(() => {
            const originalRequest = requestAnimationFrame, originalCancel = cancelAnimationFrame;
            const pending = new Set<number>();
            let requested = 0, cancelled = 0;
            window.requestAnimationFrame = callback => {
              const id = originalRequest(callback); pending.add(id); requested++; return id;
            };
            window.cancelAnimationFrame = id => { if (pending.delete(id)) cancelled++; originalCancel(id); };
            try {
              const nav = document.querySelector("nav[data-touchline-navigation-surface]")!;
              const ranking = nav.querySelector('[data-touchline-navigation-key="rankings"]') as HTMLElement;
              ranking.focus({ preventScroll: true });
              // This synchronous sample runs before any queued animation frame:
              // keyboard visibility must not rely on a promptly delivered rAF.
              const controlBox = ranking.getBoundingClientRect();
              const railNode = nav.parentElement!;
              const railBox = railNode.getBoundingClientRect();
              const railStyle = getComputedStyle(railNode);
              const controlStyle = getComputedStyle(ranking);
              const ring = Math.max(0, parseFloat(controlStyle.outlineWidth) + parseFloat(controlStyle.outlineOffset));
              const clips = /auto|scroll|hidden|clip/.test(railStyle.overflowX);
              const immediateVisible = controlBox.left - ring >= (clips ? railBox.left + railNode.clientLeft : 0) - 1
                && controlBox.right + ring <= (clips ? railBox.left + railNode.clientLeft + railNode.clientWidth : innerWidth) + 1;
              const first = nav.querySelector(":scope > a") as HTMLElement;
              first.focus({ preventScroll: true });
              const focusStable = first === document.activeElement;
              (window as unknown as { unmountHeaderFixture: () => void }).unmountHeaderFixture();
              return { requested, cancelled, pending: pending.size, focusStable, immediateVisible };
            } finally { window.requestAnimationFrame = originalRequest; window.cancelAnimationFrame = originalCancel; }
          });
          assert.equal(cleanup.immediateVisible, true, "focus ring is fully revealed before the deferred frame runs");
          assert.equal(cleanup.requested, 2, "real focus capture schedules one frame per target");
          assert.equal(cleanup.cancelled, 2, "blur and real unmount cleanup cancel both pending focus frames");
          assert.equal(cleanup.pending, 0);
          assert.equal(cleanup.focusStable, true, "handler does not steal the requested focus");
        }
      }
      assert.deepEqual(pageErrors, []);
    } finally { await browser.close(); }
  }
  assert.equal(failures.length, 0, `Navigation or its focus ring is clipped/unreachable: ${JSON.stringify(failures)}`);
});
