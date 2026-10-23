"use client";

import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { useTouchlinePublishedLive } from "@/lib/touchlineArena/sports-publication-client";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { touchlineFixtureState, touchlineFixtureStatusLabel } from "@/lib/touchlineArena/match-centre";

type Props = {
  fixtureId: string | null;
  initialFixture: TouchlinePublicFixture | null;
  locale: TouchLineLocale;
  draftLocalesEnabled?: boolean;
  liveUpdates?: boolean;
};

function presentation(fixture: TouchlinePublicFixture | null, locale: TouchLineLocale, draftLocalesEnabled = false) {
  if (!fixture) return "VS";
  const hasScore = Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
  const score = hasScore ? `${fixture.homeScore} — ${fixture.awayScore}` : "VS";
  const rawStatus = fixture.status?.trim() ?? "";
  const status = touchlineFixtureState(fixture) === "finished"
    ? touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled)
    : fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′${fixture.livePeriod ? ` · ${touchlineFixtureStatusLabel(fixture.livePeriod, locale, draftLocalesEnabled)}` : ""}`
    : touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled);
  return status && rawStatus.toLowerCase() !== "not started" ? `${score} · ${status}` : score;
}
/** Club Hub consumes the same durable live DTO as Arena and Live. */
export default function ClubHubLiveFixtureScore({ fixtureId, initialFixture, locale, draftLocalesEnabled = false, liveUpdates = true }: Props) {
  const enabled = liveUpdates && Boolean(fixtureId);
  const seed = initialFixture && initialFixture.providerId === fixtureId ? [initialFixture] : [];
  const { fixtures } = useTouchlinePublishedLive(seed, null, 0, enabled);
  // The shared boundary refreshes the server-owned XI/bench on publication
  // changes, including valid empty live feeds, without a per-score poller.
  return <>
    {enabled ? <TouchlineLivePresentationRefresh serverRefreshAfterMs={45_000} /> : null}
    <b aria-live="polite">{presentation(fixtures[0] ?? initialFixture, locale, draftLocalesEnabled)}</b>
  </>;
}
