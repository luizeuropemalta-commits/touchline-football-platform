import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createMatchCentreMobileReviewHtml, MATCH_CENTRE_REVIEW_ASSET_PATHS } from "../scripts/qa/match-centre-mobile-review-fixture.mjs";
import { mobileReviewResponse } from "../scripts/qa/serve-mobile-review-preview.mjs";

const require = createRequire(import.meta.url);
const nativeReact = require("react");
const nativeJsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

// Use the real bundled MatchCentre with the host's React dispatcher to render
// all its real JSX in Node. No DOM/browser/network or product logic mock.
function renderFixture(html: string, locale: string) {
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  new vm.Script(script);
  let captured: unknown;
  const testScript = script.replace("const props=", "modules.react=function(m){m.exports=nativeReact};modules['react/jsx-runtime']=function(m){m.exports=nativeJsx};const props=")
    .replace("require('react-dom/client').createRoot(document.getElementById('root')).render(", "capture(");
  assert.ok(testScript.includes("capture("));
  vm.runInNewContext(testScript, {
    nativeReact, nativeJsx, capture: (element: unknown) => { captured = element; },
    location: { href: `http://127.0.0.1:3350/live-review?lang=${locale}` },
    window: {}, document: { addEventListener() {} }, URL, console,
  });
  assert.ok(captured);
  return renderToStaticMarkup(captured);
}

test("actual MatchCentre renders timeline, ratings and both team sheets in eight locales", async () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const html = createMatchCentreMobileReviewHtml({ locale });
    const rendered = renderFixture(html, locale);
    assert.match(rendered, /data-testid="touchline-match-centre"/);
    assert.match(rendered, /data-testid="touchline-verified-match-data"/);
    assert.match(rendered, /Kiernan Dewsbury-Hall/);
    assert.match(rendered, /Tyrique Aaron Delali Yusuff George/);
    assert.match(rendered, /touchline-match-lineups/);
    assert.match(rendered, /8\.95/);
    assert.match(rendered, /review\d+_timelinePanel/);
    assert.match(rendered, /review\d+_pointsSummary/);
    assert.ok(/@media\s*\(min-width:\s*851px\) and \(max-width:\s*1250px\)/.test(html), "real responsive MatchCentre CSS included");
    assert.match(html, /PRÉVIA ISOLADA/);
    assert.match(html, /window\.fetch=async\(\)=>\(\{ok:false,status:503/);
    assert.match(html, /"liveUpdates":false/);
    assert.match(html, /"canReadMatchDetail":false/);
    const srcs = [...rendered.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
    assert.ok(srcs.length > 0, "real rendered crests inspected");
    for (const src of new Set(srcs)) {
      const url = new URL(src, "http://127.0.0.1:3350");
      assert.ok(MATCH_CENTRE_REVIEW_ASSET_PATHS.includes(decodeURIComponent(url.pathname)), `Rendered asset missing from exact manifest: ${src}`);
      assert.ok(existsSync(resolve(import.meta.dirname, "../public", `.${decodeURIComponent(url.pathname)}`)), src);
      const response = await mobileReviewResponse(url.pathname + url.search);
      assert.equal(response.status, 200, src);
      assert.ok(Buffer.isBuffer(response.body) && response.body.length > 0, src);
    }
  }
});

test("fixture has only local manifest logos and rejects an unknown locale", () => {
  assert.equal(MATCH_CENTRE_REVIEW_ASSET_PATHS.length, 3);
  assert.ok(MATCH_CENTRE_REVIEW_ASSET_PATHS.every((path: string) => path.startsWith("/touchlineArena/") && path.endsWith(".png")));
  assert.throws(() => createMatchCentreMobileReviewHtml({ locale: "invalid" }), /Unsupported preview locale/);
});
