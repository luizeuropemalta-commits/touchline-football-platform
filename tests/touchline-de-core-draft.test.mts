import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CORE_DRAFT_STATE,
  TOUCHLINE_DRAFT_LOCALES,
  touchlineCoreDrafts,
} from "../lib/touchlineArena/locale-catalogues/core-drafts.ts";

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort();

test("de-DE core draft is complete enough for static review without opening its public gate", () => {
  const copy = touchlineCoreDrafts["de-DE"];
  assert.equal(TOUCHLINE_CORE_DRAFT_STATE, "draft");
  assert.ok(TOUCHLINE_DRAFT_LOCALES.includes("de-DE"));
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);

  for (const [key, value] of Object.entries(copy)) {
    assert.ok(value.trim(), `${key}: empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/i, key);
  }
});

test("de-DE preserves protected product tokens and interpolation contracts", () => {
  const copy = touchlineCoreDrafts["de-DE"];
  assert.equal(copy.marketTransfer, "Market Transfer");
  assert.equal(copy.touchlineMarketTransfer, "TouchLine Market Transfer");
  assert.equal(copy.touchlineArenaOnline, "TouchLine Arena Online");
  assert.equal(copy.clubHub, "ClubHub");
  assert.equal(copy.playerProfile, "PlayerProfile");
  assert.deepEqual(placeholders(copy.contractTerminationWarning), ["incoming", "outgoing"]);
  assert.deepEqual(placeholders(copy.checkoutCompleted), ["count", "total"]);
  assert.deepEqual(placeholders(copy.cartCapacityError), ["count"]);
  assert.deepEqual(placeholders(copy.useFormationForTwoStrikers), ["formations"]);
});

test("de-DE has German UI labels in the reviewed football, formation and table paths", () => {
  const copy = touchlineCoreDrafts["de-DE"];
  assert.deepEqual({
    lineup: copy.lineup,
    bench: copy.bench,
    confirmSwap: copy.confirmSwap,
    formation: copy.formation,
    goalkeeper: copy.positionGoalkeeper,
    centreBack: copy.positionCentreBack,
    played: copy.playedShort,
    goalDifference: copy.goalDifferenceShort,
  }, {
    lineup: "Aufstellung",
    bench: "Vereinskader",
    confirmSwap: "Wechsel bestätigen",
    formation: "Formation",
    goalkeeper: "Torwart",
    centreBack: "Innenverteidiger",
    played: "Sp.",
    goalDifference: "TD",
  });
});
