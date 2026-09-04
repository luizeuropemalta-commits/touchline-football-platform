import { createHash } from "node:crypto";

import { readTouchlineShareArtwork } from "@/lib/touchlineArena/club-social-feed-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ARTWORK_BYTES = 8_000_000;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

function unavailable(status = 404) {
  return Response.json({ ok: false, error: "Not found" }, { status, headers: NO_STORE_HEADERS });
}

function canonicalStorageOrigin() {
  const configured = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isCanonicalSignedArtworkUrl(value: string, expectedOrigin: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && url.origin === expectedOrigin
      && url.pathname.startsWith("/storage/v1/object/sign/touchline-social-drafts/")
      && Boolean(url.searchParams.get("token"));
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  if (!UUID.test(postId)) return unavailable();
  try {
    const storageOrigin = canonicalStorageOrigin();
    if (!storageOrigin) return unavailable(503);
    const shareArt = await readTouchlineShareArtwork(postId);
    if (!shareArt || !isCanonicalSignedArtworkUrl(shareArt.signedUrl, storageOrigin)) return unavailable();
    const artwork = await fetch(shareArt.signedUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!artwork.ok || (artwork.status >= 300 && artwork.status < 400)) return unavailable(503);
    const mediaType = artwork.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const declaredLength = Number(artwork.headers.get("content-length") ?? "0");
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)
      || (Number.isFinite(declaredLength) && declaredLength > MAX_ARTWORK_BYTES)) return unavailable(503);
    const body = await artwork.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_ARTWORK_BYTES) return unavailable(503);
    const checksum = `sha256:${createHash("sha256").update(new Uint8Array(body)).digest("hex")}`;
    if (checksum !== shareArt.checksum) return unavailable(503);
    return new Response(body, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": mediaType,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch {
    return unavailable(503);
  }
}
