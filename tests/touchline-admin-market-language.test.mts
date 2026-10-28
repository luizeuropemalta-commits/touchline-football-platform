import assert from "node:assert/strict";
import test from "node:test";
import { marketValueFixture } from "./helpers/admin-market-value-page-fixture.mts";
for (const lang of ["pt-BR", "en-GB"]) {
  test(`Market Admin ${lang} renders values, pending state and search locale without altering money`, async () => {
    const f = marketValueFixture({ state: "populated" }); const html = await f.render(lang, "  player_%  ");
    assert.ok(html.includes(lang === "pt-BR" ? "Administração de valores de mercado" : "Market Value Admin"));
    assert.ok(html.includes(lang === "pt-BR" ? "Confiança verificada" : "Confidence verified"));
    assert.match(html, /Synthetic Player/); assert.doesNotMatch(html, /Invalid Date/);
    assert.ok(html.includes(lang === "pt-BR" ? "Valor de mercado pendente" : "Market Value Pending"));
    assert.ok(html.includes(lang === "pt-BR" ? "Verificado" : "Verified"));
    assert.match(html, new RegExp(`name="lang" value="${lang}"`));
    assert.ok(html.includes(`/admin?lang=${lang}`));
    assert.deepEqual(f.filters, ["football_players.display_name:%player%"]);
    assert.ok(html.includes(new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(1000000)));
  });
  for (const state of ["error", "rejected"] as const) test(`Market Admin ${lang} ${state} is unavailable, not empty or zero`, async () => {
    const html = await marketValueFixture({ state }).render(lang);
    assert.doesNotMatch(html, /PRIVATE_MARKET_ERROR|>0<|No matching TouchLine|Nenhum valor de mercado/);
    assert.ok(html.includes(lang === "pt-BR" ? "indisponíveis" : "unavailable") || html.includes(lang === "pt-BR" ? "Não foi possível consultar" : "could not be read"));
  });
}
test("Market Admin denies customers before data reads and localizes signed-out and unconfigured views", async () => {
  const denied = marketValueFixture({ user: { email: "customer@example.test" } });
  await assert.rejects(denied.render(), /MARKET_DENIED/); assert.deepEqual(denied.calls, []);
  const out = marketValueFixture({ user: null }); assert.match(await out.render(), /Entre como proprietário/); assert.deepEqual(out.calls, []);
  const missing = marketValueFixture({ admin: false }); assert.match(await missing.render(), /Configuração necessária/); assert.deepEqual(missing.calls, []);
  assert.match(await marketValueFixture().render(), /Nenhum valor de mercado da TouchLine corresponde à busca/);
});
