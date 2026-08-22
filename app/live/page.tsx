import type { Metadata } from "next";
import { headers } from "next/headers";

import TouchlineMatchCentre from "@/components/touchline/match-centre/TouchlineMatchCentre";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { createClient } from "@/lib/supabase/server";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  isTouchLineLocaleComplete,
  normalizeTouchLineLocale,
} from "@/lib/touchlineArena/i18n";
import {
  normalizeTouchlineMatchCentreTimeZone,
  selectTouchlineMatchCentreFixture,
} from "@/lib/touchlineArena/match-centre";

export const metadata: Metadata = {
  title: "Ao vivo | TouchLine England",
  description: "Central premium de partidas, eventos e estatísticas ao vivo da TouchLine England.",
};

export default async function TouchLineLivePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[]; fixture?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedLanguage = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const requestedFixture = Array.isArray(params.fixture) ? params.fixture[0] : params.fixture;
  const normalizedLanguage = normalizeTouchLineLocale(requestedLanguage);
  const initialLocale = requestedLanguage && isTouchLineLocaleComplete(normalizedLanguage)
    ? normalizedLanguage
    : null;
  const requestHeaders = await headers();
  const initialTimeZone = normalizeTouchlineMatchCentreTimeZone(
    requestHeaders.get("x-vercel-ip-timezone"),
  );
  // The request timestamp is serialized into the client boundary so the
  // first SSR and browser renders share one clock and cannot hydrate apart.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();

  // Live is intentionally a matchweek surface. The archive is reached from
  // verified weekly results, never by mixing future rounds into the live rail.
  const fixtures = selectArenaFixtureRound(
    await readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }),
  );
  const initiallySelected = selectTouchlineMatchCentreFixture(fixtures, requestedFixture, initialNow);
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const initialMatchDetail = hasTouchLineArenaAccess(user) && initiallySelected
    ? await readPublicFantasyFixtureMatchDetail(initiallySelected.providerId)
    : null;
  return <TouchlineMatchCentre
    initialFixtures={fixtures}
    initialFixtureId={initiallySelected?.id ?? requestedFixture}
    initialMatchDetail={initialMatchDetail}
    initialLocale={initialLocale}
    initialNow={initialNow}
    initialTimeZone={initialTimeZone}
    // The server page starts from the persisted schedule, not from a live
    // snapshot. The client endpoint can replace this only with its own
    // server-calculated freshness metadata.
    initialReadMetadata={{ state: "partial-persisted-schedule", degraded: false }}
  />;
}
