import assert from "node:assert/strict";
import test from "node:test";
import { cardEngineFixture } from "./helpers/admin-card-engine-language-fixture.mts";

test("real Card Engine page normalizes PT/EN, localizes counts and preserves query contracts", async () => {
  const pt = cardEngineFixture(), en = cardEngineFixture();
  const portuguese = await pt.render({ lang: ["pt-BR", "en-GB"] }), english = await en.render({ lang: "en-GB" });
  assert.match(portuguese, /Candidatos canônicos/); assert.match(english, /Canonical candidates/);
  assert.match(portuguese, /1\.234/); assert.match(english, /1,234/);
  for (const [html, lang] of [[portuguese, "pt-BR"], [english, "en-GB"]]) {
    assert.match(html, new RegExp(`/admin\\?lang=${lang}`));
    assert.match(html, /card-engine\?lang=pt-BR/); assert.match(html, /card-engine\?lang=en-GB/);
    assert.match(html, /SYNTHETIC PLAYER/); assert.doesNotMatch(html, /Invalid Date/);
  }
  assert.equal(JSON.stringify(pt.calls), JSON.stringify(en.calls));
  assert.match(await cardEngineFixture().render({ lang: "pt" }), /Canonical candidates/);
});

test("real Card Engine page keeps owner denial and localized auth return links before data reads", async () => {
  for (const lang of ["pt-BR", "en-GB"]) {
    const anonymous = cardEngineFixture({ user: null }), denied = cardEngineFixture({ user: { email: "other@example.test" } });
    const html = await anonymous.render({ lang });
    assert.ok(html.includes(lang === "pt-BR" ? "Entrar" : "Sign in"));
    assert.ok(html.includes(`lang=${lang}`)); assert.ok(decodeURIComponent(html).includes(`/admin/card-engine?lang=${lang}`));
    assert.ok((await denied.render({ lang })).includes(lang === "pt-BR" ? "Card Engine indisponível" : "Card Engine unavailable"));
    assert.deepEqual(anonymous.calls, [["getUser"]]); assert.deepEqual(denied.calls, [["getUser"]]);
  }
});

test("Card Engine read errors are explicit, sanitized and never fabricated zero counts", async () => {
  for (const lang of ["pt-BR", "en-GB"]) for (const source of ["football_players", "touchline_card_editorial_batches", "touchline_card_editorial_overrides", "count"]) {
    const html = await cardEngineFixture({ errors: { [source]: "PRIVATE_DATABASE_SENTINEL" } }).render({ lang });
    assert.doesNotMatch(html, /PRIVATE_DATABASE_SENTINEL/);
    assert.match(html, /—/);
    assert.ok(html.includes(lang === "pt-BR" ? "indisponív" : "unavailable"));
  }
  for (const lang of ["pt-BR", "en-GB"]) {
    const empty = await cardEngineFixture({ empty: true }).render({ lang });
    assert.ok(empty.includes(lang === "pt-BR" ? "Nenhum candidato" : "No candidates"));
    assert.ok((await cardEngineFixture({ nullCount: true }).render({ lang })).includes("—"));
    const missing = await cardEngineFixture({ errors: { touchline_card_editorial_overrides: "column does not exist PRIVATE_DATABASE_SENTINEL" } }).render({ lang });
    assert.doesNotMatch(missing, /PRIVATE_DATABASE_SENTINEL/);
  }
});
