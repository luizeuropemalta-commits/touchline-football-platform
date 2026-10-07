import type { Metadata } from "next";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TouchlineMatchCentre from "@/components/touchline/match-centre/TouchlineMatchCentre";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readTouchlineCurrentSeasonName } from "@/lib/football-data/official-league-table-server";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import {
  hasTouchlineMatchCentreFixture,
  normalizeTouchlineMatchCentreTimeZone,
  selectTouchlineMatchCentreSchedule,
  selectTouchlineMatchCentreFixture,
} from "@/lib/touchlineArena/match-centre";
import { toTouchlineLiveFixtures } from "@/lib/touchlineArena/stadium-catalog";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";

type LivePageProps = { searchParams: Promise<{ lang?: string | string[]; fixture?: string | string[] }> };

export async function generateMetadata(props: LivePageProps): Promise<Metadata> {
  return generateLiveMetadata(props, isTouchLineSiteLocalesEnabled("/live"));
}

async function generateLiveMetadata({ searchParams }: LivePageProps, draftLocalesEnabled = false): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = resolveTouchlineCatalogueLocale(Array.isArray(lang) ? lang[0] : lang, draftLocalesEnabled);
  const copy = getTouchlineMatchCentreCopy(locale, draftLocalesEnabled);
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
  };
}

async function readLiveViewer() {
  const supabase = await createClient();
  return supabase ? await supabase.auth.getUser() : { data: { user: null } };
}

export default async function TouchLineLivePage(props: LivePageProps) {
  return renderLivePage(props, isTouchLineSiteLocalesEnabled("/live"));
}

async function renderLivePage({ searchParams }: LivePageProps, draftLocalesEnabled = false) {
  const params = await searchParams;
  const requestedLanguage = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const requestedFixture = Array.isArray(params.fixture) ? params.fixture[0] : params.fixture;
  const normalizedLanguage = resolveTouchlineCatalogueLocale(requestedLanguage, draftLocalesEnabled);
  const initialLocale = requestedLanguage ? normalizedLanguage : null;
  const requestHeaders = await headers();
  const initialTimeZone = normalizeTouchlineMatchCentreTimeZone(
    requestHeaders.get("x-vercel-ip-timezone"),
  );
  // The request timestamp is serialized into the client boundary so the
  // first SSR and browser renders share one clock and cannot hydrate apart.
  const initialNow = Date.now();

  // Keep the durable schedule available to the client while the presentation
  // selector exposes only the current ten-match round and ten prior results.
  const [persistedFixtures, viewer, initialSeasonName] = await Promise.all([
    readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }),
    // An invalid fixture redirect must not wait for authentication.
    requestedFixture ? null : readLiveViewer(),
    readTouchlineCurrentSeasonName(),
  ]);
  const fixtures = toTouchlineLiveFixtures(persistedFixtures);
  const initialSchedule = selectTouchlineMatchCentreSchedule(fixtures, initialNow);
  const initiallyVisibleFixtures = [
    ...initialSchedule.currentFixtures,
    ...initialSchedule.recentResults,
  ];
  const initiallySelected = selectTouchlineMatchCentreFixture(initiallyVisibleFixtures, requestedFixture, initialNow);
  if (requestedFixture && !hasTouchlineMatchCentreFixture(initiallyVisibleFixtures, requestedFixture)) {
    const canonical = new URLSearchParams({ lang: normalizedLanguage });
    if (initiallySelected) canonical.set("fixture", initiallySelected.id);
    redirect(`/live?${canonical.toString()}`);
  }
  const viewerResult = viewer ?? await readLiveViewer();
  // Read the error before narrowing the SDK's discriminated user/result union.
  // Unknown preserves runtime validation without asserting an AuthError type.
  const viewerError: unknown = "error" in viewerResult ? viewerResult.error : undefined;
  const { data: { user } } = viewerResult;
  const verifiedViewer = viewerError === null;
  const canReadMatchDetail = Boolean(verifiedViewer && user
    && typeof user.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
    && hasTouchLineArenaAccess(user));
  const verifiedGuest = user === null
    && (viewerError === null || viewerError instanceof AuthSessionMissingError);
  const accountLocaleContext: AccountLocaleContext = user && canReadMatchDetail
    ? { mode: "account", accountId: user.id }
    : verifiedGuest ? { mode: "guest" } : { mode: "unavailable" };
  const initialMatchDetail = canReadMatchDetail && initiallySelected
    ? await readPublicFantasyFixtureMatchDetail(initiallySelected.providerId)
    : null;
  return <TouchlineMatchCentre
    draftLocalesEnabled={draftLocalesEnabled}
    initialFixtures={fixtures}
    initialFixtureId={initiallySelected?.id ?? requestedFixture}
    initialMatchDetail={initialMatchDetail}
    canReadMatchDetail={canReadMatchDetail}
    initialLocale={initialLocale}
    initialNow={initialNow}
    initialTimeZone={initialTimeZone}
    initialSeasonName={initialSeasonName}
    accountLocaleContext={accountLocaleContext}
    // The server page starts from the persisted schedule, not from a live
    // snapshot. The client endpoint can replace this only with its own
    // server-calculated freshness metadata.
    initialReadMetadata={{ state: "partial-persisted-schedule", degraded: false }}
  />;
}
