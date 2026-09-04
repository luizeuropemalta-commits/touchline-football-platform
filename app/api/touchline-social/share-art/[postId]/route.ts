import { readTouchlineShareArtwork } from "@/lib/touchlineArena/club-social-feed-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_RATE_WINDOW_MS = 60_000;
const SHARE_RATE_LIMIT = 12;
const SHARE_MAX_CONCURRENT = 8;
const SHARE_RATE_BUCKET_LIMIT = 2_048;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

type ShareRateBucket = { count: number; resetAt: number };
type ShareRateState = { active: number; buckets: Map<string, ShareRateBucket> };
const shareRateGlobal = globalThis as typeof globalThis & {
  __touchlineShareRateState?: ShareRateState;
};
const shareRateState = shareRateGlobal.__touchlineShareRateState ??= {
  active: 0,
  buckets: new Map(),
};

function unavailable(status = 404) {
  return Response.json({ ok: false, error: "Not found" }, { status, headers: NO_STORE_HEADERS });
}

function shareClientKey(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",", 1)[0]
    ?? request.headers.get("x-real-ip")
    ?? "unknown").trim().slice(0, 96) || "unknown";
}

function acquireShareCapacity(request: Request) {
  const now = Date.now();
  const key = shareClientKey(request);
  if (shareRateState.buckets.size >= SHARE_RATE_BUCKET_LIMIT) {
    for (const [key, bucket] of shareRateState.buckets) {
      if (bucket.resetAt <= now) shareRateState.buckets.delete(key);
    }
  }
  if (shareRateState.buckets.size >= SHARE_RATE_BUCKET_LIMIT && !shareRateState.buckets.has(key)) {
    return { ok: false as const, status: 429, retryAfter: 60 };
  }
  const current = shareRateState.buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + SHARE_RATE_WINDOW_MS }
    : current;
  if (bucket.count >= SHARE_RATE_LIMIT) {
    return { ok: false as const, status: 429, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)) };
  }
  if (shareRateState.active >= SHARE_MAX_CONCURRENT) {
    return { ok: false as const, status: 503, retryAfter: 1 };
  }
  bucket.count += 1;
  shareRateState.buckets.set(key, bucket);
  shareRateState.active += 1;
  let released = false;
  return {
    ok: true as const,
    release() {
      if (released) return;
      released = true;
      shareRateState.active = Math.max(0, shareRateState.active - 1);
    },
  };
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
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  if (!UUID.test(postId)) return unavailable();
  const capacity = acquireShareCapacity(request);
  if (!capacity.ok) {
    return Response.json({ ok: false, error: "Temporarily unavailable" }, {
      status: capacity.status,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(capacity.retryAfter) },
    });
  }
  try {
    const storageOrigin = canonicalStorageOrigin();
    if (!storageOrigin) return unavailable(503);
    const shareArt = await readTouchlineShareArtwork(postId);
    if (!shareArt || !isCanonicalSignedArtworkUrl(shareArt.signedUrl, storageOrigin)) return unavailable();
    return Response.json({ ok: true, signedUrl: shareArt.signedUrl, checksum: shareArt.checksum }, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return unavailable(503);
  } finally {
    capacity.release();
  }
}
