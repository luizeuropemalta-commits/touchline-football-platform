import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildMobileReviewHtml, mobileReviewResponse, REVIEW_LOCALES, startMobileReviewServer } from "../scripts/qa/serve-mobile-review-preview.mjs";

test("preview server is import-safe and real components render in all eight locales", () => {
  assert.equal(REVIEW_LOCALES.length, 8);
  for (const locale of REVIEW_LOCALES) {
    const html = buildMobileReviewHtml(locale);
    assert.ok(html.includes(`<html lang="${locale}"`));
    assert.match(html, /data-fixture-carousel="continuous"/);
    assert.match(html, /data-fixture-run="original"/);
    assert.match(html, /<footer class="footer"/);
    assert.match(html, /touchline_preview_fixture/);
    assert.match(html, /Dados sintéticos para revisão visual/);
    assert.match(html, /Instagram demonstrativo/);
    assert.equal((html.slice(0, html.indexOf("<script>")).match(/<a[^>]+data-state=/g) ?? []).length, 10);
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    assert.ok(script);
    assert.doesNotThrow(() => new vm.Script(script), `${locale} bundle compiles`);
    assert.match(script, /window\.fetch=async\(\)=>\(\{ok:false/);
    assert.match(script, /hydrateRoot/);
  }
});

test("only allowlisted locale queries and local asset paths are served", async () => {
  assert.equal((await mobileReviewResponse("/?lang=pt-BR")).status, 200);
  assert.equal((await mobileReviewResponse("/", "HEAD")).body, "");
  assert.equal((await mobileReviewResponse("/arena?lang=pt-BR", "HEAD")).status, 200);
  for (const target of ["/?lang=xx", "/?token=secret", "/?lang=pt-BR&lang=en-GB", "https://example.test/", "//example.test/"]) {
    assert.equal((await mobileReviewResponse(target)).status, 400, target);
  }
  for (const path of ["/api/football-data/fantasy/livescores", "/.env.local", "/package.json", "/../../.env", "/%2e%2e/.env", "/touchlineArena/.env", "/touchlineArena/no-such-image.png", "/touchlineArena/shared/club-logos/2026-27/arsenal.png?token=x"]) {
    assert.equal((await mobileReviewResponse(path)).status, 404, path);
  }
  assert.equal((await mobileReviewResponse("/", "POST")).status, 405);
  const logo = await mobileReviewResponse("/touchlineArena/shared/club-logos/2026-27/arsenal.png");
  assert.equal(logo.status, 200);
  assert.equal(logo.type, "image/png");
  assert.ok(Buffer.isBuffer(logo.body) && logo.body.length > 0);
  const arenaAsset = await mobileReviewResponse("/touchlineArena/cards/templates/zoom/clubs/Arsenal%20FC/market-tiers/radiant-gold.webp");
  assert.equal(arenaAsset.status, 200);
  assert.equal(arenaAsset.type, "image/webp");
  for (const version of ["2026-07-21-1", "2026-07-28-1"]) {
    assert.equal((await mobileReviewResponse(`/touchlineArena/cards/templates/zoom/clubs/Arsenal%20FC/market-tiers/radiant-gold.webp?v=${version}`)).status, 200);
  }
  for (const query of ["?v=2026-07-21-1&v=2026-07-21-1", "?v=2026-07-21-1&signature=abc", "?v=../../secret", "?v=", "?v=2026-07-21-1&token=secret"]) {
    assert.equal((await mobileReviewResponse(`/touchlineArena/cards/templates/zoom/clubs/Arsenal%20FC/market-tiers/radiant-gold.webp${query}`)).status, 404);
  }
});

test("server requires explicit invocation, loopback binding and network-blocking policy", () => {
  assert.throws(() => startMobileReviewServer(80), /Invalid loopback port/);
  const source = readFileSync(new URL("../scripts/qa/serve-mobile-review-preview.mjs", import.meta.url), "utf8");
  assert.match(source, /\.listen\(port, "127\.0\.0\.1"\)/);
  assert.match(source, /import\.meta\.url === pathToFileURL/);
  assert.match(source, /connect-src 'none'/);
  assert.doesNotMatch(source, /process\.env|\.env\.local|createAdminClient|supabase-js/);
});
