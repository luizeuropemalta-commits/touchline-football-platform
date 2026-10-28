import assert from "node:assert/strict";
import test from "node:test";
import { ownerFixture } from "./helpers/admin-owner-page-fixture.mts";

for (const [lang, heading, nav, empty, health] of [
  ["pt-BR", "Painel do proprietário TouchLine", "Inventário de cards", "Nenhum ClubOwner cadastrado ainda.", "Configurado, não verificado"],
  ["en-GB", "TouchLine Owner Panel", "Card Inventory", "No ClubOwners registered yet.", "Configured, not verified"],
]) {
  test(`owner dashboard ${lang}: translated navigation and honest availability`, async () => {
    const f = ownerFixture(); const html = await f.render(lang);
    for (const text of [heading, nav, empty, health]) assert.ok(html.includes(text), text);
    const links = [...html.matchAll(/href="(\/admin[^\"]*)"/g)].map(match => match[1]);
    assert.equal(links.length, 13);
    for (const route of ["/admin/company-finance/mail", "/admin/company-finance/alerts", "/admin/coaches"]) assert.ok(links.includes(`${route}?lang=${lang}`));
    assert.ok(links.every(link => link.endsWith(`?lang=${lang}`)));
    assert.ok(f.calls.indexOf("ownerCheck") < f.calls.indexOf("authList"));
    assert.ok(f.calls.indexOf("ownerCheck") < f.calls.findIndex(call => call.startsWith("read:")));
    assert.doesNotMatch(html, /PRIVATE_OWNER_ERROR/);
  });
  test(`owner dashboard ${lang}: errors do not become zero or leak server errors`, async () => {
    const f = ownerFixture({ fail: true }); const html = await f.render(lang);
    assert.ok(html.includes(lang === "pt-BR" ? "Os usuários autenticados estão temporariamente indisponíveis." : "Authenticated users are temporarily unavailable."));
    assert.ok(html.includes(lang === "pt-BR" ? "consulta indisponível" : "read unavailable"));
    assert.doesNotMatch(html, /PRIVATE_OWNER_ERROR|>0</);
  });
}
test("owner dashboard denies customer before privileged reads, and localizes signed-out/configuration states", async () => {
  const denied = ownerFixture({ user: { id: "customer", email: "customer@example.test" } });
  await assert.rejects(denied.render(), /OWNER_NOT_FOUND/);
  assert.deepEqual(denied.calls, ["ownerCheck"]);
  for (const lang of ["pt-BR", "en-GB"]) {
    const signedOut = ownerFixture({ user: null }); const html = await signedOut.render(lang);
    assert.ok(html.includes(lang === "pt-BR" ? "Entre com a conta" : "Sign in with the TouchLine"));
    assert.equal(signedOut.calls.length, 0);
    const unavailable = ownerFixture({ admin: false });
    assert.ok((await unavailable.render(lang)).includes(lang === "pt-BR" ? "Configuração necessária" : "Configuration required"));
    assert.deepEqual(unavailable.calls, ["ownerCheck"]);
  }
});

test("populated owner dashboard translates operation states while preserving identities and exact TC", async () => {
  const html = await ownerFixture({ populated: true }).render("pt-BR");
  for (const text of ["Synthetic Member", "Synthetic Player", "Placares ao vivo", "Concluída", "Não atribuída", "Publicado", "Disponível", "Concessão histórica #3", "4-3-3 salva", "123,45 TC", "Mercado"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /live_scores|>success<|>unassigned<|published|available/);
  const en = await ownerFixture({ populated: true }).render("en-GB");
  for (const text of ["Live scores", "Completed", "Unassigned", "Published", "Available", "123.45 TC"]) assert.ok(en.includes(text), text);
});

test("owner dashboard preserves unknown operation codes without inheriting Object properties", async () => {
  for (const frameCode of ["__proto__", "constructor", "future-tier"]) {
    const html = await ownerFixture({ populated: true, frameCode }).render("pt-BR");
    assert.ok(html.includes(`>${frameCode}</p>`));
    assert.ok(html.includes("Synthetic Player"));
  }
});
