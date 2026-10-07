import { timingSafeEqual } from "node:crypto";
import { runMatchPushWorker } from "@/lib/touchlineArena/match-push-worker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const headers = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};
function acknowledge(status: string, code: number) {
  return Response.json({ ok: code === 200, status }, { status: code, headers });
}

export function GET() {
  return Response.json({ ok: false, status: "method-not-allowed" }, {
    status: 405, headers: { ...headers, Allow: "POST" },
  });
}

export async function POST(request: Request) {
  if (process.env.TOUCHLINE_MATCH_PUSH_WORKER_ENABLED !== "true") return acknowledge("disabled", 503);
  const secret = process.env.TOUCHLINE_MATCH_PUSH_WORKER_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) return acknowledge("unauthorized", 401);
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return acknowledge("unauthorized", 401);
  }
  // Only trusted server settings govern freshness and transport. Request bodies
  // and query strings cannot widen policy or select a recipient/event.
  const rawPolicy = process.env.TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY;
  if (!rawPolicy || Buffer.byteLength(rawPolicy) > 1024) return acknowledge("unconfigured", 503);
  let maximumAgeMs: unknown;
  try { maximumAgeMs = JSON.parse(rawPolicy); }
  catch { return acknowledge("unconfigured", 503); }
  try {
    const result = await runMatchPushWorker({
      enabled: true,
      maximumAgeMs,
      vapid: {
        publicKey: process.env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY ?? "",
        privateKey: process.env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY ?? "",
        subject: process.env.TOUCHLINE_WEB_PUSH_SUBJECT ?? "",
      },
    });
    if (result.status === "idle") return acknowledge("idle", 200);
    if (result.status === "unconfigured") return acknowledge("unconfigured", 503);
    if (result.status === "disabled") return acknowledge("disabled", 503);
    if (result.status === "processed" && ["provider_accepted", "cancelled", "failed"].includes(result.outcome)) {
      return acknowledge("processed", 200);
    }
    return acknowledge("unconfirmed", 503);
  } catch {
    return acknowledge("unconfirmed", 503);
  }
}
