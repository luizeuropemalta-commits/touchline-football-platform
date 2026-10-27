import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { chromium, firefox, webkit } from "@playwright/test";

const enabled = process.env.TOUCHLINE_RUN_PAGE_SAFE_AREA_BROWSER_TESTS === "1";
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("next/package.json"))("postcss");
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function clubHubCss() {
  const source = ts.createSourceFile("page.tsx", read("app/touchline-clubs/[club]/page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const styles: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "style") {
      for (const child of node.children) {
        if (!ts.isJsxExpression(child) || !child.expression) continue;
        const expression = child.expression;
        if (ts.isNoSubstitutionTemplateLiteral(expression)) styles.push(expression.text);
        else if (ts.isTemplateExpression(expression)) {
          // Resolve no server expressions or football data. Dynamic selectors
          // elsewhere are irrelevant to these literal wrapper rules.
          styles.push(expression.head.text + expression.templateSpans.map(span => `fixture-token${span.literal.text}`).join(""));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(styles.length, 1, "Use the real ClubHub page stylesheet");
  return styles[0];
}

function wrapperCss(css: string, selector: string, expectedRules: number) {
  const rules: string[] = [];
  postcss.parse(css).walkRules((rule: {
    selector: string; toString(): string;
    parent?: { type: string; name?: string; params?: string; parent?: unknown };
  }) => {
    if (rule.selector !== selector) return;
    let serialized = rule.toString();
    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      assert.equal(parent.type, "atrule");
      assert.equal(parent.name, "media", "Preserve every real breakpoint around the wrapper");
      serialized = `@media ${parent.params} { ${serialized} }`;
      parent = parent.parent as typeof parent;
    }
    rules.push(serialized);
  });
  assert.equal(rules.length, expectedRules, "Do not silently omit a production wrapper override");
  const selected = rules.join("\n");
  const insets = /env\(safe-area-inset-(left|right|bottom)(?:,\s*0px)?\)/g;
  assert.ok([...selected.matchAll(insets)].length >= 3);
  // Headless engines have no physical notch. Only env inputs are replaced;
  // production selectors, declarations, ordering and media queries survive.
  return selected.replace(insets, (_, edge: string) => `var(--fixture-safe-${edge}, 0px)`);
}

test("page wrappers preserve baseline spacing and clear simulated safe areas in three engines", {
  skip: !enabled, timeout: 120_000,
}, async t => {
  const surfaces = [
    { name: "rankings", className: "content", css: wrapperCss(read("app/rankings/touchline-tables.module.css"), ".content", 2) },
    { name: "clubHub", className: "club-hub-content", css: wrapperCss(clubHubCss(), ".club-hub-content", 4) },
  ];
  // Independent pre-change spacing expectations for these exact viewports.
  const viewports = [
    { width: 844, height: 390, rankings: [20, 10, 36], clubHub: [12, 14, 28] },
    { width: 926, height: 428, rankings: [20, 27.78, 36], clubHub: [12, 14, 28] },
    { width: 600, height: 960, rankings: [20, 10, 36], clubHub: [18, 10, 36] },
    { width: 768, height: 1024, rankings: [20, 10, 36], clubHub: [22, 14, 42] },
    { width: 1024, height: 768, rankings: [20, 30.72, 36], clubHub: [42, 51.2, 64] },
    { width: 1280, height: 800, rankings: [20, 38.4, 36], clubHub: [42, 64, 64] },
    { width: 1440, height: 900, rankings: [20, 43.2, 36], clubHub: [42, 72, 64] },
    { width: 1920, height: 1080, rankings: [20, 44, 36], clubHub: [42, 96, 64] },
  ];
  const scenarios = [
    { name: "zero", left: 0, right: 0, bottom: 0 },
    { name: "left-notch", left: 47, right: 0, bottom: 21 },
    { name: "right-notch", left: 0, right: 47, bottom: 21 },
  ];
  for (const engine of [chromium, webkit, firefox]) {
    const browser = await engine.launch({ headless: true });
    const abort = () => { void browser.close(); };
    t.signal.addEventListener("abort", abort, { once: true });
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block" });
        try {
          const page = await context.newPage();
          const errors: string[] = [], requests: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
          for (const surface of surfaces) for (const inset of scenarios) {
            const label = `${engine.name()} ${surface.name} ${viewport.width}x${viewport.height} ${inset.name}`;
            // Empty geometry probe only: no site fixture, assets or invented data.
            await page.setContent(`<style>
              *{box-sizing:border-box}html,body{margin:0}
              :root{--fixture-safe-left:${inset.left}px;--fixture-safe-right:${inset.right}px;--fixture-safe-bottom:${inset.bottom}px}
              ${surface.css}
              #probe{height:100vh;width:100%}
              </style><main id="wrapper" class="${surface.className}"><div id="probe" aria-hidden="true"></div></main>`);
            await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
            const result = await page.evaluate(() => {
              const wrapper = document.getElementById("wrapper")!;
              const child = document.getElementById("probe")!;
              const style = getComputedStyle(wrapper);
              const box = child.getBoundingClientRect(), outer = wrapper.getBoundingClientRect();
              return {
                padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat),
                left: box.left, rightGap: document.documentElement.clientWidth - box.right,
                bottomGap: innerHeight - box.bottom, outerBottomGap: outer.bottom - box.bottom,
                width: box.width, scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth, wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
              };
            });
            assert.ok(result.width > 0, `${label}: content remains visible`);
            assert.ok(result.left >= inset.left - .1 && result.rightGap >= inset.right - .1, `${label}: content clears both physical edges`);
            assert.ok(result.bottomGap >= inset.bottom - 1, `${label}: end of content clears the bottom inset when scrolled to the end`);
            assert.ok(result.scrollWidth <= result.clientWidth && result.wrapperOverflow <= 0, `${label}: no horizontal overflow`);
            assert.ok(Math.abs(result.left - result.padding[3]) < .15 && Math.abs(result.rightGap - result.padding[1]) < .15, `${label}: computed padding matches real content geometry`);
            assert.ok(Math.abs(result.outerBottomGap - result.padding[2]) < .15, `${label}: bottom padding is actually laid out`);
            if (inset.name === "zero") {
              const [top, side, bottom] = surface.name === "rankings" ? viewport.rankings : viewport.clubHub;
              for (const [index, expected] of [top, side, bottom, side].entries()) {
                assert.ok(Math.abs(result.padding[index] - expected) < .15, `${label}: baseline side ${index} remains ${expected}px`);
              }
            }
          }
          assert.deepEqual(errors, []);
          assert.deepEqual(requests, [], "Layout proof makes no network or provider calls");
        } finally { await context.close(); }
      }
    } finally {
      t.signal.removeEventListener("abort", abort);
      await browser.close();
    }
  }
});
