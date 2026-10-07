import assert from "node:assert/strict";
import test from "node:test";
import { buildLineupReminderNotification } from "../lib/touchlineFantasy/lineup-reminder-notification.ts";

const identityId = "00000000-0000-4000-8000-000000000001";
test("both reminder categories have concise localized copy and a Market destination", () => {
  for (const locale of ["pt-BR", "en-GB"] as const) {
    for (const kind of ["missing_xi", "complete_unconfirmed"] as const) {
      const payload = buildLineupReminderNotification({ identityId, kind, locale });
      assert.ok(payload);
      assert.equal(payload.href, `/clubowner?lang=${locale}`);
      assert.equal(payload.tag, `lineup:${identityId}`);
      assert.equal(payload.title, locale === "pt-BR" ? "Seu time está esperando" : "Your team is waiting");
      assert.ok(payload.body.length < 160);
      assert.equal(payload.update, false);
      assert.ok(!("eventIcon" in payload), "use existing TouchLine logo, not a goal icon");
      if (locale === "pt-BR") assert.equal(payload.body, kind === "missing_xi" ? "Monte sua escalação" : "Confirme sua escalação");
      else assert.equal(payload.body, kind === "missing_xi" ? "Build your lineup" : "Confirm your lineup");
    }
  }
});
test("invalid notification identities, kinds and locales cannot produce public messages", () => {
  for (const input of [null, {}, { identityId: "https://outside.invalid", kind: "missing_xi", locale: "en-GB" },
    { identityId, kind: "goal", locale: "en-GB" }, { identityId, kind: "missing_xi", locale: "bad" }]) {
    assert.equal(buildLineupReminderNotification(input as never), null);
  }
});
