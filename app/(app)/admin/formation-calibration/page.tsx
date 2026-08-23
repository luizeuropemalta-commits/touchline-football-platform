import { notFound } from "next/navigation";

import FormationCalibrationStudio from "@/components/touchline/admin/FormationCalibrationStudio";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import {
  readTouchlineFormationGeometryHistory,
  readTouchlineFormationGeometryRegistry,
} from "@/lib/touchlineArena/formation-geometry-server";
import { normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";

export const dynamic = "force-dynamic";

export default async function FormationCalibrationPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const locale = normalizeTouchLineAuthLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang);
  const supabase = await createClient();
  const user = supabase
    ? await resolveServerReadWithin(
      supabase.auth.getUser().then(({ data }) => data.user),
      null,
      8_000,
    )
    : null;
  if (!user?.id || !isOwnerEmail(user.email)) notFound();
  const [registry, history] = await Promise.all([
    readTouchlineFormationGeometryRegistry(),
    readTouchlineFormationGeometryHistory(),
  ]);

  const registryRevision = Object.values(registry)
    .map((entry) => `${entry.formationCode}:${entry.geometryVersion}`)
    .join("|");

  return <FormationCalibrationStudio key={registryRevision} locale={locale} registry={registry} history={history} />;
}
