import assert from "node:assert/strict";
import test from "node:test";
import { socialAdminFixture } from "./helpers/social-admin-language-fixture.mts";

test("real social Admin page renders both languages and keeps history, checksums, queries and raw approval states", async () => {
  const pt = socialAdminFixture({ invalidDates: true }), en = socialAdminFixture({ invalidDates: true });
  const portuguese = await pt.render({ lang: ["pt-BR", "en-GB"], draftPage: "1", reviewPage: "1" });
  const english = await en.render({ lang: "en-GB", draftPage: "1", reviewPage: "1" });
  assert.match(portuguese, /Publicações sociais/);
  assert.match(english, /Social publications/);
  assert.doesNotMatch(english, /Publicações sociais|Aprovações bloqueadas|Última conclusão|Nenhum|não configurad|Prévia integral/);
  assert.match(portuguese, /alt="Prévia integral Escalação /);
  assert.match(english, /alt="Full preview Lineup /);
  assert.match(portuguese, /Revisão necessária/);
  assert.match(english, /Review required/);
  for (const html of [portuguese, english]) {
    assert.match(html, /HISTORICAL_CAPTION_UNCHANGED/);
    assert.match(html, /EXACT_TEMPLATE_VERSION/);
    assert.match(html, /SOURCE_CHECK_PENDING/);
    assert.doesNotMatch(html, /Invalid Date/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>[^<]*(?:Versão revogada|Version revoked)/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>[^<]*(?:Aprovar template visual|Approve visual template)/);
  }
  for (const [html, locale] of [[portuguese, "pt-BR"], [english, "en-GB"]]) {
    assert.match(html, new RegExp(`/admin\\?lang=${locale}`));
    assert.match(html, new RegExp(`/admin/social-publications/studio\\?lang=${locale}`));
    assert.match(html, new RegExp(`lang=${locale}&amp;draftPage=0&amp;reviewPage=1`));
    assert.match(html, new RegExp(`lang=${locale}&amp;draftPage=2&amp;reviewPage=1`));
    assert.match(html, new RegExp(`lang=${locale}&amp;draftPage=1&amp;reviewPage=0`));
    assert.match(html, new RegExp(`lang=${locale}&amp;draftPage=1&amp;reviewPage=2`));
    assert.match(html, /lang=pt-BR&amp;draftPage=1&amp;reviewPage=1/);
    assert.match(html, /lang=en-GB&amp;draftPage=1&amp;reviewPage=1/);
  }
  assert.equal(JSON.stringify(pt.calls), JSON.stringify(en.calls), "language never changes server queries or private media signing");
});

test("real social page denies anonymous, non-owner and user-editable access claims before data reads", async () => {
  for (const user of [null, { email: "other@example.test", app_metadata: { touchline_arena_access_v1: true } },
    { email: "social-owner@example.test", user_metadata: { touchline_arena_access_v1: true } }]) {
    const f = socialAdminFixture({ user });
    await assert.rejects(f.render({ lang: "pt-BR" }), /SOCIAL_NOT_FOUND/);
    assert.deepEqual(f.calls, [["getUser"], ["notFound"]]);
  }
});

test("real social page localizes configuration, read failure, missing schema and empty states", async () => {
  for (const [lang, config, failure, missing, empty] of [
    ["pt-BR", "Configuração necessária", "Leitura indisponível", "Migration 039 ausente", "Fila vazia"],
    ["en-GB", "Configuration required", "Read unavailable", "Migration 039 missing", "Empty queue"],
  ]) {
    const unconfigured = socialAdminFixture({ configured: false });
    assert.ok((await unconfigured.render({ lang })).includes(config));
    assert.deepEqual(unconfigured.calls, []);
    const failed = await socialAdminFixture({ error: "PRIVATE_FAILURE_SENTINEL" }).render({ lang });
    assert.ok(failed.includes(failure));
    assert.doesNotMatch(failed, /PRIVATE_FAILURE_SENTINEL/);
    assert.ok((await socialAdminFixture({ error: "table does not exist" }).render({ lang })).includes(missing));
    assert.ok((await socialAdminFixture({ drafts: [] }).render({ lang })).includes(empty));
  }
  assert.match(await socialAdminFixture({ configured: false }).render({ lang: "invalid" }), /Social publications/);
});
