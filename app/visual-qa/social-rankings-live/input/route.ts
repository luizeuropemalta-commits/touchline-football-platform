import { prepareRankingsLiveRenderInput } from "@/lib/social-rankings-live-server";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  try {
    return Response.json(await prepareRankingsLiveRenderInput(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Social rankings input preparation failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "RANKINGS_REVIEW_INPUT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
