import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  nationality: string | null;
  photo_url: string | null;
  market_value: number | null;
  currency: string | null;
  agent_id: string | null;
  external_market_url: string | null;
  clubs?: ClubJoin;
};

type RadarRow = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  transfermarkt_player_id: string | null;
};

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;
type ExistingAssociationRow = {
  player_id: string | null;
  external_reference_url: string | null;
};

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("agent_player_associations")
      .select(
        "id, status, confidence_score, suggested_name, suggested_position, suggested_club, suggested_photo_url, external_source, external_reference_url, created_at",
      )
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id)
      .eq("status", "suggested")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      suggestions: data ?? [],
      connectors: [
        { name: "Touchline Player Vault", status: "active" },
        { name: "Market Radar Link Preview", status: "active" },
        { name: "Transfermarkt", status: "link-preview-only" },
        { name: "FIFA Agent Registry", status: "future-official-connector" },
        { name: "Licensed Football Data Providers", status: "future-recommended" },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load player suggestions." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);

    const { data: identity, error: identityError } = await admin
      .from("agent_identity_verifications")
      .select("fifa_agent_id, fifa_license_number, verification_status")
      .eq("agency_id", agencyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (identityError) throw new Error(identityError.message);
    if (!identity?.fifa_agent_id && !identity?.fifa_license_number) {
      return NextResponse.json(
        { error: "Add your FIFA Agent ID or license number before running the smart association scan." },
        { status: 400 },
      );
    }

    const { data: existingRows, error: existingError } = await admin
      .from("agent_player_associations")
      .select("player_id, external_reference_url")
      .eq("agency_id", agencyId)
      .eq("agent_user_id", user.id);

    if (existingError) throw new Error(existingError.message);

    const existingAssociations = (existingRows ?? []) as ExistingAssociationRow[];
    const existingPlayerIds = new Set(existingAssociations.map((row) => row.player_id).filter(Boolean));
    const existingUrls = new Set(existingAssociations.map((row) => row.external_reference_url).filter(Boolean));

    const { data: players, error: playersError } = await admin
      .from("players")
      .select(
        "id, first_name, last_name, position, nationality, photo_url, market_value, currency, agent_id, external_market_url, clubs:current_club_id(name)",
      )
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false })
      .limit(16);

    if (playersError) throw new Error(playersError.message);

    const playerSuggestions = ((players ?? []) as PlayerRow[])
      .filter((player) => !existingPlayerIds.has(player.id))
      .slice(0, 10)
      .map((player) => ({
        agency_id: agencyId,
        agent_user_id: user.id,
        player_id: player.id,
        suggested_name: playerName(player),
        suggested_position: player.position,
        suggested_nationality: player.nationality,
        suggested_club: clubName(player.clubs),
        suggested_photo_url: player.photo_url,
        source: "external_suggestion",
        external_source: "touchline_player_vault",
        external_reference_url: player.external_market_url,
        confidence_score: player.agent_id === user.id ? 92 : 68,
        status: "suggested",
        public_visible: false,
        player_snapshot: {
          market_value: player.market_value,
          currency: player.currency,
          external_market_url: player.external_market_url,
        },
        compliance_flags: {
          requires_agent_confirmation: true,
          public_until_verified: false,
        },
      }));

    let radarSuggestions: Array<Record<string, unknown>> = [];
    const { data: radarLinks } = await admin
      .from("market_radar_links")
      .select("id, url, title, description, image_url, site_name, transfermarkt_player_id")
      .eq("agency_id", agencyId)
      .eq("category", "player")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(16);

    if (radarLinks) {
      radarSuggestions = (radarLinks as RadarRow[])
        .filter((link) => !existingUrls.has(link.url))
        .slice(0, 8)
        .map((link) => ({
          agency_id: agencyId,
          agent_user_id: user.id,
          player_id: null,
          suggested_name: link.title?.replace(/\|.*$/g, "").trim() || "External player profile",
          suggested_position: null,
          suggested_nationality: null,
          suggested_club: link.site_name ?? "External source",
          suggested_photo_url: link.image_url,
          source: "external_suggestion",
          external_source: "market_radar_transfermarkt_preview",
          external_reference_url: link.url,
          confidence_score: 54,
          status: "suggested",
          public_visible: false,
          player_snapshot: {
            description: link.description,
            site_name: link.site_name,
            transfermarkt_player_id: link.transfermarkt_player_id,
          },
          compliance_flags: {
            requires_agent_confirmation: true,
            public_until_verified: false,
            source_is_preview_only: true,
          },
        }));
    }

    const suggestions = [...playerSuggestions, ...radarSuggestions];
    if (suggestions.length === 0) {
      return NextResponse.json({
        ok: true,
        created: 0,
        message: "No new suggestions found. Add players or save player links in Market Radar, then run the scan again.",
      });
    }

    const { data: created, error: insertError } = await admin
      .from("agent_player_associations")
      .insert(suggestions)
      .select("id, suggested_name, status");

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      ok: true,
      created: created?.length ?? 0,
      message: `${created?.length ?? 0} suggested player associations created. Confirm only valid representation relationships.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not run smart association scan." },
      { status: 500 },
    );
  }
}
