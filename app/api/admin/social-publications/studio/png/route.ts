import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeStudio } from "@/lib/touchlineArena/social-studio-server";
import { assertTouchlineSocialQaRuntime, createTouchlineSocialArtifactStorageFromEnvironment } from "@/lib/touchlineArena/social-artifact-storage-server";
import { STUDIO_PNG_COLUMNS, studioPngLocator, studioPngBytesMatch, type StudioPngDraft } from "@/lib/touchlineArena/social-studio-png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer" };
const failure = (status: number) => NextResponse.json({ error: "PNG_UNAVAILABLE" }, { status, headers });
export async function GET(request: NextRequest) {
  if (!await authorizeStudio()) return failure(401);
  try {
    assertTouchlineSocialQaRuntime();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return failure(400);
    const admin = createAdminClient(), storage = createTouchlineSocialArtifactStorageFromEnvironment();
    if (!admin || !storage) return failure(503);
    const { data: draft, error } = await admin.from("touchline_social_publication_drafts").select(STUDIO_PNG_COLUMNS).eq("id", id).maybeSingle<StudioPngDraft>();
    if (error) return failure(503);
    const locator = draft && studioPngLocator(draft);
    if (!draft || !locator) return failure(404);
    const stored = await storage.readExact(locator);
    if (!studioPngBytesMatch(draft, stored)) return failure(409);
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(Buffer.from(stored.bytes), { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(stored.bytes.byteLength), "Content-Disposition": `${disposition}; filename="touchline-${id}.png"` } });
  } catch { return failure(503); }
}
