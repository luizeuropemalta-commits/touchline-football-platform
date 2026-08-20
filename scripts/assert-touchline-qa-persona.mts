import { createClient } from "@supabase/supabase-js";

import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_CANONICAL_USER_ID,
  TOUCHLINE_QA_PROJECT_REF,
  assertTouchlineQaSupabaseOrigin,
  assertTouchlineQaCanonicalPersona,
} from "../lib/touchlineArena/qa-canonical-persona.ts";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";

function requiredEnvironment(
  name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "TOUCHLINE_QA_BASE_URL",
) {
  const value = process.env[name];
  if (!value) throw new Error("QA persona preflight requires " + name + ".");
  return value;
}

async function main() {
  const url = requiredEnvironment("SUPABASE_URL");
  const qaAlias = requiredEnvironment("TOUCHLINE_QA_BASE_URL");

  assertTouchlineQaSupabaseOrigin(url);

  if (new URL(qaAlias).origin !== TOUCHLINE_QA_CANONICAL_ALIAS) {
    throw new Error("QA persona preflight refuses a non-canonical QA alias.");
  }

  // Resolve the privileged credential only after both target origins pass.
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authResult, error: authError } = await admin.auth.admin.getUserById(
    TOUCHLINE_QA_CANONICAL_USER_ID,
  );
  if (authError || !authResult.user) {
    throw new Error("QA persona preflight could not read the canonical Auth user.");
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("id", TOUCHLINE_QA_CANONICAL_USER_ID)
    .maybeSingle();
  if (profileError) {
    throw new Error("QA persona preflight could not read the canonical public profile.");
  }

  assertTouchlineQaCanonicalPersona({
    projectRef: TOUCHLINE_QA_PROJECT_REF,
    qaAlias,
    userId: authResult.user.id,
    email: authResult.user.email ?? "",
    emailConfirmed: Boolean(authResult.user.email_confirmed_at),
    profilePresent: profile?.id === TOUCHLINE_QA_CANONICAL_USER_ID,
    arenaAccessGranted: hasTouchLineArenaAccess(authResult.user),
  });

  console.log("QA persona preflight passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown QA persona preflight failure.";
  console.error(message);
  process.exitCode = 1;
});
