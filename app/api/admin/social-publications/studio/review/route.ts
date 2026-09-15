import { studioSameOrigin } from "@/lib/touchlineArena/social-studio-contract";
import { authorizeStudio, invalidateStudioReviewEvidence, startStudioReviewEvidence, tickStudioReviewEvidence } from "@/lib/touchlineArena/social-studio-server";

export const runtime = "nodejs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export async function POST(request: Request) {
  if (!studioSameOrigin(request)) return Response.json({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 });
  const actorId = await authorizeStudio();
  if (!actorId) return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ ok: false, error: "INVALID_FORMAT" }, { status: 415 });
    const text = await request.text();
    if (text.length > 4096) return Response.json({ ok: false, error: "REQUEST_TOO_LARGE" }, { status: 413 });
    const body = JSON.parse(text) as Record<string, unknown>;
    if (typeof body.sessionId !== "string" || !UUID.test(body.sessionId)) throw new Error("INVALID_REVIEW_SESSION");
    if (body.action === "invalidate") {
      await invalidateStudioReviewEvidence(body.sessionId, actorId);
      return Response.json({ ok: true, completedLoops: 0 }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const evidence = body.action === "tick"
      ? await tickStudioReviewEvidence(body.sessionId, actorId)
      : body.action === "start" && typeof body.artId === "string" && typeof body.platform === "string"
        && typeof body.placement === "string" && typeof body.mediaIdentity === "string"
        && Number.isSafeInteger(body.expectedRevision) && Number(body.expectedRevision) >= 0
        ? await startStudioReviewEvidence({ sessionId: body.sessionId, artId: body.artId, platform: body.platform, placement: body.placement as never, mediaIdentity: body.mediaIdentity, expectedRevision: Number(body.expectedRevision) }, actorId)
        : (() => { throw new Error("INVALID_REVIEW_SESSION"); })();
    return Response.json({ ok: true, completedLoops: evidence.completed_loops }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false, error: "REVIEW_SESSION_UNAVAILABLE" }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
