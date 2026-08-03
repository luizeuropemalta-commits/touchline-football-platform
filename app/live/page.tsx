import type { Metadata } from "next";

import TouchlineMatchCentre from "@/components/touchline/match-centre/TouchlineMatchCentre";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import {
  isTouchLineLocaleComplete,
  normalizeTouchLineLocale,
} from "@/lib/touchlineArena/i18n";

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

  const fixtures = await readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 });
  return <TouchlineMatchCentre initialFixtures={fixtures} initialFixtureId={requestedFixture} initialLocale={initialLocale} />;
}
