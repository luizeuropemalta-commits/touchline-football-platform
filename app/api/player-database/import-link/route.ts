import { NextResponse } from "next/server";
import { upsertGlobalPlayerProfile, validateTransfermarktProfileUrl } from "@/lib/player-database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const target = validateTransfermarktProfileUrl(cleanText(body.url, 1000));

  if (!target) {
    return NextResponse.json(
      { error: "Cola um link válido de perfil Transfermarkt. Exemplo: https://www.transfermarkt.com/neymar/profil/spieler/68290" },
      { status: 400 },
    );
  }

  try {
    const profile = await upsertGlobalPlayerProfile(admin, {
      url: target.toString(),
      playerName: cleanText(body.playerName),
      photoUrl: cleanText(body.photoUrl, 1000),
      currentClub: cleanText(body.currentClub),
      position: cleanText(body.position, 80),
      nationality: cleanText(body.nationality, 80),
      dateOfBirth: cleanText(body.dateOfBirth, 10),
      age: cleanNumber(body.age),
      agentName: cleanText(body.agentName),
      agencyName: cleanText(body.agencyName),
      marketValue: cleanNumber(body.marketValue),
      marketValueText: cleanText(body.marketValueText, 80),
      currency: cleanText(body.currency, 3),
      source: "manual_admin_import",
      payload: { importedBy: user.id },
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import player link." }, { status: 500 });
  }
}
