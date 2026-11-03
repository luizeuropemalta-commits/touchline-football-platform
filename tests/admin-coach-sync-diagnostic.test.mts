import assert from "node:assert/strict";
import test from "node:test";
import { footballDataFixture } from "./helpers/admin-football-page-fixture.mts";
const summary = { version: 1, reason: "coach-editorial-identity-pending", pendingCoachCount: 1, pendingFixtureCount: 0 };
for (const locale of ["pt-BR", "en-GB"]) {
  test(`admin coach diagnosis ${locale}: actual page SSR explains editorial blockage and removes raw fields`, async () => {
    const html = await footballDataFixture({ state: "populated", coachDiagnostic: { ...summary, pendingCoachIds: ["99991"], raw: { email: "PRIVATE@example.invalid", token: "PRIVATE_TOKEN" } } }).render(locale);
    assert.match(html, locale === "pt-BR" ? /Ranking dos treinadores aguarda revisão do catálogo/ : /Coach ranking awaits catalogue review/);
    assert.match(html, new RegExp(`/admin/coaches\\?lang=${locale}`));
    assert.doesNotMatch(html, /99991|PRIVATE@example|PRIVATE_TOKEN|PRIVATE_FOOTBALL_ERROR/);
  });
  test(`admin coach diagnosis ${locale}: legacy and corrupt records never imply an invented cause`, async () => {
    for (const coachDiagnostic of [undefined, null, { ...summary, reason: "PRIVATE_REASON" }, { ...summary, pendingCoachCount: -1 }]) {
      const html = await footballDataFixture({ state: "populated", coachDiagnostic }).render(locale);
      assert.doesNotMatch(html, /Coach ranking awaits catalogue review|Ranking dos treinadores aguarda revisão do catálogo|PRIVATE_REASON/);
    }
    const html = await footballDataFixture({ state: "populated", coachDiagnostic: { ...summary, reason: "ranking-unconfirmed", pendingCoachCount: null } }).render(locale);
    assert.match(html, locale === "pt-BR" ? /Motivo do bloqueio do ranking não confirmado/ : /Ranking blockage reason not confirmed/);
    assert.doesNotMatch(html, /\/admin\/coaches\?lang=/);
  });
}
test("coach diagnosis remains owner-only and is not queried for a customer or unauthenticated visitor", async () => {
  const customer = footballDataFixture({ user: { email: "customer@example.invalid" }, state: "populated", coachDiagnostic: summary });
  await assert.rejects(customer.render(), /FOOTBALL_DENIED/); assert.equal(customer.calls.length, 0);
  const anonymous = footballDataFixture({ user: null, state: "populated", coachDiagnostic: summary });
  const html = await anonymous.render(); assert.equal(anonymous.calls.length, 0);
  assert.doesNotMatch(html, /Ranking dos treinadores aguarda revisão/);
});
