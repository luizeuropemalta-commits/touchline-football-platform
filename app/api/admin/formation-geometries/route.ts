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
  return fetchSite === "same-origin";
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
  const [supabase, admin] = await Promise.all([createClient(), Promise.resolve(createAdminClient())]);
  if (!supabase || !admin) return { error: json({ ok: false, error: "Formation calibration is not configured." }, { status: 503 }) };
  const user = await resolveServerReadWithin(
    supabase.auth.getUser().then(({ data }) => data.user),
    null,
    8_000,
  );
  if (!user?.id || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user.email)) {
    return { error: json({ ok: false, error: "Owner access required." }, { status: 403 }) };
  }
  return { admin, user };
}

async function requestBody(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) return null;
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) return null;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
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
  if (!sameOrigin(request)) return json({ ok: false, error: "Cross-origin formation write blocked." }, { status: 403 });
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
    return json({ ok: true, result: publicResult(data[0]) });
  }

  return json({ ok: false, error: "Unsupported formation command." }, { status: 400 });
}
