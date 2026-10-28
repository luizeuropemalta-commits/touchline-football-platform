import assert from "node:assert/strict";
import test from "node:test";
import { footballDataFixture } from "./helpers/admin-football-page-fixture.mts";
for (const lang of ["pt-BR", "en-GB"]) {
  test(`football Admin ${lang} preserves official identities, diagnostics boundary and localized navigation`, async () => {
    const html = await footballDataFixture({ state: "populated" }).render(lang);
    assert.ok(html.includes(lang === "pt-BR" ? "Base de dados de futebol" : "Football Data Foundation"));
    for (const text of ["Synthetic League", "Synthetic Club", "Synthetic Player"]) assert.ok(html.includes(text));
    assert.ok(html.includes(lang === "pt-BR" ? "Parcial" : "Partial"));
    assert.ok(html.includes(lang === "pt-BR" ? "Placares ao vivo" : "Live scores"));
    assert.ok(html.includes(`/football-search?lang=${lang}`));
    assert.ok(html.includes(`data-control-locale="${lang}"`));
    assert.ok(html.includes(`data-roster-locale="${lang}"`));
    assert.ok(html.includes(lang === "pt-BR" ? "Reconciliação contínua de elencos" : "Continuous roster reconciliation"));
    assert.ok(html.includes(lang === "pt-BR" ? "Carregando histórico…" : "Loading history…"));
    const capture = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes(lang === "pt-BR" ? "Capturar observação" : "Capture observation"));
    assert.ok(capture, "the real roster capture button must render");
    assert.match(capture, /<button[^>]*\sdisabled=""/);
    assert.match(html, /data-qa-controls="false"/);
    assert.doesNotMatch(html, /PRIVATE_FOOTBALL_ERROR|Invalid Date/);
  });
  test(`football Admin ${lang} read errors remain unavailable, without internal diagnostics`, async () => {
    const html = await footballDataFixture({ state: "error" }).render(lang);
    assert.doesNotMatch(html, /PRIVATE_FOOTBALL_ERROR|>0<|>0<\/strong>/);
    assert.ok(html.includes(lang === "pt-BR" ? "Não foi possível consultar os clubes." : "Normalized clubs could not be read."));
    assert.ok(html.includes(lang === "pt-BR" ? "consulta indisponível" : "read unavailable"));
  });
}
test("football Admin rejects unauthorized access and renders localized configuration/empty states", async () => {
  const denied = footballDataFixture({ user: { email: "customer@example.test" } });
  await assert.rejects(denied.render(), /FOOTBALL_DENIED/); assert.deepEqual(denied.calls, []);
  const out = footballDataFixture({ user: null }); const outHtml = await out.render(); assert.match(outHtml, /Entre como proprietário/); assert.doesNotMatch(outHtml, /data-roster-locale/); assert.deepEqual(out.calls, []);
  assert.match(await footballDataFixture({ admin: false }).render(), /Configuração necessária/);
  assert.match(await footballDataFixture().render(), /Nenhuma competição foi importada ainda/);
});

test("football Admin rejected transport reads stay unavailable rather than crashing or masquerading as empty", async () => {
 const html = await footballDataFixture({ state: "rejected" }).render("pt-BR");
 assert.match(html, /Não foi possível consultar os clubes/);
 assert.match(html, /consulta indisponível/);
 assert.doesNotMatch(html, /PRIVATE_FOOTBALL_ERROR|>0<|>0<\/strong>/);
});

test("football Admin times out stalled protected queries and returns an unavailable page", { timeout: 12_000 }, async () => {
 const start = Date.now();
 const html = await footballDataFixture({ state: "stalled" }).render("pt-BR");
 assert.ok(Date.now() - start >= 7_900);
 assert.match(html, /Não foi possível consultar os clubes/);
 assert.match(html, /consulta indisponível/);
 assert.doesNotMatch(html, /PRIVATE_FOOTBALL_ERROR|>0</);
});
