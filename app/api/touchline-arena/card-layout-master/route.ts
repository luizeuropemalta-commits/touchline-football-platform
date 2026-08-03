import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import masterCardLayout from "@/public/touchlineArena/card-layouts/master-shirt-back-layout.json";

import { requireLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

export const runtime = "nodejs";

const MASTER_LAYOUT_RELATIVE_PATH = "touchlineArena/card-layouts/master-shirt-back-layout.json";
const MASTER_LAYOUT_PATH = path.join(process.cwd(), "public", MASTER_LAYOUT_RELATIVE_PATH);

const EDITABLE_BLOCKS = [
  "backName",
  "backNumber",
  "shirtClub",
  "clubCrest",
  "flag",
  "points",
  "marketValue",
  "cardPrice",
  "name",
  "touchlineLogo",
  "touchlinePremier",
  "profileAction",
  "shareAction",
  "followAction",
  "likeAction",
  "statGol",
  "statAst",
  "statDef",
  "statCs",
  "statCar",
] as const;

type EditableBlock = (typeof EDITABLE_BLOCKS)[number];
type CardFieldLayout = { x: number; y: number; scale: number };
type CardLayout = Record<EditableBlock, CardFieldLayout>;

const DEFAULT_CARD_LAYOUT = masterCardLayout.layout as CardLayout;

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeLayout(input: unknown): CardLayout | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Partial<Record<EditableBlock, Partial<CardFieldLayout>>>;
  const layout = { ...DEFAULT_CARD_LAYOUT } as CardLayout;

  for (const key of EDITABLE_BLOCKS) {
    const fallback = DEFAULT_CARD_LAYOUT[key];
    const item = source[key] || {};
    const maxScale = key === "clubCrest" ? 4 : 1.85;
    layout[key] = {
      x: Math.round(cleanNumber(item.x, fallback.x, 0, 430)),
      y: Math.round(cleanNumber(item.y, fallback.y, 0, 691)),
      scale: Number(cleanNumber(item.scale, fallback.scale, 0.55, maxScale).toFixed(2)),
    };
  }

  return layout;
}

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    locked: false,
    lockedAt: null,
    writable: requireLocalTouchlineEditor(request) === null,
  });
}

export async function POST(request: Request) {
  try {
    const accessError = requireLocalTouchlineEditor(request);
    if (accessError) return accessError;

    const body = await request.json();
    const layout = normalizeLayout(body?.layout);

    if (!layout) {
      return NextResponse.json({ ok: false, error: "Invalid card layout." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const storageKey = typeof body?.storageKey === "string" ? body.storageKey : null;
    const payload = {
      updatedAt,
      storageKey,
      layout,
    };

    await fs.mkdir(path.dirname(MASTER_LAYOUT_PATH), { recursive: true });
    await fs.writeFile(MASTER_LAYOUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return NextResponse.json({
      ok: true,
      locked: false,
      updatedAt,
      path: `/${MASTER_LAYOUT_RELATIVE_PATH}`,
      layout,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save card layout." },
      { status: 500 },
    );
  }
}
