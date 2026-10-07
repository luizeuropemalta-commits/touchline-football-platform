import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { TOUCHLINE_CORE_DRAFT_STATE, touchlineCoreDrafts } from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";

test("es-ES core draft localizes player profile and the football bench without publishing the locale", () => {
  const copy = touchlineCoreDrafts["es-ES"];

  assert.equal(copy.playerProfile, "Perfil del jugador");
  assert.equal(copy.bench, "Plantilla del club");
  assert.equal(copy.squad, "Plantilla");
  assert.equal(copy.gameBench, "Banquillo del partido");

  assert.equal(TOUCHLINE_CORE_DRAFT_STATE, "draft");
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(isTouchLineLocaleComplete("es-ES"), false);
});
