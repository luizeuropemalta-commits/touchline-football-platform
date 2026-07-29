import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY,
  TOUCHLINE_COACH_CARD_LAYOUT_VERSION,
  normalizeTouchlineCoachCardLayout,
} from "@/lib/touchlineArena/coach-card-layout";
import { requireLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

export const runtime = "nodejs";

const RELATIVE_PATH = "touchlineArena/card-layouts/coach-card-layout.json";
const OUTPUT_PATH = path.join(process.cwd(), "public", RELATIVE_PATH);

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    writable: requireLocalTouchlineEditor(request) === null,
    path: `/${RELATIVE_PATH}`,
  });
}

export async function POST(request: Request) {
  try {
    const accessError = requireLocalTouchlineEditor(request);
    if (accessError) return accessError;

    const body = await request.json();
    const layout = normalizeTouchlineCoachCardLayout(body?.layout);
    const payload = {
      version: TOUCHLINE_COACH_CARD_LAYOUT_VERSION,
      updatedAt: new Date().toISOString(),
      storageKey: TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY,
      layout: layout.layers,
      portraitScale: layout.portraitScale,
      nameSize: layout.nameSize,
      crestSize: layout.crestSize,
      neonStrength: layout.neonStrength,
    };

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return NextResponse.json({ ok: true, path: `/${RELATIVE_PATH}`, layout });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível salvar o Card Mestre do treinador.",
    }, { status: 500 });
  }
}
