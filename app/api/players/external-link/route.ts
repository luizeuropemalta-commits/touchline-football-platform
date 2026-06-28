import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/server/request";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const json = await readJsonObject(request);
  if (!json.ok) return json.response;
  return NextResponse.json(
    {
      ok: false,
      error: "Legacy external football player linking is disabled. Use Football Search, Transfermarkt identity references, or Sportmonks-normalized football data.",
    },
    { status: 410 },
  );
}
