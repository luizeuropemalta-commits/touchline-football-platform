import { pathToFileURL } from "node:url";
import { buildQaCandidateEnvironments } from "./qa-candidate-environment.mts";
import { inspectClubOwnerAvatarAdmissionConfiguration } from "../../lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts";
import { TOUCHLINE_QA_SUPABASE_ORIGIN } from "../../lib/touchlineArena/qa-canonical-persona.ts";

/** Configuration projection only: uses the real builder with inert placeholders,
 * never authenticates or connects. Placeholder credentials cannot reach a server.
 * Actor intentionally remains unverified; this is not runtime readiness proof. */
export function inspectCandidateAvatarConfiguration() {
  const { preview } = buildQaCandidateEnvironments({
    SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "diagnostic-only-anon-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "diagnostic-only-service-placeholder",
    TOUCHLINE_SITE_LOCALES_ENABLED: "true",
  }, {}, { qaMarketContext: true, clubCollection: true, clubRelease: false });
  const inspect = (requestOrigin: string) => inspectClubOwnerAvatarAdmissionConfiguration({ environment: preview, transport: "local", requestOrigin });
  return Object.freeze({ basis: "canonical-builder-configuration-projection", credentialsRead: false,
    serverStarted: false, authenticated: false, retentionExecutionVerified: false,
    candidate3100: inspect("http://localhost:3100"), contract3319: inspect("http://localhost:3319"),
    hostedEnvelopePresent: Object.keys(preview).some(key => key === "VERCEL" || key.startsWith("VERCEL_")),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw Error();
    console.log(JSON.stringify(inspectCandidateAvatarConfiguration()));
  } catch {
    console.error(JSON.stringify({ error: "AVATAR_CONFIGURATION_PREFLIGHT_FAILED", detailsWithheld: true }));
    process.exitCode = 1;
  }
}
