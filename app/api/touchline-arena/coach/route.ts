import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { readTouchlineCoachContracts } from "@/lib/touchlineArena/coach-contracts-server";
import { resolveCompetitionCardOffer } from "@/lib/touchlineArena/competition-card-offer";
import {
  touchlineCoachClassificationForProviderId,
  TOUCHLINE_LIVE_COACHES,
  touchlineLiveCoachForProviderId,
} from "@/lib/touchlineArena/live-coaches";

const TOUCHLINE_ENGLAND_COMPETITION = "england" as const;
const TOUCHLINE_ENGLAND_SEASON = "2026-27";

async function authenticatedUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) ? user : null;
}

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 4_096) return null;
  const source = await request.text();
  if (!source || source.length > 4_096) return null;
  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read-only offer catalogue for Coach-first. The client receives the resolved
 * display contract only; it never supplies a tier, currency or price.
 */
export async function GET() {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const offers = TOUCHLINE_LIVE_COACHES.map(({ coach }) => {
    const classification = touchlineCoachClassificationForProviderId(coach.providerId);
    if (!classification) throw new Error(`Missing coach classification: ${coach.providerId}`);
    return resolveCompetitionCardOffer({
      subjectType: "coach",
      subjectId: coach.providerId,
      competitionId: TOUCHLINE_ENGLAND_COMPETITION,
      seasonId: TOUCHLINE_ENGLAND_SEASON,
      tierKey: classification.tierKey,
      classification,
    });
  });

  try {
    const contracts = await readTouchlineCoachContracts(admin, user.id);
    return NextResponse.json({
      ok: true,
      competitionId: TOUCHLINE_ENGLAND_COMPETITION,
      seasonId: TOUCHLINE_ENGLAND_SEASON,
      offers,
      activeContract: contracts.find((contract) => contract.status === "active") ?? null,
      contractHistory: contracts.filter((contract) => contract.status === "ended"),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "TL_COACH_CONTRACT_READ_FAILED" }, { status: 500 });
  }
}

/** Starts one TouchLine-authoritative coach contract for the authenticated owner. */
export async function PUT(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ ok: false, error: "TL_COACH_ORIGIN_FORBIDDEN" }, { status: 403 });
  }
  const user = await authenticatedUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const body = await readBoundedJson(request);
  const coachProviderId = typeof body?.coachProviderId === "string" ? body.coachProviderId.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const coach = touchlineLiveCoachForProviderId(coachProviderId);
  if (!coach) return NextResponse.json({ ok: false, error: "TL_ARENA_COACH_INVALID" }, { status: 400 });
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    return NextResponse.json({ ok: false, error: "TL_COACH_HIRE_IDEMPOTENCY_REQUIRED" }, { status: 400 });
  }

  const { data: club, error: clubError } = await admin
    .from("football_clubs")
    .select("id")
    .eq("provider", "sportmonks")
    .eq("provider_team_id", coach.coach.teamId)
    .maybeSingle();
  if (clubError || !club?.id) {
    return NextResponse.json({ ok: false, error: "TL_COACH_CLUB_NOT_CANONICAL" }, { status: 409 });
  }
  const { error } = await admin.rpc("touchline_hire_coach_contract", {
    p_user_id: user.id,
    p_coach_provider_id: coach.coach.providerId,
    p_club_id: club.id,
    p_idempotency_key: idempotencyKey,
  });
  if (error?.code === "42883" || error?.code === "42P01") {
    return NextResponse.json(
      { ok: false, error: "TL_COACH_CONTRACT_SCHEMA_UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (error) {
    const conflict = error.message.includes("TL_COACH_ACTIVE_CONTRACT_EXISTS");
    return NextResponse.json(
      { ok: false, error: conflict ? "TL_COACH_ACTIVE_CONTRACT_EXISTS" : "TL_COACH_HIRE_FAILED" },
      { status: conflict ? 409 : 500 },
    );
  }
  const contracts = await readTouchlineCoachContracts(admin, user.id);
  return NextResponse.json({ ok: true, activeContract: contracts.find((contract) => contract.status === "active") ?? null });
}

/** Ends the current contract without deleting its history or retroactively moving points. */
export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ ok: false, error: "TL_COACH_ORIGIN_FORBIDDEN" }, { status: 403 });
  }
  const user = await authenticatedUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const body = await readBoundedJson(request);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (reason.length < 3 || reason.length > 240 || idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    return NextResponse.json({ ok: false, error: "TL_COACH_END_INVALID" }, { status: 400 });
  }
  const { error } = await admin.rpc("touchline_end_coach_contract", {
    p_user_id: user.id,
    p_end_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const missing = error.message.includes("TL_COACH_ACTIVE_CONTRACT_NOT_FOUND");
    return NextResponse.json(
      { ok: false, error: missing ? "TL_COACH_ACTIVE_CONTRACT_NOT_FOUND" : "TL_COACH_END_FAILED" },
      { status: missing ? 409 : 500 },
    );
  }
  const contracts = await readTouchlineCoachContracts(admin, user.id);
  return NextResponse.json({
    ok: true,
    activeContract: contracts.find((contract) => contract.status === "active") ?? null,
    contractHistory: contracts.filter((contract) => contract.status === "ended"),
  });
}
