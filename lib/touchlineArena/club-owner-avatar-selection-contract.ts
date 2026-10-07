import type { projectAvatarRecoveryContext } from "./club-owner-avatar-upload-contract.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

type RecoveryContext = ReturnType<typeof projectAvatarRecoveryContext>;
export type ClubOwnerAvatarSelectionContext = Readonly<{
  accountId: string; revision: string; avatarUrl: string | null; generation: string;
  selectionEnabled: true; retentionReady: true;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const decimal = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value);
const MAX = BigInt("9223372036854775807");
export const CLUB_OWNER_AVATAR_SELECTION_TTL_MS = 60_000;

/** A separate, fail-closed presentation capability. Never turns the recovery
 * DTO's deliberately false canUpload/readyForSelection into authorization. */
export function projectClubOwnerAvatarSelectionContext(context: RecoveryContext | null, selectionEnabled = false, retentionReady = false): ClubOwnerAvatarSelectionContext | null {
  if (!selectionEnabled || !retentionReady || !context || !UUID.test(context.accountId)
    || context.uploadAllowed !== true || context.canUpload !== false || context.readyForSelection !== false
    || context.activeOperationId !== null || context.operationId !== null || context.operationState !== null || context.committedRevision !== null
    || !decimal(context.revision) || BigInt(context.revision) >= MAX
    || !(context.avatarUrl === null || typeof context.avatarUrl === "string" && context.avatarUrl.length <= 512_000)
    || (context.revision !== "0" && (typeof context.avatarUrl !== "string" || !context.avatarUrl.startsWith("/api/account/avatar?version=") || !UUID.test(context.avatarUrl.slice(28))))
    || !decimal(context.generation) || BigInt(context.generation) > MAX - BigInt(2)
    || !(context.fencedThroughGeneration === "-1" || decimal(context.fencedThroughGeneration))
    || BigInt(context.fencedThroughGeneration) >= BigInt(context.generation)) return null;
  return Object.freeze({ accountId: context.accountId, revision: context.revision, avatarUrl: context.avatarUrl,
    generation: context.generation, selectionEnabled: true, retentionReady: true });
}

/** Local admission only; decoding and publication remain server responsibilities. */
export function inspectClubOwnerAvatarSelection(bytes: Uint8Array, type: string): "heic" | "invalid" | null {
  if (/image\/(hei[cf])/.test(type)) return "heic";
  if (!bytes.length || bytes.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) return "invalid";
  const ascii = (start: number, text: string) => [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));
  if (ascii(4, "ftyp") && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some(brand => ascii(8, brand))) return "heic";
  if (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return null;
  if (type === "image/png" && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return null;
  if (type === "image/webp" && ascii(0, "RIFF") && ascii(8, "WEBP")) return null;
  return "invalid";
}
