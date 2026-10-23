import { useState } from "react";
import TouchlinePlayerCardRankingsPublication from "../../components/touchline/TouchlinePlayerCardRankingsPublication";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { touchlineLivePresentationStore } from "../../lib/touchlineArena/live-presentation-client-store";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { TouchlineSportsPublication } from "../../lib/touchlineArena/sports-publication";

export const transportDigest = () => touchlineLivePresentationStore.getSnapshot()?.sportsPublication?.publication.contentDigest ?? null;

/** Synthetic catalogue only; every sports revision traverses the real shared transport. */
export default function RankingZoomPersistenceBrowserFixture({ seed, catalogue }: {
  seed: TouchlineSportsPublication; catalogue: readonly ClubOwnerSquadCard[];
}) {
  const [note, setNote] = useState("");
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(seed.playerRanking, null)}
    expectedSeasonId={seed.playerRanking!.seasonId!} livePlayerUpdates>
    <main className="tl-card-rankings">
      <div className="tl-card-rankings-content">
        <label>Local note<input aria-label="Local note" value={note} onChange={event => setNote(event.target.value)} /></label>
        <TouchlinePlayerCardRankingsPublication catalogue={catalogue} seedRanking={seed.playerRanking!}
          locale="en-GB" draftLocalesEnabled canEditCardEngine={false} />
      </div>
    </main>
  </TouchlineCardLeadershipProvider>;
}
