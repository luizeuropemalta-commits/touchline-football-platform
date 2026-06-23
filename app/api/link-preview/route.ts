import { NextResponse } from "next/server";
import { fetchLinkPreview, validatePreviewUrl } from "@/lib/link-preview";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = validatePreviewUrl(searchParams.get("url"));

  if (!target) {
    return NextResponse.json({ error: "Link inválido para preview." }, { status: 400 });
  }

  return NextResponse.json(await fetchLinkPreview(target));
}
