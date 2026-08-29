import { NextResponse } from "next/server";
import { readPublicPremierSquad } from "@/lib/football-data/public-premier-squad-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await readPublicPremierSquad(url.searchParams.get("teamId"));
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
