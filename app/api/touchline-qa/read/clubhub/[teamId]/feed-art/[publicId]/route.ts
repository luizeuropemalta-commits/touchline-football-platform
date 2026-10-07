export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired public artwork proxy. Keep the existing URL closed in every
// environment without reading parameters, football, social data or Storage.
export async function GET() {
  return Response.json({ ok: false, error: "Not found" }, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
