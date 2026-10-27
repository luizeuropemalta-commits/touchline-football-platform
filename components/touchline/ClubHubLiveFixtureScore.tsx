"use client";

import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { useTouchlinePublishedLive } from "@/lib/touchlineArena/sports-publication-client";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { touchlineFixtureStatusLabel, type TouchlineLiveReadMetadata } from "@/lib/touchlineArena/match-centre";
import { clubHubStripState } from "@/lib/touchlineArena/club-hub-fixture-strip";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";

type Props = {
  fixtureId: string | null;
  initialFixture: TouchlinePublicFixture | null;
  locale: TouchLineLocale;
  draftLocalesEnabled?: boolean;
  liveUpdates?: boolean;
};

function presentation(fixture: TouchlinePublicFixture | null, metadata: TouchlineLiveReadMetadata | null, locale: TouchLineLocale, draftLocalesEnabled = false) {
  if (!fixture) return { score: "VS", status: null };
  const hasScore = Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
  const score = hasScore ? `${fixture.homeScore} — ${fixture.awayScore}` : "VS";
  const state = clubHubStripState(fixture, metadata, Date.now());
  const copy = getTouchlineMatchCentreCopy(locale, draftLocalesEnabled);
  if (state === "stale") return { score, status: copy.liveDataUpdating };
  if (state === "awaiting-update") return { score, status: copy.awaitingOfficialUpdate };
  if (state === "upcoming" || state === "unknown") return { score, status: null };
  const rawStatus = fixture.status?.trim() ?? "";
  const status = state === "finished"
    ? touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled)
    : fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′${fixture.livePeriod ? ` · ${touchlineFixtureStatusLabel(fixture.livePeriod, locale, draftLocalesEnabled)}` : ""}`
    : touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled);
  return { score, status: status && rawStatus.toLowerCase() !== "not started" ? status : null };
}
/** Club Hub consumes the same durable live DTO as Arena and Live. */
export default function ClubHubLiveFixtureScore({ fixtureId, initialFixture, locale, draftLocalesEnabled = false, liveUpdates = true }: Props) {
  const enabled = liveUpdates && Boolean(fixtureId);
  const seed = initialFixture && initialFixture.providerId === fixtureId ? [initialFixture] : [];
  const { fixtures, metadata } = useTouchlinePublishedLive(seed, null, 0, enabled);
  // A projected neighbour or mismatched SSR prop cannot supply this match's score.
  const projectedFixture = fixtures.find(candidate => candidate.providerId === fixtureId);
  const fixture = projectedFixture ?? seed[0] ?? null;
  const display = presentation(fixture, projectedFixture ? metadata : null, locale, draftLocalesEnabled);
  // The shared boundary refreshes the server-owned XI/bench on publication
  // changes, including valid empty live feeds, without a per-score poller.
  return <>
    {enabled ? <TouchlineLivePresentationRefresh serverRefreshAfterMs={45_000} /> : null}
    <b aria-live="polite"><span data-clubhub-fixture-score="">{display.score}</span>{display.status ? <span data-clubhub-fixture-status="">{` ${display.status}`}</span> : null}</b>
  </>;
}
