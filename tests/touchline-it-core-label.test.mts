import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUCHLINE_CORE_DRAFT_STATE,
  touchlineCoreDrafts,
} from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";

test("Italian selected TC total follows the established total-in-TC label semantics", () => {
  assert.equal(TOUCHLINE_CORE_DRAFT_STATE, "draft");
  assert.equal(touchlineCoreDrafts["it-IT"].cartTotal, "Totale selezionato in TC");

  assert.equal(touchlineCoreDrafts["es-ES"].cartTotal, "Total de TC seleccionado");
  assert.equal(touchlineCoreDrafts["fr-FR"].cartTotal, "Total TC sélectionné");
});
