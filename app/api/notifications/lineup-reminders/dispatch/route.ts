import { timingSafeEqual } from "node:crypto";
import { parseMatchPushVapidConfig } from "@/lib/touchlineArena/match-push-vapid-config";
import { runLineupReminderAdmission } from "@/lib/touchlineFantasy/lineup-reminder-admission-server";
import { runLineupReminderWorker } from "@/lib/touchlineFantasy/lineup-reminder-worker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function acknowledge(status: string, code: number) {
  return Response.json({ ok: code === 200, status }, { status: code, headers });
}
function positiveInteger(value: string | undefined): number | null {
  if (!value || value.length > 16 || !/^[1-9][0-9]*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
export function GET() {
  return Response.json({ ok: false, status: "method-not-allowed" }, {
    status: 405, headers: { ...headers, Allow: "POST" },
  });
}

export async function POST(request: Request) {
  if (process.env.TOUCHLINE_LINEUP_REMINDER_WORKER_ENABLED !== "true") return acknowledge("disabled", 503);
  const secret = process.env.TOUCHLINE_LINEUP_REMINDER_WORKER_SECRET;
  if (!secret || secret.length < 32 || secret.length > 512) return acknowledge("unauthorized", 401);
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return acknowledge("unauthorized", 401);

  // No recipient or policy comes from the URL/body. Language comes from the
  // recipient's current account preference, reread after delivery reservation.
  const maximumAgeMs = positiveInteger(process.env.TOUCHLINE_LINEUP_REMINDER_MAXIMUM_AGE_MS);
  const leaseSeconds = positiveInteger(process.env.TOUCHLINE_LINEUP_REMINDER_LEASE_SECONDS);
  const competitionId = process.env.TOUCHLINE_LINEUP_REMINDER_COMPETITION_ID;
  const seasonId = process.env.TOUCHLINE_LINEUP_REMINDER_SEASON_ID;
  const leadSeconds = positiveInteger(process.env.TOUCHLINE_LINEUP_REMINDER_LEAD_SECONDS);
  const pageSize = positiveInteger(process.env.TOUCHLINE_LINEUP_REMINDER_PAGE_SIZE);
  const retrySeconds = positiveInteger(process.env.TOUCHLINE_LINEUP_REMINDER_RETRY_SECONDS);
  // Validate and detach transport configuration before admission can write.
  // Nothing is reread from deployment policy after the first await.
  const vapid = parseMatchPushVapidConfig({
    publicKey: process.env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY ?? "",
    privateKey: process.env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY ?? "",
    subject: process.env.TOUCHLINE_WEB_PUSH_SUBJECT ?? "",
  });
  if (maximumAgeMs === null
    || leaseSeconds === null || leaseSeconds > 60 || !competitionId || !UUID.test(competitionId)
    || !seasonId || !UUID.test(seasonId) || leadSeconds === null || leadSeconds > 86_400
    || pageSize === null || pageSize > 50 || retrySeconds === null || retrySeconds > 3_600
    || !vapid) return acknowledge("unconfigured", 503);
  try {
    const admission = await runLineupReminderAdmission({
      enabled: true, competitionId, seasonId, leadSeconds, pageSize, retrySeconds,
    });
    if (!admission || (admission.status !== "complete" && admission.status !== "partial")) return acknowledge("unconfirmed", 503);
    const result = await runLineupReminderWorker({ enabled: true, maximumAgeMs, leaseSeconds, vapid });
    if (result.status === "idle") return acknowledge("idle", 200);
    if (result.status === "unconfigured" || result.status === "disabled") return acknowledge(result.status, 503);
    if (result.status === "processed" && ["provider_accepted", "cancelled", "failed"].includes(result.outcome)) return acknowledge("processed", 200);
    return acknowledge("unconfirmed", 503);
  } catch {
    return acknowledge("unconfirmed", 503);
  }
}
