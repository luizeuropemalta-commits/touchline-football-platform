import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getClubCollectionBudgetCopy } from "../lib/touchlineFantasy/market-budget-i18n.ts";
import { getAllocationDialogCopy } from "../lib/touchlineFantasy/allocation-dialog-i18n.ts";
const keys = ["savedFormationUnverified","incompatibleSquadAllocation","confirmCoachToUnlockFormation","fullSquadRecruitmentUnavailable","outsideSlotsExchangeNotice","coachSelectedConfirmBesidePitch","sign","awaitingSigningConfirmation"] as const;
const en = ["Unable to verify the saved formation.","This change would not preserve your bench and squad positions. Choose a compatible position.","Confirm coach signing to unlock formation selection.","Full squad recruitment is not available yet.","15 outside-match slots · Same-position exchanges only. Proposal integration pending.","Coach selected. Confirm signing beside the pitch.","Sign","Awaiting signing confirmation."];
const pt = ["Não foi possível confirmar a formação salva.","Esta alteração não mantém as posições do banco e do elenco. Escolha uma posição compatível.","Confirme a contratação do treinador para liberar a formação.","Elenco completo ainda indisponível para contratação.","15 vagas fora da partida · Trocas somente pela mesma posição. Integração de propostas pendente.","Treinador selecionado. Confirme a contratação junto ao campo.","Contratar","Aguardando confirmação da contratação."];

test("remaining collection feedback preserves PT/EN and gates six drafts", () => {
  for (const gate of [false, true]) {
    assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy("en-GB", gate)[key]), en);
    assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy("pt-BR", gate)[key]), pt);
    assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy("unknown", gate)[key]), en);
    assert.equal(getAllocationDialogCopy("pt-BR", gate).back, "Voltar");
    assert.equal(getAllocationDialogCopy("en-GB", gate).back, "Back");
  }
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy(locale)[key]), en);
    assert.deepEqual(keys.map(key => getClubCollectionBudgetCopy(locale, false)[key]), en);
    for (const key of keys) {
      assert.ok(getClubCollectionBudgetCopy(locale, true)[key].trim());
      assert.doesNotMatch(getClubCollectionBudgetCopy(locale, true)[key], /TODO|undefined/);
    }
    assert.match(getClubCollectionBudgetCopy(locale, true).outsideSlotsExchangeNotice, /15/);
  }
});

test("early feedback uses local pure getters and later signing copy does not change control wiring", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const projection = source.slice(source.indexOf("function applyCollectionSnapshot"), source.indexOf("function applyIncomingRound"));
  assert.ok(projection.includes("const projectionError = getClubCollectionBudgetCopy(locale, draftLocalesEnabled).savedFormationUnverified;"));
  assert.ok(!projection.includes("collectionBudgetCopy."));
  assert.ok(projection.includes("setFeedback(current => current === projectionError ? null : current)"));
  const allocation = source.slice(source.indexOf("async function allocatePlanned"), source.indexOf("function changeFormation"));
  assert.ok(allocation.includes("setFeedback(getClubCollectionBudgetCopy(locale, draftLocalesEnabled).incompatibleSquadAllocation);"));
  assert.ok(allocation.includes("previewPlannedClubAllocation"));
  assert.ok(allocation.includes("return collection.allocate(command)"));
  for (const key of keys.slice(2, 6)) assert.ok(source.includes("collectionBudgetCopy." + key));
  assert.equal((source.match(/collectionBudgetCopy\.sign\b/g) ?? []).length, 2);
  assert.equal((source.match(/collectionBudgetCopy\.awaitingSigningConfirmation\b/g) ?? []).length, 2);
  assert.ok(source.includes("getAllocationDialogCopy(locale, draftLocalesEnabled).back"));
  assert.ok(source.includes('disabled={collection.busy} onClick={() => setCollectionMarketPlayer(null)}'));
  assert.ok(source.includes("onSelect: confirmCollectionMarket"));
  assert.ok(source.includes('locale.startsWith("pt") ? "Liberar jogador" : "Release player"'));
});
