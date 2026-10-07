import sharp from "sharp";
import { getClubOwnerAvatarResourceAdmission, type ClubOwnerAvatarResourceScope } from "./club-owner-avatar-resource-admission.ts";
import { createAvatarEnvironmentGuard } from "./club-owner-avatar-upload-contract.ts";

export const CLUB_OWNER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const CLUB_OWNER_AVATAR_MAX_PIXELS = 16_000_000;
export const CLUB_OWNER_AVATAR_MAX_EDGE = 512;

export type ClubOwnerAvatarError = "empty" | "too_large" | "pixel_limit" | "unsupported_format"
  | "heic_unsupported" | "animated" | "invalid_image" | "resource_unavailable";
export type ClubOwnerAvatarValidation =
  | Readonly<{ ok: true; bytes: Buffer; contentType: "image/webp"; width: number; height: number }>
  | Readonly<{ ok: false; error: ClubOwnerAvatarError }>;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function inputFormat(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function isHeicContainer(bytes: Buffer) {
  if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const end = Math.min(bytes.length, bytes.readUInt32BE(0));
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (offset === 12) continue; // ISO-BMFF minor version, not a brand.
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(bytes.toString("ascii", offset, offset + 4))) return true;
  }
  return false;
}

// libvips can expose only APNG's default PNG image. Reject the animation
// container explicitly instead of relying solely on metadata.pages.
function hasAnimation(bytes: Buffer, format: "jpeg" | "png" | "webp") {
  if (format === "jpeg") return false;
  let offset = format === "png" ? 8 : 12;
  const overhead = format === "png" ? 12 : 8;
  while (offset + overhead <= bytes.length) {
    const length = format === "png" ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
    const type = bytes.toString("ascii", offset + (format === "png" ? 4 : 0), offset + (format === "png" ? 8 : 4));
    if (length > bytes.length - offset - overhead) return false; // Decoder will reject truncated input.
    if (format === "png" && type === "acTL") return true;
    if (format === "webp" && (type === "ANIM" || type === "ANMF" || (type === "VP8X" && length >= 1 && (bytes[offset + 8] & 2) !== 0))) return true;
    if (format === "png" && type === "IEND") return false;
    offset += length + overhead + (format === "webp" ? length % 2 : 0);
  }
  return false;
}

/** Node-only byte validator. No paths, URLs, MIME claims, storage, auth or logs.
 * The request layer separately bounds streamed bytes and wall time. Admission
 * bounds local avatar jobs only; Sharp's timeout excludes worker-queue waiting.
 */
export async function validateClubOwnerAvatar(input: Uint8Array,
  options: { resourceScope?: ClubOwnerAvatarResourceScope; signal?: AbortSignal; expiresAt?: number; assertEnvironment?: () => void } = {}): Promise<ClubOwnerAvatarValidation> {
  const resources = getClubOwnerAvatarResourceAdmission();
  const owned = options.resourceScope === undefined;
  const scope = owned ? resources.tryAcquire() : options.resourceScope;
  if (!scope) return { ok: false, error: "resource_unavailable" };
  const { signal, expiresAt } = options;
  const assertConfiguration = createAvatarEnvironmentGuard(options.assertEnvironment);
  const guard = () => {
    assertConfiguration();
    resources.assertOpen(scope);
    if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || performance.now() >= expiresAt)) throw Error("AVATAR_RESOURCE_DEADLINE");
    signal?.throwIfAborted();
  };
  try {
    guard();
    const result = await resources.runNative(scope, () => normalizeAvatar(input, guard));
    guard(); return result;
  } catch { return { ok: false, error: "resource_unavailable" }; }
  finally { if (owned) resources.close(scope); }
}

// This promise follows the original native job, not the caller's timeout race.
// One child spans metadata and processing; cancellation blocks a later stage.
async function normalizeAvatar(input: Uint8Array, guard: () => void): Promise<ClubOwnerAvatarValidation> {
  guard();
  if (!(input instanceof Uint8Array)) return { ok: false, error: "invalid_image" };
  if (input.byteLength === 0) return { ok: false, error: "empty" };
  if (input.byteLength > CLUB_OWNER_AVATAR_MAX_BYTES) return { ok: false, error: "too_large" };
  // Snapshot caller-owned bytes before the first await; never hand Sharp a path.
  const bytes = Buffer.from(input);
  const format = inputFormat(bytes);
  if (!format) return { ok: false, error: isHeicContainer(bytes) ? "heic_unsupported" : "unsupported_format" };
  if (hasAnimation(bytes, format)) return { ok: false, error: "animated" };
  try {
    const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: CLUB_OWNER_AVATAR_MAX_PIXELS, sequentialRead: true });
    const metadata = await decoder.metadata();
    guard();
    if (metadata.format !== format) return { ok: false, error: "invalid_image" };
    if ((metadata.pages ?? 1) !== 1 || metadata.loop !== undefined || (metadata.delay?.length ?? 0) > 0) return { ok: false, error: "animated" };
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 1 || metadata.height < 1) return { ok: false, error: "invalid_image" };
    if (metadata.width * metadata.height > CLUB_OWNER_AVATAR_MAX_PIXELS) return { ok: false, error: "pixel_limit" };
    // Full decode/re-encode, not a metadata-only acceptance. Sharp strips EXIF,
    // XMP, IPTC and ICC by default; do not add keepMetadata/withMetadata here.
    const { data, info } = await decoder.autoOrient()
      .resize({ width: CLUB_OWNER_AVATAR_MAX_EDGE, height: CLUB_OWNER_AVATAR_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 3 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
    guard();
    if (info.format !== "webp" || !data.length || info.width < 1 || info.height < 1
      || info.width > CLUB_OWNER_AVATAR_MAX_EDGE || info.height > CLUB_OWNER_AVATAR_MAX_EDGE) return { ok: false, error: "invalid_image" };
    return { ok: true, bytes: data, contentType: "image/webp", width: info.width, height: info.height };
  } catch (error) {
    try { guard(); } catch { return { ok: false, error: "resource_unavailable" }; }
    // Stable structured result only; never expose native decoder text or bytes.
    return { ok: false, error: error instanceof Error && error.message === "Input image exceeds pixel limit" ? "pixel_limit" : "invalid_image" };
  }
}
