import { buildQaCandidateEnvironments } from "./qa-candidate-environment.mts";
import { inspectClubOwnerAvatarAdmissionConfiguration } from "../../lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const FLAGS = ["LOCAL_ENABLED", "READ_ENABLED", "UPLOAD_ENABLED", "SELECTION_ENABLED", "RETENTION_READY"] as const;
export const avatarLocalOrigin = "http://localhost:3319";
/** Separate explicit local composition. No flag is inferred or enabled here.
 * RETENTION_READY is a reviewed operator assertion; this does not prove execution.
 * Existing hosted/3100 launch paths and their gates are unchanged. */
export function buildQaAvatarLocalEnvironment(source: Environment, host: Environment) {
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
  preview.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID = source.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID ?? "";
  preview.TOUCHLINE_OWNER_EMAILS = owners;
  preview.TOUCHLINE_DATA_SOURCE = "direct";
  const report = inspectClubOwnerAvatarAdmissionConfiguration({ environment: preview, transport: "local", requestOrigin: avatarLocalOrigin,
    expectedActorId: preview.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID });
  if (report.configuration !== "checks_pending") throw Error("AVATAR_LOCAL_CONFIGURATION_REJECTED");
  return { preview, preflight, origin: avatarLocalOrigin };
}
