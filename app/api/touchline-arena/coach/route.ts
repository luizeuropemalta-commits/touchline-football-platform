import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
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

/**
 * Read-only offer catalogue for Coach-first. The client receives the resolved
 * display contract only; it never supplies a tier, currency or price.
 */
export async function GET() {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

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

  return NextResponse.json({
    ok: true,
    competitionId: TOUCHLINE_ENGLAND_COMPETITION,
    seasonId: TOUCHLINE_ENGLAND_SEASON,
    offers,
  });
}

/** Persists only a canonical coach identity; no financial or contract action occurs here. */
export async function PUT(request: Request) {
  const user = await authenticatedUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const body = await request.json().catch(() => null) as { coachProviderId?: unknown } | null;
  const coachProviderId = typeof body?.coachProviderId === "string" ? body.coachProviderId.trim() : "";
  const coach = touchlineLiveCoachForProviderId(coachProviderId);
  if (!coach) return NextResponse.json({ ok: false, error: "TL_ARENA_COACH_INVALID" }, { status: 400 });

  const { error } = await admin
    .from("touchline_user_arena_state")
    .upsert({
      user_id: user.id,
      coach_provider_id: coach.coach.providerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error?.code === "42703") {
    return NextResponse.json(
      { ok: false, error: "TL_ARENA_COACH_SCHEMA_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
