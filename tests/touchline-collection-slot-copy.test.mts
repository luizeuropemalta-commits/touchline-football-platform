import test from "node:test";
import assert from "node:assert/strict";
import { getAllocationDialogCopy } from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";

test("slot copy preserves published literals and keeps six drafts opt-in", () => {
  const keys = ["reserves", "cardUnavailable", "signPlayer", "slot", "change", "changePlayer", "awaitingSquad", "noPlayersInUnit", "unassignedPositions"] as const;
  const en = ["Substitutes", "Card unavailable", "Sign player", "Slot", "Change", "Change player", "Awaiting squad confirmation.", "No players in this unit.", "Unassigned positions"];
  const pt = ["Reservas", "Card indisponível", "Contratar jogador", "Vaga", "Alterar", "Alterar jogador", "Aguardando confirmação do elenco.", "Nenhum atleta neste setor.", "Vagas a definir"];
  for (const gate of [false, true]) {
    assert.deepEqual(keys.map(key => getAllocationDialogCopy("en-GB", gate)[key]), en);
    assert.deepEqual(keys.map(key => getAllocationDialogCopy("pt-BR", gate)[key]), pt);
    assert.deepEqual(keys.map(key => getAllocationDialogCopy("pt-PT", gate)[key]), pt);
    assert.deepEqual(keys.map(key => getAllocationDialogCopy("unknown", gate)[key]), en);
  }
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    assert.deepEqual(keys.map(key => getAllocationDialogCopy(locale)[key]), en);
    assert.deepEqual(keys.map(key => getAllocationDialogCopy(locale, false)[key]), en);
    for (const key of keys) {
      assert.ok(getAllocationDialogCopy(locale, true)[key].trim());
      assert.doesNotMatch(getAllocationDialogCopy(locale, true)[key], /TODO|undefined|\{.*?\}/);
    }
    assert.notEqual(getAllocationDialogCopy(locale, true).awaitingSquad, getAllocationDialogCopy(locale, true).noPlayersInUnit);
  }
});
