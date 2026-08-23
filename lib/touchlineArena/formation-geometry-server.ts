import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import {
  TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY,
  mergeTouchlineFormationGeometryRegistry,
  parseTouchlineFormationGeometry,
  type TouchlineFormationGeometry,
  type TouchlineFormationGeometryRegistry,
  type TouchlineFormationGeometryValidation,
} from "./formation-geometry";

const FORMATION_GEOMETRY_READ_TIMEOUT_MS = 4_000;

export type TouchlineFormationGeometryVersionRecord = Readonly<{
  id: string;
  formationCode: string;
  geometryVersion: number;
  status: "published" | "superseded";
  geometry: TouchlineFormationGeometry;
  validationReport: TouchlineFormationGeometryValidation | null;
  changeReason: string;
  createdAt: string;
  publishedAt: string;
  supersedesVersion: number | null;
  rollbackOfVersion: number | null;
}>;

type GeometryRow = {
  id: string;
  formation_code: string;
  geometry_version: number;
  status: string;
  geometry: unknown;
  validation_report: unknown;
  change_reason: string | null;
  created_at: string;
  published_at: string;
  supersedes_version: number | null;
  rollback_of_version: number | null;
};

function parseValidationReport(value: unknown): TouchlineFormationGeometryValidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.publishable !== "boolean"
    || typeof record.formationCode !== "string"
    || !Number.isInteger(record.slotCount)
    || !Array.isArray(record.issues)
    || !Array.isArray(record.checkedViewports)
  ) return null;
  return value as TouchlineFormationGeometryValidation;
}

function parseVersionRow(row: GeometryRow): TouchlineFormationGeometryVersionRecord | null {
  if (
    !row.id
    || !["published", "superseded"].includes(row.status)
    || !Number.isInteger(row.geometry_version)
    || row.geometry_version < 1
    || !row.created_at
    || !row.published_at
  ) return null;
  const geometry = parseTouchlineFormationGeometry(row.geometry, {
    formationCode: row.formation_code,
    geometryVersion: row.geometry_version,
    source: "qa-published",
    publishedAt: row.published_at,
  });
  if (!geometry) return null;
  return Object.freeze({
    id: row.id,
    formationCode: row.formation_code,
    geometryVersion: row.geometry_version,
    status: row.status as "published" | "superseded",
    geometry,
    validationReport: parseValidationReport(row.validation_report),
    changeReason: row.change_reason?.trim() || "Published calibration",
    createdAt: row.created_at,
    publishedAt: row.published_at,
    supersedesVersion: Number.isInteger(row.supersedes_version) ? row.supersedes_version : null,
    rollbackOfVersion: Number.isInteger(row.rollback_of_version) ? row.rollback_of_version : null,
  });
}

async function readRows(status?: "published") {
  const admin = createAdminClient();
  if (!admin) return [] as GeometryRow[];
  let query = admin
    .from("touchline_formation_geometry_versions")
    .select("id,formation_code,geometry_version,status,geometry,validation_report,change_reason,created_at,published_at,supersedes_version,rollback_of_version")
    .order("formation_code", { ascending: true })
    .order("geometry_version", { ascending: false });
  if (status) query = query.eq("status", status);
  const result = await resolveServerReadWithin(
    Promise.resolve(query).then(({ data, error }) => ({ data: data as GeometryRow[] | null, error })),
    { data: null, error: null },
    FORMATION_GEOMETRY_READ_TIMEOUT_MS,
  );
  if (result.error || !result.data) return [];
  return result.data;
}

export async function readTouchlineFormationGeometryRegistry(): Promise<TouchlineFormationGeometryRegistry> {
  const records = (await readRows("published")).flatMap((row) => {
    const parsed = parseVersionRow(row);
    return parsed && parsed.validationReport?.publishable === true ? [parsed.geometry] : [];
  });
  return records.length
    ? mergeTouchlineFormationGeometryRegistry(records)
    : TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY;
}

export async function readTouchlineFormationGeometryHistory(): Promise<readonly TouchlineFormationGeometryVersionRecord[]> {
  return (await readRows()).flatMap((row) => {
    const parsed = parseVersionRow(row);
    return parsed ? [parsed] : [];
  });
}
