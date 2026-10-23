import { useState } from "react";
import { TouchlineCoachRankingTable, TouchlineRankingPodium, TouchlineRankingsHero } from "../../app/rankings/touchline-tables-client";
import styles from "../../app/rankings/touchline-tables.module.css";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { touchlineLivePresentationStore } from "../../lib/touchlineArena/live-presentation-client-store";
import { getTouchLineRankingsCopy } from "../../lib/touchlineArena/rankings-i18n";
import { getTouchlineTablesPresentationCopy } from "../../lib/touchlineArena/tables-presentation-i18n";
import { buildTouchlineRankingSummaryIndex } from "../../lib/touchlineArena/published-ranking-summary";
import type { TouchLineCoachRankingState } from "../../lib/touchlineArena/coach-ranking-server";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { TouchlineSportsPublication } from "../../lib/touchlineArena/sports-publication";

const coachRanking: TouchLineCoachRankingState = {
  phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null,
  fixtureIds: [], generatedAt: null, rows: [],
};
export const transportDigest = () => touchlineLivePresentationStore.getSnapshot()?.sportsPublication?.publication.contentDigest ?? null;

/** Only input data is synthetic; publication, projection, cards and dialog are real. */
export default function RankingPodiumPublicationBrowserFixture({ seed, catalogue }: {
  seed: TouchlineSportsPublication; catalogue: readonly ClubOwnerSquadCard[];
}) {
  const [note, setNote] = useState("");
  const copy = getTouchLineRankingsCopy("en-GB", true);
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(seed.playerRanking, coachRanking)}
    expectedSeasonId={seed.playerRanking!.seasonId!} livePlayerUpdates>
    <main className={styles.page}><div className={styles.content}>
      <label>Local note<input aria-label="Local note" value={note} onChange={event => setNote(event.target.value)} /></label>
      <TouchlineRankingsHero copy={copy} rankMode={copy.pointsMode} totalPublishedCards={42}
        totalRankedCards={7} catalogueIndex={buildTouchlineRankingSummaryIndex(catalogue)} />
      <section className={styles.rankingHighlights} aria-label={getTouchlineTablesPresentationCopy("en-GB", true).seasonHighlights}>
        <TouchlineRankingPodium catalogue={catalogue} seedRanking={seed.playerRanking!} coachRanking={coachRanking}
          copy={copy} locale="en-GB" draftLocalesEnabled canEditCardEngine={false} />
        <TouchlineCoachRankingTable coachRanking={coachRanking} copy={copy} locale="en-GB" draftLocalesEnabled />
      </section>
    </div></main>
  </TouchlineCardLeadershipProvider>;
}
