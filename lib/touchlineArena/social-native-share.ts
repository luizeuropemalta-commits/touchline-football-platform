export type TouchlineNativeShareResult = "shared" | "copied" | "cancelled" | "unavailable";

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

async function readShareableImage(postId: string | undefined, imageUrl: string | undefined, title: string) {
  const sourceUrl = postId
    ? `/api/touchline-social/share-art/${encodeURIComponent(postId)}`
    : imageUrl;
  if (!sourceUrl) return null;
  try {
    const response = await fetch(sourceUrl, {
      credentials: postId ? "same-origin" : "omit",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = blob.type.toLowerCase();
    if (!mimeType.startsWith("image/") || blob.size < 1) return null;
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
