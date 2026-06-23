import { NextResponse } from "next/server";

export async function readJsonObject(request: Request): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid request format. Please use the platform form or send JSON." },
        { status: 415 },
      ),
    };
  }

  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 }),
      };
    }

    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 }),
    };
  }
}
