import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizeOwner() {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * QA owner-only, read-only evidence endpoint. It deliberately returns only
 * coverage counts and a few non-sensitive sample fields; provider tokens and
 * raw payloads remain server-only.
 */
export async function GET(request: NextRequest) {
  if (!await authorizeOwner()) {
    return NextResponse.json({ ok: false, error: "Owner session required." }, { status: 401 });
  }

  const teamId = text(request.nextUrl.searchParams.get("teamId"));
  if (!/^\d{1,20}$/.test(teamId)) {
    return NextResponse.json({ ok: false, error: "A numeric teamId is required." }, { status: 400 });
  }

  const provider = createFootballDataProvider("sportmonks");
  const [squad, capabilities] = await Promise.all([
    provider.getSquad(teamId),
    provider.getSubscriptionCapabilities(),
  ]);

  if (!squad.ok) {
    return NextResponse.json({ ok: false, teamId, error: squad.error.message }, { status: 502 });
  }

  const players = squad.data;
  const expectedLineupsAvailable = capabilities.ok
    ? [...capabilities.data.resources, ...capabilities.data.enrichments].some((item) => (
      /expected[ -]?lineups?/i.test(`${item.name ?? ""} ${item.endpoint ?? ""} ${item.id}`)
      && item.available !== false
    ))
    : false;

  return NextResponse.json({
    ok: true,
    teamId,
    source: "sportmonks-live-read-only",
    squad: {
      total: players.length,
      withNationality: players.filter((member) => Boolean(text(member.player.nationality))).length,
      withCountryId: players.filter((member) => Boolean(text(member.player.countryId))).length,
      withShirtNumber: players.filter((member) => Number.isInteger(member.jerseyNumber) && Number(member.jerseyNumber) > 0).length,
      sample: players.slice(0, 3).map((member) => ({
        providerPlayerId: member.player.providerId,
        name: member.player.displayName,
        nationality: member.player.nationality ?? null,
        countryId: member.player.countryId ?? null,
        position: member.position ?? member.player.position ?? null,
        shirtNumber: member.jerseyNumber ?? null,
      })),
    },
    capabilities: {
      readable: capabilities.ok,
      expectedLineupsAvailable,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
