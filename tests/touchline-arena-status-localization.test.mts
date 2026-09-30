import assert from "node:assert/strict";
import test from "node:test";

import { touchLineT } from "../lib/touchlineArena/i18n.ts";

test("Arena operational statuses are localized through the shared TouchLine dictionary", () => {
  assert.equal(touchLineT("en-GB", "arenaCleared"), "Arena cleared");
  assert.equal(touchLineT("pt-BR", "arenaCleared"), "Arena limpa");
  assert.equal(touchLineT("pt-BR", "savedLocallySyncUnavailable"), "Salvo neste dispositivo · sincronização da conta indisponível");
  assert.equal(touchLineT("pt-BR", "formationLockedLocally"), "Formação travada neste dispositivo");
  assert.equal(touchLineT("pt-BR", "fixtureNeedsElevenStarters"), "O jogo tem menos de 11 titulares");
  assert.equal(touchLineT("pt-BR", "chooseReserve"), "escolha um reserva");
});

test("player-card ordering copy uses the public TouchLine Rating name rather than a provider label or retired player points", () => {
  assert.equal(
    touchLineT("en-GB", "playerOrderDescription"),
    "Player cards are ordered by accumulated verified TouchLine Rating, highest first.",
  );
  assert.equal(
    touchLineT("pt-BR", "playerOrderDescription"),
    "Os cards de jogadores são ordenados pela Nota TouchLine verificada acumulada, do maior para o menor.",
  );
});
