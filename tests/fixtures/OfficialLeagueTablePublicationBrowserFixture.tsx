import { useState } from "react";
import ClubHubLiveFixtureScore from "../../components/touchline/ClubHubLiveFixtureScore";
import TouchlineOfficialLeagueTable from "../../components/touchline/TouchlineOfficialLeagueTable";
import type { TouchlineOfficialLeagueTable as OfficialTable } from "../../lib/football-data/official-league-table";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
import { touchlineLivePresentationStore } from "../../lib/touchlineArena/live-presentation-client-store";

// Observation only: this does not subscribe, poll, or inject a publication.
export const transportDigest = () => touchlineLivePresentationStore.getSnapshot()?.sportsPublication?.publication.contentDigest ?? null;
export const transportEpoch = () => touchlineLivePresentationStore.getSnapshot()?.requestEpoch ?? 0;

/** Synthetic public inputs; real table, score, styles, reader and transport. */
export default function OfficialLeagueTablePublicationBrowserFixture({
  table,
  initialFixture,
  enabled = false,
  hidden = false,
}: {
  table: OfficialTable;
  initialFixture: TouchlinePublicFixture;
  enabled?: boolean;
  hidden?: boolean;
}) {
  const [note, setNote] = useState("");
  return <main data-table-browser-fixture="true">
    <style>{`
      [data-table-browser-fixture] { max-width: 1440px; margin: 0 auto; padding: 12px; color: #eef6f2; }
      [data-table-fixture-note] { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      [data-table-fixture-note] input { border: 1px solid #647268; padding: 4px 8px; max-width: 100%; }
      [data-table-fixture-score] { margin-bottom: 12px; }
      [data-table-fixture-grid] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
      @media (max-width: 699px) { [data-table-fixture-grid] { grid-template-columns: minmax(0, 1fr); } }
    `}</style>
    <label data-table-fixture-note>Local note
      <input aria-label="Local note" value={note} onChange={event => setNote(event.target.value)} />
    </label>
    <div hidden={hidden} data-table-fixture-visibility="true">
      <div data-table-fixture-score="true">
        <ClubHubLiveFixtureScore fixtureId={initialFixture.providerId} initialFixture={initialFixture}
          locale="en-GB" draftLocalesEnabled liveUpdates={enabled && !hidden} />
      </div>
      <div data-table-fixture-grid="true">
        <TouchlineOfficialLeagueTable table={table} locale="en-GB" draftLocalesEnabled
          liveReadsEnabled={enabled} variant="profile" id="table-profile" />
        <TouchlineOfficialLeagueTable table={table} locale="en-GB" draftLocalesEnabled
          liveReadsEnabled={enabled} variant="clubHubRail" id="table-rail" />
      </div>
    </div>
  </main>;
}
