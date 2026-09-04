export type TouchlineNativeShareResult = "shared" | "copied" | "cancelled" | "unavailable";

const SHARE_SHA256 = /^sha256:[0-9a-f]{64}$/;
const SHARE_MAX_ARTWORK_BYTES = 8_000_000;
const SHARE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeShareFilename(title: string, mimeType: string) {
  const stem = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72) || "touchline-post";
  const extension = mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : "png";
  return `${stem}.${extension}`;
}

async function blobSha256(blob: Blob) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readCanonicalShareManifest(postId: string) {
  const response = await fetch(`/api/touchline-social/share-art/${encodeURIComponent(postId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const manifest = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!manifest || manifest.ok !== true || typeof manifest.signedUrl !== "string"
    || typeof manifest.checksum !== "string" || !SHARE_SHA256.test(manifest.checksum)) return null;
  try {
    const signedUrl = new URL(manifest.signedUrl);
    if (signedUrl.protocol !== "https:" || signedUrl.username || signedUrl.password) return null;
    return { signedUrl: signedUrl.toString(), checksum: manifest.checksum } as const;
  } catch {
    return null;
  }
}

async function readShareableImage(postId: string | undefined, imageUrl: string | undefined, title: string) {
  try {
    const manifest = postId ? await readCanonicalShareManifest(postId) : null;
    const sourceUrl = manifest?.signedUrl ?? (postId ? null : imageUrl);
    if (!sourceUrl) return null;
    const response = await fetch(sourceUrl, {
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = blob.type.toLowerCase();
    if (!SHARE_MEDIA_TYPES.has(mimeType) || blob.size < 1 || blob.size > SHARE_MAX_ARTWORK_BYTES) return null;
    if (manifest && await blobSha256(blob) !== manifest.checksum) return null;
    return new File([blob], safeShareFilename(title, mimeType), { type: mimeType });
  } catch {
    return null;
  }
}

/**
 * Uses the platform share sheet and includes the exact approved artwork when
 * Web Share Level 2 is available. Text/link sharing and clipboard are bounded
 * fallbacks; this helper never creates an automatic external publication.
 */
export async function shareTouchlinePost(input: Readonly<{
  title: string;
  text: string;
  pageUrl: string;
  postId?: string;
  imageUrl?: string;
}>): Promise<TouchlineNativeShareResult> {
  if (typeof navigator === "undefined") return "unavailable";
  if (typeof navigator.share === "function") {
    const image = await readShareableImage(input.postId, input.imageUrl, input.title);
    const filePayload = image ? {
      title: input.title,
      text: `${input.text}\n\n${input.pageUrl}`,
      files: [image],
    } : null;
    if (filePayload && typeof navigator.canShare === "function" && navigator.canShare(filePayload)) {
      try {
        await navigator.share(filePayload);
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      }
    }
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url: input.pageUrl,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  if (!navigator.clipboard?.writeText) return "unavailable";
  try {
    await navigator.clipboard.writeText(`${input.text}\n\n${input.pageUrl}`);
    return "copied";
  } catch {
    return "unavailable";
  }
}
