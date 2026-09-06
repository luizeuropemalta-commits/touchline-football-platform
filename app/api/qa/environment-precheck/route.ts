import { inspectTouchlineQaVercelEnvironment } from "../../../../lib/touchlinePreview/qa-environment-verifier-core.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configuration only. PASS does not verify credentials, sessions or a database. */
export function GET(request: Request) {
  const result = inspectTouchlineQaVercelEnvironment({
    environment: process.env,
    requestHostname: new URL(request.url).hostname,
  });
  return Response.json(result, {
    status: result.status === "PASS" ? 200 : 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
