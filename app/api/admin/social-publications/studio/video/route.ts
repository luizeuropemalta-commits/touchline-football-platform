import { studioMediaIdentity } from "@/lib/touchlineArena/social-studio-artifact";
import type { StudioPlacement } from "@/lib/touchlineArena/social-studio-catalog";
import { authorizeStudio, currentStudioMedia } from "@/lib/touchlineArena/social-studio-server";
import { createStudioReviewStorageFromEnvironment } from "@/lib/touchlineArena/social-studio-storage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await authorizeStudio()) return new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const query = new URL(request.url).searchParams;
  const media = currentStudioMedia(query.get("artId") ?? "", query.get("placement") as StudioPlacement);
  if (!media || query.get("identity") !== studioMediaIdentity(media)) return new Response(null, { status: 404 });
  try {
    const storage = createStudioReviewStorageFromEnvironment();
    if (!storage) throw new Error("TL_STUDIO_STORAGE_UNAVAILABLE");
    const signedUrl = await storage.createSignedPreview(media, 300);
    return new Response(null, { status: 307, headers: {
      Location: signedUrl,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
}
