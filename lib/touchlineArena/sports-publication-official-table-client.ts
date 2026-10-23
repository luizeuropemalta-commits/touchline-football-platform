"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { TouchlineOfficialLeagueTable } from "../football-data/official-league-table";
import { touchlineLivePresentationStore } from "./live-presentation-client-store";
import { createTouchlineOfficialTablePublicationReader, projectTouchlinePublishedOfficialTable,
  touchlineOfficialTableAdmittedFixtureKeys,
  type TouchlineOfficialTablePublicationScope } from "./sports-publication-official-table";

const empty = () => null;
const inactive = () => () => undefined;

export function useTouchlinePublishedOfficialTable(
  baseline: TouchlineOfficialLeagueTable,
  liveReadsEnabled: boolean,
  isVisible: boolean,
) {
  // No asOf, score or serialized baseline here: ordinary RSC reconciliation
  // must preserve accepted corrections in the same mounted season.
  const scopeKey = JSON.stringify([baseline.competitionProviderId, baseline.season?.id ?? "", baseline.season?.providerSeasonId ?? ""]);
  const reader = useMemo(() => {
    const [competitionProviderId, seasonId, providerSeasonId] = JSON.parse(scopeKey) as [string, string, string];
    const scope: TouchlineOfficialTablePublicationScope = { competitionProviderId, seasonId, providerSeasonId };
    return createTouchlineOfficialTablePublicationReader(touchlineLivePresentationStore, scope);
  }, [scopeKey]);
  const admissionKey = JSON.stringify([...touchlineOfficialTableAdmittedFixtureKeys(baseline.liveProjectionSource)].sort());
  const subscribe = useMemo(() => {
    const admitted = new Set<string>(JSON.parse(admissionKey));
    return (notify: () => void) => reader.subscribe(notify, admitted);
  }, [reader, admissionKey]);
  const enabled = liveReadsEnabled && isVisible && Boolean(baseline.liveProjectionSource);
  const facts = useSyncExternalStore(enabled ? subscribe : inactive, reader.getSnapshot, empty);
  // Hidden surfaces retain their accepted view but stop subscribing; a static
  // opt-out never borrows another surface's publication.
  return useMemo(() => liveReadsEnabled ? projectTouchlinePublishedOfficialTable(baseline, facts) : baseline,
    [baseline, facts, liveReadsEnabled]);
}
