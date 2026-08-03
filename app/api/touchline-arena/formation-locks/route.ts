import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { requireLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

export const runtime = "nodejs";

const FORMATION_LOCKS_PATH = path.join(process.cwd(), "data", "touchline-arena-formation-locks.json");
const FORMATION_KEYS = new Set(["4-3-3", "4-4-2", "3-4-3", "3-5-2", "5-3-2"]);
const ROLE_KEYS = new Set(["goalkeeper", "defender", "midfielder", "forward"]);

function sanitizeLayout(input: unknown) {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  if (record.cameras && typeof record.cameras === "object") {
    const output: Record<string, unknown> = {};
    const cameras: Record<string, unknown> = {};
    for (const [cameraId, cameraLayout] of Object.entries(record.cameras as Record<string, unknown>)) {
      const sanitizedCameraLayout = sanitizeRoleLayout(cameraLayout);
      if (sanitizedCameraLayout) cameras[cameraId] = sanitizedCameraLayout;
    }
    output.cameras = cameras;

    const legacyLayout = sanitizeRoleLayout(input);
    if (legacyLayout) Object.assign(output, legacyLayout);
    return output;
  }

  if (!Object.keys(record).length) return {};

  return sanitizeRoleLayout(input);
}

function sanitizeRoleLayout(input: unknown) {
  if (!input || typeof input !== "object") return null;

  const output: Record<string, Array<{ x: number; y: number; heightVh: number }>> = {};
  for (const [role, slots] of Object.entries(input as Record<string, unknown>)) {
    if (!ROLE_KEYS.has(role) || !Array.isArray(slots)) continue;
    output[role] = slots
      .map((slot) => {
        if (!slot || typeof slot !== "object") return null;
        const value = slot as Record<string, unknown>;
        const x = typeof value.x === "number" ? value.x : Number(value.x);
        const y = typeof value.y === "number" ? value.y : Number(value.y);
        const heightVh = typeof value.heightVh === "number" ? value.heightVh : Number(value.heightVh);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(heightVh)) return null;
        return {
          x: Math.min(98, Math.max(2, Math.round(x * 10) / 10)),
          y: Math.min(96, Math.max(6, Math.round(y * 10) / 10)),
          heightVh: Math.min(20, Math.max(8, Math.round(heightVh * 10) / 10)),
        };
      })
      .filter((slot): slot is { x: number; y: number; heightVh: number } => Boolean(slot));
  }

  return Object.keys(output).length ? output : null;
}

async function readLocks() {
  try {
    return JSON.parse(await fs.readFile(FORMATION_LOCKS_PATH, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const accessError = requireLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const body = await request.json().catch(() => null) as { formationKey?: unknown; layout?: unknown } | null;
  const formationKey = typeof body?.formationKey === "string" ? body.formationKey : "";
  if (!FORMATION_KEYS.has(formationKey)) return NextResponse.json({ error: "Invalid formation key." }, { status: 400 });

  const layout = sanitizeLayout(body?.layout);
  if (!layout) return NextResponse.json({ error: "Invalid formation layout." }, { status: 400 });

  const locks = await readLocks();
  locks[formationKey] = layout;
  await fs.mkdir(path.dirname(FORMATION_LOCKS_PATH), { recursive: true });
  await fs.writeFile(FORMATION_LOCKS_PATH, `${JSON.stringify(locks, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, formationKey, layout });
}
