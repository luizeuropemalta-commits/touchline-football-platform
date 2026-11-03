import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import {
  parseTouchlineFormationGeometry,
  touchlineFormationGeometryPayload,
  validateTouchlineFormationGeometry,
} from "@/lib/touchlineArena/formation-geometry";

const MAX_REQUEST_BYTES = 80_000;

type GeometryCommandResult = {
  formation_code: string;
  geometry_version: number;
  status: string;
  published_at: string;
  rollback_of_version: number | null;
};

type GeometryRpc = {
  rpc: (name: "touchline_publish_formation_geometry" | "touchline_rollback_formation_geometry", args: Record<string, unknown>) => Promise<{
    data: GeometryCommandResult[] | null;
    error: { message: string } | null;
  }>;
};

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) return origin === request.nextUrl.origin && (!fetchSite || fetchSite === "same-origin");
  return false;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function ownerContext() {
  try {
    const supabase = await createClient();
    if (!supabase) return { error: json({ ok: false, error: "Formation calibration is not configured." }, { status: 503 }) };
    const user = await resolveServerReadWithin(
      supabase.auth.getUser().then(({ data, error }) => error ? null : data.user), null, 8_000,
    );
    if (!user?.id || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) return { error: json({ ok: false, error: "Owner access required." }, { status: 403 }) };
    const admin = createAdminClient();
    if (!admin) return { error: json({ ok: false, error: "Formation calibration is not configured." }, { status: 503 }) };
    return { admin, user };
  } catch { return { error: json({ ok: false, error: "Owner authentication could not be confirmed." }, { status: 503 }) }; }
}

async function requestBody(request: NextRequest) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,12}$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = 0, bodyText = "", complete = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("BODY_TIMEOUT")); void reader.cancel().catch(() => {}); }, 10_000);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) return null;
      bodyText += decoder.decode(value, { stream: true });
    }
    bodyText += decoder.decode();
    if (length !== null && bytes !== Number(length)) return null;
    const parsed: unknown = JSON.parse(bodyText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
  finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function confirmedGeometry(data: unknown, formationCode: string, rollbackOf: number | null): data is GeometryCommandResult[] {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object" || Array.isArray(data[0])) return false;
  const row = data[0] as Record<string, unknown>;
  return row.formation_code === formationCode && Number.isSafeInteger(row.geometry_version) && Number(row.geometry_version) > 0
    && row.status === "published" && typeof row.published_at === "string" && Number.isFinite(Date.parse(row.published_at))
    && row.rollback_of_version === rollbackOf;
}

function publicResult(row: GeometryCommandResult) {
  return {
    formationCode: row.formation_code,
    geometryVersion: row.geometry_version,
    status: row.status,
    publishedAt: row.published_at,
    rollbackOfVersion: row.rollback_of_version,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return json({ ok: false, error: "Cross-origin formation write blocked." }, { status: 403 });
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false, error: "JSON formation command required." }, { status: 415 });
    const body = await requestBody(request);
    if (!body) return json({ ok: false, error: "Invalid or oversized formation command." }, { status: 400 });
    const context = await ownerContext();
    if ("error" in context) return context.error;
    const action = text(body.action, 24);
    const formationCode = text(body.formationCode, 16);
    const reason = text(body.reason, 240);
    const rpc = context.admin as unknown as GeometryRpc;

    if (action === "publish") {
      const geometry = parseTouchlineFormationGeometry(body.geometry, {
        formationCode,
        geometryVersion: 0,
        source: "code-default",
        publishedAt: null,
      });
      if (!geometry || !reason) return json({ ok: false, error: "Formation geometry and change reason are required." }, { status: 400 });
      const validation = validateTouchlineFormationGeometry(geometry);
      if (!validation.publishable) {
        return json({ ok: false, error: "Formation geometry failed validation.", validation }, { status: 422 });
      }
      const { data, error } = await rpc.rpc("touchline_publish_formation_geometry", {
        p_formation_code: formationCode,
        p_geometry: touchlineFormationGeometryPayload(geometry),
        p_validation_report: validation,
        p_actor_id: context.user.id,
        p_change_reason: reason,
        p_rollback_of_version: null,
      });
      if (error || !data?.[0]) return json({ ok: false, error: "Formation publication was rejected." }, { status: 409 });
      if (!confirmedGeometry(data, formationCode, null)) return json({ ok: false, error: "Formation publication could not be confirmed. Check its history before retrying." }, { status: 503 });
      return json({ ok: true, result: publicResult(data[0]), validation });
    }

    if (action === "rollback") {
      const targetVersion = Number(body.targetVersion);
      if (!reason || !Number.isInteger(targetVersion) || targetVersion < 1) {
        return json({ ok: false, error: "Rollback target and reason are required." }, { status: 400 });
      }
      const { data, error } = await rpc.rpc("touchline_rollback_formation_geometry", {
        p_formation_code: formationCode,
        p_target_version: targetVersion,
        p_actor_id: context.user.id,
        p_change_reason: reason,
      });
      if (error || !data?.[0]) return json({ ok: false, error: "Formation rollback was rejected." }, { status: 409 });
      if (!confirmedGeometry(data, formationCode, targetVersion)) return json({ ok: false, error: "Formation rollback could not be confirmed. Check its history before retrying." }, { status: 503 });
      return json({ ok: true, result: publicResult(data[0]) });
    }

    return json({ ok: false, error: "Unsupported formation command." }, { status: 400 });
  } catch {
    return json({ ok: false, error: "Formation command could not be confirmed. Check the publication history before retrying." }, { status: 503 });
  }
}
