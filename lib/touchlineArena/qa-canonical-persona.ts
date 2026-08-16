/**
 * Canonical identity contract for authenticated TouchLine QA.
 *
 * This module is deliberately data-only and has no Supabase client, storage,
 * or browser dependency. Callers must prove their environment and identity
 * before starting an authenticated QA journey.
 */
export const TOUCHLINE_QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
export const TOUCHLINE_QA_CANONICAL_EMAIL = "jl_nenelopes10@hotmail.com";
export const TOUCHLINE_QA_CANONICAL_USER_ID = "072900f3-27fc-41a5-9881-6913a486754e";
export const TOUCHLINE_QA_CANONICAL_ALIAS =
  "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";

export type TouchlineQaPersonaEvidence = Readonly<{
  projectRef: string;
  qaAlias: string;
  userId: string;
  email: string;
  emailConfirmed: boolean;
  profilePresent: boolean;
  arenaAccessGranted: boolean;
}>;

export type TouchlineQaPersonaFailure =
  | "qa_project_required"
  | "qa_alias_required"
  | "canonical_qa_user_required"
  | "canonical_qa_email_required"
  | "qa_email_confirmation_required"
  | "qa_profile_required"
  | "qa_arena_access_required";

export class TouchlineQaPersonaPreflightError extends Error {
  readonly code: TouchlineQaPersonaFailure;

  constructor(code: TouchlineQaPersonaFailure) {
    super("TouchLine QA persona preflight failed: " + code);
    this.name = "TouchlineQaPersonaPreflightError";
    this.code = code;
  }
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function origin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Fails closed unless the supplied evidence belongs to the one approved QA
 * owner and stable QA deployment. It intentionally does not authenticate a
 * browser or mutate data.
 */
export function assertTouchlineQaCanonicalPersona(
  evidence: TouchlineQaPersonaEvidence,
): asserts evidence is TouchlineQaPersonaEvidence {
  if (normalize(evidence.projectRef) !== TOUCHLINE_QA_PROJECT_REF) {
    throw new TouchlineQaPersonaPreflightError("qa_project_required");
  }

  if (origin(evidence.qaAlias) !== TOUCHLINE_QA_CANONICAL_ALIAS) {
    throw new TouchlineQaPersonaPreflightError("qa_alias_required");
  }

  if (normalize(evidence.userId) !== TOUCHLINE_QA_CANONICAL_USER_ID) {
    throw new TouchlineQaPersonaPreflightError("canonical_qa_user_required");
  }

  if (normalize(evidence.email) !== TOUCHLINE_QA_CANONICAL_EMAIL) {
    throw new TouchlineQaPersonaPreflightError("canonical_qa_email_required");
  }

  if (!evidence.emailConfirmed) {
    throw new TouchlineQaPersonaPreflightError("qa_email_confirmation_required");
  }

  if (!evidence.profilePresent) {
    throw new TouchlineQaPersonaPreflightError("qa_profile_required");
  }

  if (!evidence.arenaAccessGranted) {
    throw new TouchlineQaPersonaPreflightError("qa_arena_access_required");
  }
}
