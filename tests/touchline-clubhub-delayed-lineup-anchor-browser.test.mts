import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { chromium, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const root = path.resolve(import.meta.dirname, "..");
const origin = "https://delayed-lineup.test";
const anchor = "touchline-club-lineup";
const destination = `${origin}/touchline-clubs/arsenal?lang=pt-BR&fixtureId=990099#${anchor}`;

// Only these CSS-module classes occur in the page's unmounted right rail.
// They must never stand in for selectors used by the isolated lineup/nav.
const unmountedRailClasses: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  officialLeagueStyles: {
    layout: "isolated-unmounted-rail-official-layout",
    fixture: "isolated-unmounted-rail-official-fixture",
  },
  premiumStyles: {
    nextFixtureTeams: "isolated-unmounted-rail-premium-teams",
    nextFixtureClub: "isolated-unmounted-rail-premium-club",
    nextFixtureKickoff: "isolated-unmounted-rail-premium-kickoff",
    nextFixtureVenue: "isolated-unmounted-rail-premium-venue",
    nextFixtureVenueImage: "isolated-unmounted-rail-premium-venue-image",
    nextFixtureVenueCopy: "isolated-unmounted-rail-premium-venue-copy",
  },
};

function extractIsolatedPageCss(ast: ts.SourceFile): string {
  const styles: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)
      && node.openingElement.tagName.text === "style") {
      for (const child of node.children) {
        if (ts.isJsxText(child) && !child.text.trim()) continue;
        assert.ok(ts.isJsxExpression(child) && child.expression, "page style must contain a template literal");
        const expression = child.expression;
        if (ts.isNoSubstitutionTemplateLiteral(expression)) {
          styles.push(expression.text);
          continue;
        }
        assert.ok(ts.isTemplateExpression(expression), "page style must contain a template literal");
        let css = expression.head.text;
        for (const span of expression.templateSpans) {
          const access = span.expression;
          assert.ok(ts.isPropertyAccessExpression(access) && !access.questionDotToken
            && ts.isIdentifier(access.expression) && ts.isIdentifier(access.name),
          "unsupported page CSS interpolation");
          const mapName = access.expression.text, className = access.name.text;
          assert.ok(Object.hasOwn(unmountedRailClasses, mapName)
            && Object.hasOwn(unmountedRailClasses[mapName], className),
          "unknown page CSS module class");
          assert.match(css, /\.club-hub-right-rail \.$/,
            "CSS-module substitution is restricted to an unmounted right-rail selector");
          css += unmountedRailClasses[mapName][className] + span.literal.text;
        }
        styles.push(css);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return styles.join("\n");
}

const parsePageCssTest = (source: string) => extractIsolatedPageCss(
  ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
);

test("isolated page CSS preserves static rules and substitutes only known unmounted rail classes", () => {
  const css = "#touchline-club-lineup { scroll-margin-top: 91px; }\n"
    + ".club-hub-right-rail .${officialLeagueStyles.layout} { width: 100%; }\n"
    + ".club-hub-right-rail .${premiumStyles.nextFixtureClub} img { width: 44px; }";
  assert.equal(parsePageCssTest("<style>{`" + css + "`}</style>"), css
    .replace("${officialLeagueStyles.layout}", "isolated-unmounted-rail-official-layout")
    .replace("${premiumStyles.nextFixtureClub}", "isolated-unmounted-rail-premium-club"));
  assert.equal(parsePageCssTest("<style>{`body { margin: 0; }`}</style>"), "body { margin: 0; }");
});

test("isolated page CSS rejects executable, unknown and non-rail interpolations", () => {
  for (const expression of ["run()", "officialLeagueStyles['layout']", "otherStyles.layout",
    "officialLeagueStyles.unknown", "officialLeagueStyles?.layout", "officialLeagueStyles.constructor"]) {
    assert.throws(() => parsePageCssTest("<style>{`.club-hub-right-rail .${" + expression + "} { width: 100%; }`}</style>"));
  }
  assert.throws(() => parsePageCssTest("<style>{`#touchline-club-lineup { scroll-margin-top: ${officialLeagueStyles.layout}; }`}</style>"));
  assert.throws(() => parsePageCssTest("<style>{getCss()}</style>"));
});

test("isolated page CSS extracts current production anchor and fallback rules unchanged", () => {
  const source = readFileSync(path.join(root, "app/touchline-clubs/[club]/page.tsx"), "utf8");
  const css = parsePageCssTest(source);
  for (const selector of ["#touchline-club-lineup", ".club-hub-deferred-lineup"]) {
    const start = source.indexOf(`${selector} {`);
    assert.ok(start >= 0, `production selector required: ${selector}`);
    const rule = source.slice(start, source.indexOf("}", start) + 1);
    assert.ok(css.includes(rule), `production rule preserved: ${selector}`);
  }
  assert.ok(css.includes(".club-hub-right-rail .isolated-unmounted-rail-official-layout"));
});

test("native delayed ClubHub anchor arrival, reload and history (not Next/RSC routing)", {
  skip: process.env.TOUCHLINE_RUN_LINEUP_ANCHOR_BROWSER_TESTS !== "1", timeout: 120_000,
}, async t => {
  const selectedEngine = process.env.TOUCHLINE_LINEUP_ANCHOR_ENGINE;
  const selectedWidth = process.env.TOUCHLINE_LINEUP_ANCHOR_WIDTH;
  const selectedCase = process.env.TOUCHLINE_LINEUP_ANCHOR_CASE;
  assert.ok(selectedEngine === undefined || ["chromium", "webkit"].includes(selectedEngine));
  assert.ok(selectedWidth === undefined || ["390", "844", "1280"].includes(selectedWidth));
  assert.ok(selectedCase === undefined || ["navigation", "user-changed-hash", "user-scrolled-away"].includes(selectedCase));
  const capacity = () => {
    const disk = statfsSync(root);
    assert.ok(disk.bavail * disk.bsize > 5 * 1024 ** 3, "more than 5GiB disk required");
    assert.equal(execFileSync("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim(), "1");
    const free = Number(execFileSync("memory_pressure", { encoding: "utf8" }).match(/System-wide memory free percentage: (\d+)%/)?.[1]);
    assert.ok(Number.isFinite(free) && free >= 25, "at least 25% free memory required");
  };
  capacity();
  const screenshots = mkdtempSync("/private/tmp/touchline-lineup-anchor-");
  t.diagnostic(JSON.stringify({ screenshots, selectedEngine, selectedWidth, selectedCase: selectedCase ?? "all",
    partial: Boolean(selectedEngine || selectedWidth || selectedCase),
    boundary: "real lineup/nav/CSS; native document navigation and client Suspense only; explicit unrelated-content gap separates menu and loader; empty unconfirmed lineup; no Next/RSC stream or real fixture selection" }));
  const pageSource = readFileSync(path.join(root, "app/touchline-clubs/[club]/page.tsx"), "utf8");
  const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fallback = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubDeferredSection");
  assert.ok(fallback, "production deferred fallback must exist");
  const fallbackScript = ts.transpileModule(fallback.getText(ast), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } }).outputText;
  const pageCss = extractIsolatedPageCss(ast);
  assert.ok(pageCss.includes("#touchline-club-lineup") && pageCss.includes(".club-hub-deferred-lineup"), "real page anchor and fallback CSS required");
  const bundle = bundleIsolatedBrowserFixture({
    entryPath: "tests/fixtures/ClubHubDelayedLineupBrowserFixture.tsx",
    requiredSources: ["components/touchline/ClubHubOfficialLineup.tsx", "components/touchline/ClubHubOfficialLineup.module.css", "components/touchline/club-hub/ClubHubSectionNavigation.tsx"],
    mountScript: `${fallbackScript}\nwindow.resolveIsolatedLineup=loadEntry().resolveLineup;flushSync(()=>root.render(React.createElement(loadEntry().default,{DeferredSection:ClubHubDeferredSection})));`,
  });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#08100c;color:white;font:16px Arial}*{box-sizing:border-box}${pageCss}${bundle.css}</style></head><body><div id="root"></div><script>${bundle.script.replaceAll("</script", "<\\/script")}</script></body></html>`;
  const publicRoot = realpathSync(path.join(root, "public"));
  const observations: unknown[] = [], failures: string[] = [];
  for (const engine of [chromium, webkit].filter(value => !selectedEngine || value.name() === selectedEngine)) {
    capacity(); assert.ok(existsSync(engine.executablePath()), "installed browser only");
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); }; t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const width of [390, 844, 1280].filter(value => !selectedWidth || String(value) === selectedWidth)) {
        capacity();
        const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const page = await context.newPage(); page.setDefaultTimeout(5000);
          const errors: string[] = [], forbidden: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== "GET" || url.origin !== origin) { forbidden.push(request.url()); return route.abort(); }
            if (url.pathname === "/touchline-clubs/arsenal") return route.fulfill({ contentType: "text/html", body: html });
            if (url.pathname === "/elsewhere") return route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Native history destination</p>" });
            let assetPath: string;
            try { assetPath = decodeURIComponent(url.pathname); } catch { forbidden.push(url.pathname); return route.abort(); }
            const file = path.resolve(publicRoot, `.${assetPath}`);
            if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile()
              && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) return route.fulfill({ path: file });
            forbidden.push(url.pathname); return route.abort();
          });
          const release = async () => {
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            await page.evaluate(() => (window as unknown as { resolveIsolatedLineup(): void }).resolveIsolatedLineup());
            await expect(page.locator(`#${anchor}`)).toHaveCount(1);
          };
          const observe = async (phase: string) => {
            let reached = true;
            try { await expect.poll(() => page.locator(`#${anchor}`).evaluate(node => {
              const rect = node.getBoundingClientRect(); return rect.top >= -1 && rect.top < innerHeight - 40;
            }), { timeout: 1200 }).toBe(true); } catch { reached = false; }
            const geometry = await page.locator(`#${anchor}`).evaluate(node => ({ rect: node.getBoundingClientRect().toJSON(), scrollY, hash: location.hash, url: location.href }));
            const observation = { engine: engine.name(), width, phase, reached, ...geometry };
            observations.push(observation); t.diagnostic(JSON.stringify(observation));
            await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}-${phase}.png`) });
            if (!reached) failures.push(`${engine.name()} ${width} ${phase}: delayed anchor not in reading viewport`);
            assert.equal(new URL(page.url()).searchParams.get("fixtureId"), "990099", "native URL retains request only; fixture selection is outside this test");
            assert.equal(new URL(page.url()).searchParams.get("lang"), "pt-BR");
          };
          if (!selectedCase || selectedCase === "navigation") {
            await page.goto(destination); await release(); await observe("initial-hash");
            capacity(); await page.reload(); await release(); await observe("reload-hash");
            // Removing only a fragment can keep the resolved React document.
            // Cold cases cross a different path before loading a fresh promise.
            await page.goto(`${origin}/elsewhere`);
            await page.goto(destination.split("#")[0]);
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await page.locator(`nav a[href="#${anchor}"]`).click();
            // locator.click may scroll the menu into view. Prove that this
            // action alone did not bring the neighboring loader into view,
            // without requiring a brittle exact post-anchor scroll position.
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const beforeResolve = await page.locator(".club-hub-deferred-lineup").evaluate(node => ({
              top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom,
              viewportHeight: innerHeight, scrollY, hash: location.hash,
            }));
            t.diagnostic(JSON.stringify({ engine: engine.name(), width, phase: "click-before-load-precondition", ...beforeResolve }));
            assert.equal(beforeResolve.hash, `#${anchor}`);
            assert.ok(beforeResolve.top >= beforeResolve.viewportHeight,
              "the unresolved lineup must remain entirely below the viewport after the menu click");
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            await release(); await observe("click-before-load");
            await page.evaluate(() => scrollTo(0, 0));
            await page.locator(`nav a[href="#${anchor}"]`).click();
            await observe("click-after-load");
            await page.goto(`${origin}/elsewhere`); await page.goBack();
            if (await page.locator(".club-hub-deferred-lineup").count()) await release();
            await expect(page.locator(`#${anchor}`)).toHaveCount(1); await observe("native-back");
          }
          for (const phase of (["user-changed-hash", "user-scrolled-away"] as const).filter(phase => !selectedCase || phase === selectedCase)) {
            capacity(); await page.goto(`${origin}/elsewhere`); await page.goto(destination);
            await expect(page.locator(".club-hub-deferred-lineup")).toBeVisible();
            await expect(page.locator(`#${anchor}`)).toHaveCount(0);
            if (phase === "user-changed-hash") await page.evaluate(() => { location.hash = "#club-hub-top"; });
            else await page.mouse.wheel(0, 400);
            if (phase === "user-changed-hash") await expect.poll(() => page.locator("#club-hub-top").evaluate(node => {
              const margin = Number.parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
              const documentTop = node.getBoundingClientRect().top + scrollY;
              const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
              const expectedScroll = Math.min(maxScroll, Math.max(0, documentTop - margin));
              return location.hash === "#club-hub-top" && Math.abs(scrollY - expectedScroll) <= 1;
            }), { timeout: 1000 }).toBe(true);
            else await expect.poll(() => page.evaluate(() => scrollY >= 200 && scrollY < 800), { timeout: 1000 }).toBe(true);
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const before = await page.evaluate(() => ({ scrollY, hash: location.hash }));
            // Observe every scrolling event during resolution, not only the
            // final position: a transient jump and return is also a failure.
            await page.evaluate(() => {
              const state = window as unknown as { anchorScrollSamples: number[]; recordAnchorScroll: () => void };
              state.anchorScrollSamples = [scrollY];
              state.recordAnchorScroll = () => { state.anchorScrollSamples.push(scrollY); };
              addEventListener("scroll", state.recordAnchorScroll, { passive: true });
            });
            await release(); await page.waitForTimeout(300);
            const after = await page.evaluate(() => {
              const state = window as unknown as { anchorScrollSamples: number[]; recordAnchorScroll: () => void };
              removeEventListener("scroll", state.recordAnchorScroll);
              return { scrollY, hash: location.hash, samples: [...state.anchorScrollSamples, scrollY] };
            });
            const stable = after.hash === before.hash && after.samples.every(value => value === before.scrollY);
            const observation = { engine: engine.name(), width, phase, stable, before, after };
            observations.push(observation); t.diagnostic(JSON.stringify(observation));
            await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}-${phase}.png`) });
            if (!stable) failures.push(`${engine.name()} ${width} ${phase}: loader stole the user's chosen scroll/hash`);
          }
          assert.deepEqual(forbidden, [], "no API or remote reads permitted");
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    } finally { t.signal.removeEventListener("abort", abort); await browser.close(); }
  }
  t.diagnostic(JSON.stringify(observations));
  assert.deepEqual(failures, [], "native anchor observations; failure does not alone diagnose the Next router");
});
