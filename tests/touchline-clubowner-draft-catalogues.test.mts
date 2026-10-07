import assert from "node:assert/strict";
import test from "node:test";
import { getTouchlineFantasyMarketWorkflowCopy, TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { getTouchlineFantasyMarketAccessCopy, TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES } from "../lib/touchlineFantasy/market-access-i18n.ts";
import { getTouchlineFantasyMarketMetricsCopy, TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES } from "../lib/touchlineFantasy/market-metrics-i18n.ts";
import { getTouchlineFantasyMarketStateCopy, TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES, touchlineFantasyLineupErrorCopy, touchlineFantasyStatusCopy, touchlineFantasyStepLabel } from "../lib/touchlineFantasy/market-state-i18n.ts";
import { getTouchlineFantasyMarketClockCopy, TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES, formatTouchlineFantasyClockUnit } from "../lib/touchlineFantasy/market-clock-i18n.ts";

const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("ClubOwner explicitly opts into each authored catalogue without changing public fallback", () => {
  const surfaces = [
    [getTouchlineFantasyMarketWorkflowCopy, TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES],
    [getTouchlineFantasyMarketAccessCopy, TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES],
    [getTouchlineFantasyMarketMetricsCopy, TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES],
    [getTouchlineFantasyMarketStateCopy, TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES],
    [getTouchlineFantasyMarketClockCopy, TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES],
  ] as const;
  for (const [getCopy, catalogues] of surfaces) {
    for (const locale of drafts) {
      assert.equal(getCopy(locale), catalogues["en-GB"]);
      assert.equal(getCopy(locale, false), catalogues["en-GB"]);
      assert.equal(getCopy(locale, true), catalogues[locale]);
      // Opt-in is request-local: a later public call still uses the public gate.
      assert.equal(getCopy(locale), catalogues["en-GB"]);
    }
    for (const locale of ["en-GB", "pt-BR"] as const) {
      assert.equal(getCopy(locale, true), getCopy(locale));
    }
    for (const locale of [undefined, null, "", "unknown", "__proto__", "constructor"]) {
      assert.equal(getCopy(locale, true), catalogues["en-GB"]);
    }
  }
});

test("ClubOwner status, server errors and steps retain the opted-in language", () => {
  for (const locale of drafts) {
    const copy = TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES[locale];
    assert.equal(touchlineFantasyStatusCopy("MARKET_OPEN", locale, true), copy.states.MARKET_OPEN);
    assert.equal(touchlineFantasyStatusCopy(undefined, locale, true), "—");
    assert.equal(touchlineFantasyStatusCopy("unknown", locale, true), "—");
    assert.equal(touchlineFantasyLineupErrorCopy("private-unknown-detail", locale, true), copy.errorFallback);
    assert.equal(touchlineFantasyLineupErrorCopy("__proto__", locale, true), copy.errorFallback);
    assert.equal(touchlineFantasyStepLabel("coach", locale, true), copy.steps.coach);
    assert.equal(touchlineFantasyStatusCopy("MARKET_OPEN", locale), TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES["en-GB"].states.MARKET_OPEN);
  }
});

test("accessible countdown preserves French and Arabic plurals only under page opt-in", () => {
  assert.equal(formatTouchlineFantasyClockUnit(1, "hour", "fr-FR", true), "1 heure");
  assert.equal(formatTouchlineFantasyClockUnit(2, "hour", "fr-FR", true), "2 heures");
  const arabic = TOUCHLINE_FANTASY_MARKET_CLOCK_CATALOGUES["ar-SA"].units.hour;
  for (const [count, category] of [[0, "zero"], [1, "one"], [2, "two"], [3, "few"], [11, "many"], [100, "other"]] as const) {
    assert.equal(formatTouchlineFantasyClockUnit(count, "hour", "ar-SA", true), arabic[category].replace("{count}", String(count)));
  }
  assert.equal(formatTouchlineFantasyClockUnit(2, "hour", "ar-SA"), "2 hours");
  assert.equal(formatTouchlineFantasyClockUnit(0, "hour", "pt-BR", true), "0 horas");
});
