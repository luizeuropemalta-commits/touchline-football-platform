import { allowsClubOwnerAvatarLocalEnvironment, isClubOwnerAvatarLocalRequestOrigin } from "./club-owner-avatar-local-admission.ts";
import { isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export type AvatarAdmissionDiagnosticCode = "local_origin_rejected" | "local_environment_rejected" | "hosted_environment_unverified"
  | "read_disabled" | "upload_disabled" | "selection_disabled" | "retention_unverified"
  | "configured_actor_invalid" | "actor_unverified" | "actor_mismatch";

/** Internal configuration diagnostic only, never request authorization.
 * No I/O or input values are returned. Auth, RPC, Storage and retention execution
 * still require runtime verification, even with every configuration flag set.
 */
export function inspectClubOwnerAvatarAdmissionConfiguration(input: Readonly<{
  environment: Environment; transport: "local" | "hosted"; requestOrigin: string; expectedActorId?: string;
}>) {
  const { environment, expectedActorId } = input;
  const codes: AvatarAdmissionDiagnosticCode[] = [];
  if (input.transport === "local") {
    if (!isClubOwnerAvatarLocalRequestOrigin(input.requestOrigin)) codes.push("local_origin_rejected");
    if (!allowsClubOwnerAvatarLocalEnvironment(environment, input.requestOrigin)) codes.push("local_environment_rejected");
  } else codes.push("hosted_environment_unverified");
  if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED !== "true") codes.push("read_disabled");
  if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED !== "true") codes.push("upload_disabled");
  if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_SELECTION_ENABLED !== "true") codes.push("selection_disabled");
  if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY !== "true") codes.push("retention_unverified");
  const configuredActor = environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID;
  if (!isAvatarAccountId(configuredActor)) codes.push("configured_actor_invalid");
  if (!isAvatarAccountId(expectedActorId)) codes.push("actor_unverified");
  else if (isAvatarAccountId(configuredActor) && configuredActor.toLowerCase() !== expectedActorId.toLowerCase()) codes.push("actor_mismatch");
  return Object.freeze({ configuration: codes.length ? "blocked" as const : "checks_pending" as const,
    codes: Object.freeze(codes), runtimeVerificationRequired: true as const });
}
