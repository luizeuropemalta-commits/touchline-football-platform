import { NextResponse } from "next/server";
import { fetchLinkPreview, getTransfermarktPlayerId, validatePreviewUrl } from "@/lib/link-preview";
import { upsertGlobalPlayerProfile } from "@/lib/player-database";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type ClubJoin = { name?: string | null } | Array<{ name?: string | null }> | null;

function clubName(clubs?: ClubJoin) {
  if (!clubs) return null;
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : (clubs.name ?? null);
}

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanDate(value: unknown) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanCountry(value: unknown) {
  const text = cleanText(value, 2).toUpperCase();
  return text.length === 2 ? text : null;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Player",
  };
}

function normalizeHttpsUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validateTransfermarktUrl(value: unknown) {
  const url = validatePreviewUrl(cleanText(value, 500));
  if (!url) return null;
  if (!url.hostname.toLowerCase().endsWith("transfermarkt.com")) return null;
  return url;
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ players: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data, error } = await admin
      .from("players")
      .select(
        "id, first_name, last_name, date_of_birth, nationality, position, preferred_foot, status, market_value, currency, photo_url, contract_end_date, height_cm, weight_kg, external_market_provider, external_market_player_id, external_market_url, external_market_payload, ai_profile, stats, created_at, updated_at, clubs:current_club_id(name)",
      )
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      players: (data ?? []).map((player) => ({
        id: player.id,
        name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
        firstName: player.first_name,
        lastName: player.last_name,
        dateOfBirth: player.date_of_birth,
        nationality: player.nationality,
        position: player.position,
        preferredFoot: player.preferred_foot,
        status: player.status,
        marketValue: player.market_value,
        currency: player.currency,
        photoUrl: player.photo_url,
        contractEndDate: player.contract_end_date,
        heightCm: player.height_cm,
        weightKg: player.weight_kg,
        club: clubName(player.clubs as ClubJoin),
        externalProvider: player.external_market_provider,
        externalPlayerId: player.external_market_player_id,
        externalUrl: player.external_market_url,
        externalPayload: player.external_market_payload,
        aiProfile: player.ai_profile,
        stats: player.stats,
        createdAt: player.created_at,
        updatedAt: player.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load players." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const fullName = cleanText(body.name, 180);
    if (!fullName) return NextResponse.json({ error: "Player name is required." }, { status: 400 });

    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { firstName, lastName } = splitName(fullName);
    const currentClub = cleanText(body.currentClub, 180);
    let currentClubId: string | null = null;

    if (currentClub) {
      const { data: club, error: clubError } = await admin
        .from("clubs")
        .upsert(
          {
            agency_id: agencyId,
            name: currentClub,
          },
          { onConflict: "agency_id,name" },
        )
        .select("id")
        .single();

      if (clubError) throw new Error(clubError.message);
      currentClubId = club.id;
    }

    const transfermarktUrl = validateTransfermarktUrl(body.transfermarktUrl);
    let photoUrl = normalizeHttpsUrl(body.photoUrl);
    let externalPayload: Record<string, unknown> = {};

    if (transfermarktUrl) {
      const preview = await fetchLinkPreview(transfermarktUrl);
      if (!photoUrl && preview.image) photoUrl = preview.image;
      externalPayload = {
        source: "transfermarkt",
        profileUrl: transfermarktUrl.toString(),
        previewTitle: preview.title,
        previewDescription: preview.description,
        previewImage: preview.image,
        siteName: preview.siteName,
        linkedBy: user.id,
        linkedAt: new Date().toISOString(),
        note: "Transfermarkt URL imported as link preview. Touchline stores metadata and click-through reference, not a copied database.",
      };
    }

    const preferredFoot = cleanText(body.preferredFoot, 12).toLowerCase();
    const normalizedFoot = ["left", "right", "both"].includes(preferredFoot) ? preferredFoot : null;
    const transfermarktProfile = transfermarktUrl?.toString() ?? null;

    const { data: player, error } = await admin
      .from("players")
      .insert({
        agency_id: agencyId,
        current_club_id: currentClubId,
        agent_id: user.id,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: cleanDate(body.dateOfBirth),
        nationality: cleanCountry(body.nationality),
        position: cleanText(body.position, 80) || null,
        preferred_foot: normalizedFoot,
        status: "active",
        market_value: cleanNumber(body.marketValue),
        currency: cleanText(body.currency, 3).toUpperCase() || "EUR",
        photo_url: photoUrl,
        contract_end_date: cleanDate(body.contractEndDate),
        height_cm: cleanNumber(body.heightCm),
        weight_kg: cleanNumber(body.weightKg),
        external_market_provider: transfermarktProfile ? "transfermarkt" : null,
        external_market_player_id: transfermarktProfile ? getTransfermarktPlayerId(transfermarktProfile) : null,
        external_market_url: transfermarktProfile,
        external_market_synced_at: transfermarktProfile ? new Date().toISOString() : null,
        external_market_payload: externalPayload,
        ai_profile: {
          professional_biography: "",
          scouting_summary: "",
          strengths: [],
          weaknesses: [],
          market_recommendation: "",
          club_recommendations: [],
          generated: false,
        },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    if (transfermarktProfile) {
      await admin.from("player_market_snapshots").insert({
        agency_id: agencyId,
        player_id: player.id,
        provider: "transfermarkt",
        provider_player_id: getTransfermarktPlayerId(transfermarktProfile),
        provider_profile_url: transfermarktProfile,
        market_value: cleanNumber(body.marketValue),
        currency: cleanText(body.currency, 3).toUpperCase() || "EUR",
        current_club: currentClub || null,
        source_updated_at: new Date().toISOString(),
        raw_payload: externalPayload,
      });

      await upsertGlobalPlayerProfile(admin, {
        url: transfermarktProfile,
        playerName: fullName,
        photoUrl,
        currentClub,
        position: cleanText(body.position, 80),
        nationality: cleanCountry(body.nationality),
        dateOfBirth: cleanDate(body.dateOfBirth),
        marketValue: cleanNumber(body.marketValue),
        currency: cleanText(body.currency, 3).toUpperCase() || "EUR",
        source: "player_create",
        payload: {
          agencyId,
          localPlayerId: player.id,
          createdBy: user.id,
        },
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, playerId: player.id, photoUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create player." }, { status: 500 });
  }
}
