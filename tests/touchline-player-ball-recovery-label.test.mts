import assert from "node:assert/strict";
import test from "node:test";
import { localizedStatLabel, TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_LOCALES, TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_STATUS } from "../lib/touchlineArena/player-statistic-labels.ts";

test("ball recovery uses Portuguese after code normalization", () => {
  for (const code of ["ball-recovery", "BALL_RECOVERY"]) {
    for (const enabled of [false, true]) {
      assert.equal(localizedStatLabel(code, "unrecognized_sentinel", "pt-BR", enabled), "Recuperações de bola");
    }
  }
});

test("ball recovery preserves English readable fallback", () => {
  for (const code of ["ball-recovery", "BALL_RECOVERY"]) {
    for (const enabled of [false, true]) {
      assert.equal(localizedStatLabel(code, "ball-recovery", "en-GB", enabled), "Ball recovery");
      assert.equal(localizedStatLabel(code, "provider_label", "en-GB", enabled), "Provider label");
    }
  }
});

test("PT-only correction leaves six drafts unchanged", () => {
  const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
  assert.deepEqual(TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_LOCALES, drafts);
  assert.equal(TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_STATUS, "draft");
  for (const locale of drafts) {
    for (const code of ["ball-recovery", "BALL_RECOVERY"]) {
      for (const enabled of [false, true]) {
        assert.equal(localizedStatLabel(code, "ball-recovery", locale, enabled), "Ball recovery", `${locale}:${code}:${enabled}`);
      }
    }
  }
});
