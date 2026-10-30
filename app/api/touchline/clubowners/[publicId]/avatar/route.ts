import "server-only";
import { publicOwnerAvatarService } from "@/lib/touchlineArena/clubowner-public-avatar-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try { return await publicOwnerAvatarService().serve(request, (await context.params).publicId); }
  catch { return Response.json({ error: "unavailable" }, { status: 503, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  } }); }
}
