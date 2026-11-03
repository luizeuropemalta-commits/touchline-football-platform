import { buildQaCandidateEnvironments } from "./qa-candidate-environment.mts";
import { inspectClubOwnerAvatarAdmissionConfiguration } from "../../lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts";

import { isClubOwnerAvatarLocalRequestOrigin } from "../../lib/touchlineArena/club-owner-avatar-local-admission.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const FLAGS = ["LOCAL_ENABLED", "READ_ENABLED", "UPLOAD_ENABLED", "SELECTION_ENABLED", "RETENTION_READY"] as const;
export const avatarLocalOrigin = "http://localhost:3319";
/** Separate explicit local composition. No flag is inferred or enabled here.
 * RETENTION_READY is a reviewed operator assertion; this does not prove execution.
 * The caller must select 3100 explicitly; existing launchers keep their default. */
export function buildQaAvatarLocalEnvironment(source: Environment, host: Environment, origin: string = avatarLocalOrigin) {
  if (!isClubOwnerAvatarLocalRequestOrigin(origin)) throw Error("AVATAR_LOCAL_ORIGIN_REJECTED");
  if (Object.keys(source).some(key => source[key] !== undefined && (key === "VERCEL" || key.startsWith("VERCEL_") || key.startsWith("NEXT_PUBLIC_VERCEL_") || key.startsWith("TOUCHLINE_ISOLATED_PREVIEW_")))) throw Error("AVATAR_LOCAL_SOURCE_ENVELOPE_REJECTED");
  if (source.TOUCHLINE_DATA_SOURCE !== undefined && source.TOUCHLINE_DATA_SOURCE !== "direct") throw Error("AVATAR_LOCAL_SOURCE_ENVELOPE_REJECTED");
  for (const flag of FLAGS) if (source[`TOUCHLINE_CLUB_OWNER_AVATAR_${flag}`] !== "true") throw Error("AVATAR_LOCAL_CAPABILITIES_UNCONFIRMED");
  const owners = source.TOUCHLINE_OWNER_EMAILS;
  if (typeof owners !== "string" || !owners.split(",").some(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))) throw Error("AVATAR_LOCAL_OWNER_CLASSIFICATION_REQUIRED");
  const { preview, preflight } = buildQaCandidateEnvironments(source, host, { qaMarketContext: true, clubCollection: true, clubRelease: false });
  // The ordinary candidate builder deliberately emits hosted QA labels. This
  // separate local composition uses only the exact local exception instead.
  for (const key of Object.keys(preview)) if (key === "VERCEL" || key.startsWith("VERCEL_") || key.startsWith("NEXT_PUBLIC_VERCEL_")) delete preview[key];
  for (const flag of FLAGS) preview[`TOUCHLINE_CLUB_OWNER_AVATAR_${flag}`] = source[`TOUCHLINE_CLUB_OWNER_AVATAR_${flag}`]!;
  // Public ranking portraits remain off unless both independent source
  // permissions are explicitly present. This is a local-only composition;
  // the generic candidate builder must not inherit this audience expansion.
  if (source.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED === "true" && source.TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED === "true") {
    preview.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED = "true";
    preview.TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED = "true";
  }
  preview.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID = source.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID ?? "";
  preview.TOUCHLINE_OWNER_EMAILS = owners;
  // Direct mode is represented by an absent override in the runtime contract.
  delete preview.TOUCHLINE_DATA_SOURCE;
  delete preview.TOUCHLINE_DEPLOYMENT_MODE;
  delete preview.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE;
  const report = inspectClubOwnerAvatarAdmissionConfiguration({ environment: preview, transport: "local", requestOrigin: origin,
    expectedActorId: preview.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID });
  if (report.configuration !== "checks_pending") throw Error("AVATAR_LOCAL_CONFIGURATION_REJECTED");
  return { preview, preflight, origin };
}
