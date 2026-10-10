import type { Buffer } from "node:buffer";

/** Shared byte-validation contract; deliberately independent of the Node-only
 * Sharp implementation so Edge workers can type-check their upload boundary. */
export type ClubOwnerAvatarError = "empty" | "too_large" | "pixel_limit" | "unsupported_format"
  | "heic_unsupported" | "animated" | "invalid_image" | "resource_unavailable";
export type ClubOwnerAvatarValidation =
  | Readonly<{ ok: true; bytes: Buffer; contentType: "image/webp"; width: number; height: number }>
  | Readonly<{ ok: false; error: ClubOwnerAvatarError }>;
