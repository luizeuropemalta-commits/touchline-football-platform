import { NextResponse } from "next/server";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

const supportedHosts = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "hudl.com",
  "wyscout.com",
  "veo.co",
  "veo.coach",
];

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeVideoUrl(value: unknown) {
  const text = cleanText(value, 800);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!supportedHosts.some((supported) => host === supported || host.endsWith(`.${supported}`))) return null;
    return url.toString();
  } catch {
    return null;
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
    const body = (await request.json()) as { playerId?: string; title?: string; url?: string; thumbnailUrl?: string };
    const playerId = cleanText(body.playerId, 80);
    const title = cleanText(body.title, 180) || "Player video";
    const url = normalizeVideoUrl(body.url);
    if (!playerId || !url) return NextResponse.json({ error: "Valid player and video URL are required." }, { status: 400 });

    const { admin, agencyId } = await ensureUserWorkspace(user);
    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw new Error(playerError.message);
    if (!player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

    const { data, error } = await admin
      .from("player_videos")
      .insert({
        agency_id: agencyId,
        player_id: playerId,
        title,
        url,
        thumbnail_url: cleanText(body.thumbnailUrl, 800) || null,
      })
      .select("id, title, url, thumbnail_url, created_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, video: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save video." }, { status: 500 });
  }
}
