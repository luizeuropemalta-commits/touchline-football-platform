import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

function splitPlayerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Player",
  };
}

function normalizeHttpsUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validateTransfermarktProfileUrl(value?: string | null) {
  const url = normalizeHttpsUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith("transfermarkt.com")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getTransfermarktPlayerId(profileUrl: string) {
  const match = profileUrl.match(/\/spieler\/(\d+)/i);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = (await request.json()) as {
    playerId?: string;
    playerName?: string;
    profileUrl?: string;
    photoUrl?: string;
  };

  const profileUrl = validateTransfermarktProfileUrl(body.profileUrl);
  if (!profileUrl) {
    return NextResponse.json({ error: "Cola um link válido do perfil Transfermarkt. Exemplo: https://www.transfermarkt.com/neymar/profil/spieler/68290" }, { status: 400 });
  }

  const photoUrl = normalizeHttpsUrl(body.photoUrl);
  if (body.photoUrl?.trim() && !photoUrl) {
    return NextResponse.json({ error: "A foto precisa ser um link HTTPS válido, ou deixa o campo vazio." }, { status: 400 });
  }

  const playerName = body.playerName?.trim();
  if ((!body.playerId || body.playerId === "__create__") && !playerName) {
    return NextResponse.json({ error: "Escreve o nome do atleta para criar um novo perfil." }, { status: 400 });
  }

  try {
    const { admin, agencyId } = await ensureUserWorkspace(user);
    let targetPlayerId = body.playerId;
    let created = false;
    const providerPlayerId = getTransfermarktPlayerId(profileUrl);

    const externalPayload = {
      source: "transfermarkt",
      profileUrl,
      photoUrl,
      providerPlayerId,
      linkedBy: user.id,
      linkedAt: new Date().toISOString(),
      note: "Manual Transfermarkt profile link saved in Touchline. Page content is not copied automatically.",
    };

    if (!targetPlayerId || targetPlayerId === "__create__") {
      const { firstName, lastName } = splitPlayerName(playerName ?? "");
      const { data: newPlayer, error: createError } = await admin
        .from("players")
        .insert({
          agency_id: agencyId,
          agent_id: user.id,
          first_name: firstName,
          last_name: lastName,
          status: "active",
          photo_url: photoUrl,
          stats: externalPayload,
          external_market_provider: "transfermarkt",
          external_market_player_id: providerPlayerId,
          external_market_url: profileUrl,
          external_market_synced_at: new Date().toISOString(),
          external_market_payload: externalPayload,
        })
        .select("id")
        .single();

      if (createError) throw new Error(createError.message);
      targetPlayerId = newPlayer.id;
      created = true;
    } else {
      const { data: target, error: targetError } = await admin
        .from("players")
        .select("id, agency_id")
        .eq("id", targetPlayerId)
        .eq("agency_id", agencyId)
        .maybeSingle();

      if (targetError) throw new Error(targetError.message);
      if (!target) return NextResponse.json({ error: "Player profile not found in your workspace." }, { status: 404 });

      const updatePayload: Record<string, unknown> = {
        external_market_provider: "transfermarkt",
        external_market_player_id: providerPlayerId,
        external_market_url: profileUrl,
        external_market_synced_at: new Date().toISOString(),
        external_market_payload: externalPayload,
      };

      if (photoUrl) updatePayload.photo_url = photoUrl;

      const { error: updateError } = await admin
        .from("players")
        .update(updatePayload)
        .eq("id", targetPlayerId)
        .eq("agency_id", agencyId);

      if (updateError) throw new Error(updateError.message);
    }

    await admin.from("player_market_snapshots").insert({
      agency_id: agencyId,
      player_id: targetPlayerId,
      provider: "transfermarkt",
      provider_player_id: providerPlayerId,
      provider_profile_url: profileUrl,
      market_value: null,
      currency: "EUR",
      source_updated_at: new Date().toISOString(),
      raw_payload: externalPayload,
    });

    return NextResponse.json({
      ok: true,
      created,
      playerId: targetPlayerId,
      provider: "transfermarkt",
      externalPlayerId: providerPlayerId,
      externalUrl: profileUrl,
      photoUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save Transfermarkt link." }, { status: 500 });
  }
}
