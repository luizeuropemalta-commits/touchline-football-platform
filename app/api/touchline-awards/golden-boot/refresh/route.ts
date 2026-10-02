import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import { produceGoldenBootSnapshot } from "@/lib/touchlineArena/golden-boot-producer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Finite hosting bound, below the worker's abandonment recovery grace. This
// is not a claim that every in-flight network request can be cancelled.
export const maxDuration = 45;

const headers = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};
function response(status: string, httpStatus: number) {
  return NextResponse.json({ ok: httpStatus === 200, status }, { status: httpStatus, headers });
}
function authorized(request: NextRequest) {
  const secret = process.env.TOUCHLINE_GOLDEN_BOOT_REFRESH_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(supplied, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function logFailure(result: { status: unknown; reason: unknown; diagnostic?: unknown }) {
  const raw = result.diagnostic;
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  // Re-project even trusted producer metadata: never serialize its raw object,
  // quota trace, exception, identifier or provider response.
  const phase = d.phase === "provider_setup" || d.phase === "stages" || d.phase === "topscorers" ? d.phase : null;
  const category = typeof d.category === "string" && ["not_configured", "unsupported", "invalid_request", "not_found",
    "rate_limited", "provider_error", "deadline", "exception"].includes(d.category) ? d.category : null;
  const reason = typeof result.reason === "string" && ["PROVIDER_UNAVAILABLE", "EVIDENCE_INVALID", "CANONICAL_UNAVAILABLE",
    "PERSISTENCE_UNCONFIRMED"].includes(result.reason) ? result.reason : null;
  try {
    console.warn(JSON.stringify({ event: "golden_boot_refresh_failure",
      status: result.status === "unavailable" ? "unavailable" : "unconfirmed", reason, phase, category,
      httpStatus: typeof d.httpStatus === "number" && Number.isInteger(d.httpStatus) && d.httpStatus >= 100 && d.httpStatus <= 599 ? d.httpStatus : null,
      elapsedMs: typeof d.elapsedMs === "number" && Number.isSafeInteger(d.elapsedMs) && d.elapsedMs >= 0 && d.elapsedMs <= 45_000 ? d.elapsedMs : null,
    }));
  } catch { /* Logging must not change the committed outcome or invocation ack. */ }
}

/** Trusted scheduler only. No browser session, body, query string, league or
 * token supplied by a caller can override canonical producer admission. */
export async function POST(request: NextRequest) {
  if (process.env.TOUCHLINE_GOLDEN_BOOT_REFRESH_ENABLED !== "true") return response("disabled", 503);
  if (!authorized(request)) return response("unauthorized", 401);
  try {
    const admin = createAdminClient();
    if (!admin) return response("not_configured", 503);
    const result = await produceGoldenBootSnapshot({ admin, createProvider: createFootballDataProvider });
    if (result.status !== "stored" && result.status !== "skipped") logFailure(result);
    // Operational provider traces and SQL errors remain private. The public
    // GET is the only award read authority; this is merely an invocation ack.
    switch (result.status) {
      case "stored": case "skipped": return response(result.status, 200);
      case "unavailable": return response("unavailable", 502);
      default: return response("unconfirmed", 503);
    }
  } catch { return response("unconfirmed", 503); }
}

export function GET() {
  return NextResponse.json({ ok: false, status: "method_not_allowed" }, {
    status: 405, headers: { ...headers, Allow: "POST" },
  });
}
