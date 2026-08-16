import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_CANONICAL_EMAIL,
  TOUCHLINE_QA_CANONICAL_USER_ID,
  TOUCHLINE_QA_PROJECT_REF,
  TouchlineQaPersonaPreflightError,
  assertTouchlineQaCanonicalPersona,
} from "../lib/touchlineArena/qa-canonical-persona.ts";

const canonicalEvidence = {
  projectRef: TOUCHLINE_QA_PROJECT_REF,
  qaAlias: TOUCHLINE_QA_CANONICAL_ALIAS + "/market-transfer?lang=en-GB",
  userId: TOUCHLINE_QA_CANONICAL_USER_ID,
  email: TOUCHLINE_QA_CANONICAL_EMAIL,
  emailConfirmed: true,
  profilePresent: true,
  arenaAccessGranted: true,
};

test("the canonical QA owner and stable qa alias are the only accepted authenticated QA target", () => {
  assert.doesNotThrow(() => assertTouchlineQaCanonicalPersona(canonicalEvidence));
});

test("the QA persona preflight rejects Production, the historical actor, and incomplete identity evidence", () => {
  const cases = [
    [{ ...canonicalEvidence, projectRef: "vxireiswggllwhbsmdcj" }, "qa_project_required"],
    [{ ...canonicalEvidence, qaAlias: "https://touchline.com.br" }, "qa_alias_required"],
    [{ ...canonicalEvidence, userId: "70fd4440-4834-4fd5-a741-d74f00e6dfc6" }, "canonical_qa_user_required"],
    [{ ...canonicalEvidence, email: "touchline.qa.owner@touchline.example" }, "canonical_qa_email_required"],
    [{ ...canonicalEvidence, emailConfirmed: false }, "qa_email_confirmation_required"],
    [{ ...canonicalEvidence, profilePresent: false }, "qa_profile_required"],
    [{ ...canonicalEvidence, arenaAccessGranted: false }, "qa_arena_access_required"],
  ] as const;

  for (const [evidence, code] of cases) {
    assert.throws(
      () => assertTouchlineQaCanonicalPersona(evidence),
      (error: unknown) => error instanceof TouchlineQaPersonaPreflightError && error.code === code,
    );
  }
});
