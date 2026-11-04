import 'server-only';
import { loadRequestTouchlineSportsPublication } from './sports-publication-server';
import { loadTouchLineRankedCardCatalog } from './ranked-card-catalog-server';
import { projectTouchlinePublishedRankingCatalog } from './published-ranking-catalog';
import type { ClubOwnerSquadCard } from './demo-data';

export type TouchlineCurrentPlayerRankingView = Readonly<{
  phase: 'ready' | 'preseason' | 'unavailable'; snapshotId: string | null; currentRevision: string | null;
  rows: readonly Readonly<{card: ClubOwnerSquadCard; officialRank: number}>[];
}>;
/** ClubHub consumes the same globally admitted/reindexed view as rankings/API/cards. */
export async function loadTouchlineCurrentPlayerRankingView(): Promise<TouchlineCurrentPlayerRankingView> {
  const unavailable: TouchlineCurrentPlayerRankingView = {phase:'unavailable',snapshotId:null,currentRevision:null,rows:[]};
  try {
    const publication = await loadRequestTouchlineSportsPublication();
    const current = publication?.currentPlayerRanking;
    if (!current?.state) return unavailable;
    const base = { snapshotId:current.state.snapshotId, currentRevision:current.revision };
    if (current.phase === 'preseason') return {...base,phase:'preseason',rows:[]};
    const cards = await loadTouchLineRankedCardCatalog(current.state);
    const projected = projectTouchlinePublishedRankingCatalog(cards,current.state);
    if (projected.phase !== 'ready') return unavailable;
    const rows = projected.cards.map(card => ({card,officialRank:card.publishedRanking?.officialRank}));
    if (rows.some(row => !Number.isSafeInteger(row.officialRank) || row.officialRank! < 1)) return unavailable;
    return {...base,phase:'ready',rows:rows as Array<{card:ClubOwnerSquadCard;officialRank:number}>};
  } catch { return unavailable; }
}
