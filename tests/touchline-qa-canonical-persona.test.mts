import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_CANONICAL_EMAIL,
  TOUCHLINE_QA_CANONICAL_USER_ID,
  TOUCHLINE_QA_PROJECT_REF,
  TouchlineQaPersonaPreflightError,
  assertTouchlineQaCanonicalPersona,
  assertTouchlineQaSupabaseOrigin,
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

const executablePreflight = fs.readFileSync(
  new URL("../scripts/assert-touchline-qa-persona.mts", import.meta.url),
  "utf8",
);

test("the canonical QA owner and stable qa alias are the only accepted authenticated QA target", () => {
  assert.doesNotThrow(() => assertTouchlineQaCanonicalPersona(canonicalEvidence));
  assert.match(executablePreflight, /hasTouchLineArenaAccess\(authResult\.user\)/);
  assert.doesNotMatch(executablePreflight, /app_metadata\?\.touchline_arena_access\s*===/);
  assert.doesNotMatch(executablePreflight, /TOUCHLINE_QA_CANONICAL_EMAIL/);
  assert.match(executablePreflight, /assertTouchlineQaSupabaseOrigin\(url\)/);
  assert.ok(
    executablePreflight.indexOf("assertTouchlineQaSupabaseOrigin(url)") <
      executablePreflight.indexOf('requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY")'),
  );
});

test("the QA preflight accepts only the exact canonical Supabase origin", () => {
  assert.doesNotThrow(() =>
    assertTouchlineQaSupabaseOrigin(`https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co`),
  );
  assert.doesNotThrow(() =>
    assertTouchlineQaSupabaseOrigin(`https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co/`),
  );

  for (const value of [
    `https://${TOUCHLINE_QA_PROJECT_REF}.attacker.example`,
    `http://${TOUCHLINE_QA_PROJECT_REF}.supabase.co`,
    `https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co:444`,
    `https://user:secret@${TOUCHLINE_QA_PROJECT_REF}.supabase.co`,
    `https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co/rest/v1`,
    `https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co?redirect=attacker`,
    ` https://${TOUCHLINE_QA_PROJECT_REF}.supabase.co`,
  ]) {
    assert.throws(
      () => assertTouchlineQaSupabaseOrigin(value),
      (error: unknown) =>
        error instanceof TouchlineQaPersonaPreflightError &&
        error.code === "qa_supabase_origin_required",
    );
  }
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
