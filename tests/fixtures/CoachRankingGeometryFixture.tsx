import { TouchlineCoachRankingTable, TouchlineRankingPodiumPending } from "../../app/rankings/touchline-tables-client";
import styles from "../../app/rankings/touchline-tables.module.css";
import { getTouchLineRankingsCopy } from "../../lib/touchlineArena/rankings-i18n";
import type { TouchLineLocale } from "../../lib/touchlineArena/i18n";
import type { TouchLineCoachRankingState } from "../../lib/touchlineArena/coach-ranking-server";

// Synthetic ranking only; no publication, account or backend reader.
const ranking: TouchLineCoachRankingState = {
  phase: "ranked", snapshotId: "synthetic-geometry", seasonId: "synthetic-season",
  scoringVersion: "coach_scoring_v2", fixtureIds: [], generatedAt: "2026-10-21T00:00:00Z",
  rows: Array.from({ length: 7 }, (_, i) => ({
    rank: i + 1, coachProviderId: `synthetic-coach-${i}`, coachName: `Treinador Sintético Com Nome Muito Longo ${i + 1}`,
    clubName: "Clube Sintético de Nome Extenso Para Testar Quebra", touchlinePoints: 21 - i,
    wins: 5, draws: 2, losses: 1, awayWins: 2,
    home: { wins: 3, draws: 1, losses: 0, touchlinePoints: 10 },
    away: { wins: 2, draws: 1, losses: 1, touchlinePoints: 11 - i },
  })),
};

export default function CoachRankingGeometryFixture({ locale }: { locale: TouchLineLocale }) {
  return <main className={styles.page} dir="ltr" data-synthetic-ranking-fixture="true">
    <div className={styles.content}>
    <section className={styles.rankingHighlights}>
      <TouchlineRankingPodiumPending locale={locale} draftLocalesEnabled />
      <TouchlineCoachRankingTable coachRanking={ranking} locale={locale} draftLocalesEnabled copy={getTouchLineRankingsCopy(locale, true)} />
    </section>
    </div>
  </main>;
}
