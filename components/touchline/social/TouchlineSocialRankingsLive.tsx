import Image from "next/image";
import type { CSSProperties } from "react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import { squadCardToExactPlayer, TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { touchlineCoachClassificationForProviderId, touchlineLiveCoachForProviderId } from "@/lib/touchlineArena/live-coaches";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_PLAYER_LEADER_CROWN_ASSET, touchlinePlayerLeaderCrownStyle } from "@/lib/touchlineArena/player-leader-crown-presentation";
import { leadershipCrownEligibility } from "@/lib/touchlineArena/leadership-decision";
import { TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES } from "@/lib/touchlineArena/social-ranking-visual-tokens";
import { RANKINGS_LIVE_LOOP_MS, type RankingsLiveArtId } from "@/lib/social-rankings-live-contract";
import type { RankingsLiveRenderInput } from "@/lib/social-rankings-live-server";
import type { TouchlineRankedPlayer } from "@/lib/touchlineArena/card-ranking";
import styles from "./TouchlineSocialRankingsLive.module.css";

const TITLES = { OVERALL_LEADER: ["LÍDER GERAL", "O TOPO É DELE"], GAMEWEEK_HERO: ["DESTAQUES DA RODADA", "UM DESTAQUE EM CADA POSIÇÃO"], GAMEWEEK_TOP_CARD: ["CARD DA RODADA", "O MAIOR RATING DA SEMANA"], GAMEWEEK_XI_COACH: ["SELEÇÃO DA RODADA", "OS 11 + TREINADOR · SEMANAL"], SEASON_XI_COACH: ["SELEÇÃO DA TEMPORADA", "OS 11 + TREINADOR · ACUMULADO"], GOLDEN_BOOT: ["ARTILHEIRO ATUAL", "PREMIER LEAGUE"], TOP_COACH: ["MELHOR TREINADOR", "COMANDO DE LÍDER"], LEAGUE_TABLE_PREVIEW: ["ANTES DA RODADA", "COMO ESTÁ A DISPUTA"], LEAGUE_TABLE_FINAL: ["RODADA ENCERRADA", "A CLASSIFICAÇÃO ATUAL"] } as const;
const POSITIONS: Record<string, string> = { goalkeeper: "GOLEIRO", "centre-back": "ZAGUEIRO", "full-back": "LATERAL", midfielder: "MEIO-CAMPISTA", winger: "PONTA", striker: "CENTROAVANTE" };
const rating = (value: number | null) => value === null ? "—" : value.toFixed(2).replace(".", ",");

export default function TouchlineSocialRankingsLive({ input, artId, placement, frameMs = 0 }: { input: RankingsLiveRenderInput; artId: RankingsLiveArtId; placement: "FEED" | "STORY"; frameMs?: number }) {
  const data = input.data;
  const phase = ((frameMs % RANKINGS_LIVE_LOOP_MS) + RANKINGS_LIVE_LOOP_MS) % RANKINGS_LIVE_LOOP_MS / RANKINGS_LIVE_LOOP_MS;
  const pulse = Math.sin(phase * Math.PI * 2);
  const [title, eyebrow] = TITLES[artId];
  const tableMode = artId.startsWith("LEAGUE_TABLE");
  const weeklyMode = artId.startsWith("GAMEWEEK_");
  const selectedXI = artId === "GAMEWEEK_XI_COACH" ? data.weeklySelection : data.selection;
  const selectedCoach = artId === "GAMEWEEK_XI_COACH" ? data.weeklyCoaches[0]! : data.coaches[0]!;
  const weeklyCoachTieCount = data.weeklyCoaches.filter((coach) => coach.touchlinePoints === selectedCoach.touchlinePoints && coach.wins === selectedCoach.wins && coach.awayWins === selectedCoach.awayWins).length;
  const goldenLeader = data.goldenBoot.candidates.length === 1 && data.goldenBoot.state === "FACTUAL_REVIEW" ? data.goldenBoot.candidates[0]! : null;
  const goldenPlayer = goldenLeader ? data.seasonRanking.snapshot.players.find((player) => player.playerId === goldenLeader.playerId) : null;
  const asOf = new Date(data.provenance.asOf);
  const month = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][asOf.getUTCMonth()];
  const sourceLabel = `${String(asOf.getUTCDate()).padStart(2, "0")} ${month} · ${asOf.toISOString().slice(11, 16)} UTC`;
  const style = { ...TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES, "--live-height": placement === "STORY" ? "1920px" : "1350px", "--live-glow": .16 + pulse * .045, "--live-float": `${pulse * 4}px` } as CSSProperties;
  function playerCard(player: TouchlineRankedPlayer, scale: number, crowned = false) {
    const card = input.cards[player.playerId];
    if (!card?.editorialCard) throw new Error(`MISSING_FROZEN_PUBLISHED_CARD:${player.playerId}`);
    // Private replay only: weekly cards and their labels use the same weekly
    // snapshot; preserve the published editorial tier/price, never reprice.
    const scopedCard = { ...card, seasonTotalRating: player.totalRating, publishedRanking: undefined };
    const crown = crowned && leadershipCrownEligibility(data.leadership, { subjectType: "player", subjectId: player.playerId }, { rankingId: "touchline-player-overall", snapshotId: data.seasonRanking.snapshot.snapshotId });
    if (crowned && !crown) throw new Error("RANKINGS_ART_LEADERSHIP_MISMATCH");
    const crownStyle = touchlinePlayerLeaderCrownStyle(scale);
    return <div className={styles.cardFrame} style={{ "--card-scale": scale } as CSSProperties} data-player-id={player.playerId}>
      {crown ? <Image unoptimized src={TOUCHLINE_PLAYER_LEADER_CROWN_ASSET} alt="Líder geral" width={122} height={122} className={styles.crown} style={crownStyle} /> : null}
      <TouchlineEliteExactCard player={squadCardToExactPlayer(scopedCard, { useSuppliedTier: true })} staticRenderScale={1} ensureStaticNameFit runtimeLocaleOverride="pt-BR" subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" forceNeonActive imageLoading="eager" />
    </div>;
  }
  function coachCard(scale: number) {
    const row = selectedCoach;
    const identity = touchlineLiveCoachForProviderId(row.coachProviderId);
    const club = TOUCHLINE_ENGLAND_CLUBS.find((c) => c.teamId === row.clubProviderId);
    if (!identity || !club || identity.coach.teamId !== row.clubProviderId || (identity.coach.displayName || identity.coach.name) !== row.name) throw new Error("RANKINGS_COACH_PRESENTATION_MISMATCH");
    const tier = touchlineCoachClassificationForProviderId(row.coachProviderId);
    if (!tier) throw new Error("COACH_CLASSIFICATION_MISSING");
    const slot = { ...createTouchlineArenaCoachSlot(identity.coach, null, tier.tierKey), touchlinePoints: row.touchlinePoints, status: "audited" as const, scoreEvidence: { provider: "sportmonks" as const, providerEventIds: data.provenance.fixtureIds, scoringVersion: "coach_scoring_v2" } };
    return <div className={styles.coachFrame} style={{ "--card-scale": scale } as CSSProperties}><TouchlineCoachCard coach={identity.coach} slot={slot} clubName={row.clubName} clubLogoUrl={club.logoUrl} clubAccent={club.accent} countryCode3={identity.countryCode3} locale="pt-BR" forceNeonActive enableInteractiveNeon={false} assetLoading="eager" frameLoading="eager" publishedTouchlinePoints={row.touchlinePoints} showLeadershipCrown={false} /></div>;
  }
  return <main className={`${styles.canvas} ${placement === "STORY" ? styles.story : ""}`} style={style} data-rankings-live-art={artId} data-rankings-live-review="non-publishable" data-motion-loop-ms={RANKINGS_LIVE_LOOP_MS} data-source-revision={data.provenance.revision} data-factual-gate={artId === "GOLDEN_BOOT" ? data.goldenBoot.state : "LOCAL_CANONICAL_REPLAY"}>
    <div className={styles.arena} /><div className={styles.atmosphere} />
    <svg className={styles.trace} viewBox={`0 0 1080 ${placement === "STORY" ? 1920 : 1350}`} aria-hidden="true"><rect x="18" y="18" width="1044" height={placement === "STORY" ? 1884 : 1314} rx="29" pathLength="100" strokeDasharray="7 93" strokeDashoffset={-100 * phase} /></svg>
    <header className={styles.header}><div className={styles.brand}><Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="TouchLine" width={56} height={66} /><strong>TOUCHLINE</strong></div><div className={styles.competition}><b>PREMIER LEAGUE</b><span>2026/27 · {artId === "LEAGUE_TABLE_PREVIEW" ? `PRÉ-RODADA ${data.nextRound?.name ?? "—"}` : `RODADA ${data.round.name}`}</span></div></header>
    <section className={styles.title}><span>REPLAY LOCAL · NÃO PUBLICADO</span><h1>{artId === "OVERALL_LEADER" ? "LÍDER DO REPLAY" : title}</h1><p>{weeklyMode ? `Somente a rodada ${data.round.name} · não é o acumulado` : tableMode ? "Classificação dos clubes · resultados consolidados" : artId === "GOLDEN_BOOT" ? "Gols válidos da temporada · gols contra excluídos" : `${eyebrow} · AMOSTRA RETROSPECTIVA`}</p></section>
    {artId === "OVERALL_LEADER" ? <section className={styles.spotlight}><div className={styles.heroCopy}><span>MAIOR TOTAL RATING</span><h2>{data.overall.name}</h2><p>{data.overall.clubName}</p><strong>{rating(data.overall.totalRating)}</strong><small>TOTAL RATING · TEMPORADA</small></div><div className={styles.heroCard}>{playerCard(data.overall, .94, true)}</div></section> : null}
    {artId === "GAMEWEEK_TOP_CARD" ? <section className={styles.spotlight}><div className={styles.heroCopy}><span>MAIOR RATING · RODADA {data.round.name}</span><h2>{data.weeklyOverall.name}</h2><p>{data.weeklyOverall.clubName}</p><strong>{rating(data.weeklyOverall.totalRating)}</strong><small>TOTAL RATING · SOMENTE A RODADA</small></div><div className={styles.heroCard}>{playerCard(data.weeklyOverall, .94)}</div></section> : null}
    {artId === "GAMEWEEK_HERO" ? <section className={styles.weekly}>{data.weeklyLeaders.map((p) => <article key={p.playerId}><span>{POSITIONS[p.positionGroup]}</span>{playerCard(p, placement === "STORY" ? .45 : .36)}<h2>{p.name}</h2><p>{p.clubName}</p><strong>{rating(p.totalRating)} <small>RATING · R{data.round.name}</small></strong></article>)}</section> : null}
    {artId === "SEASON_XI_COACH" || artId === "GAMEWEEK_XI_COACH" ? <section className={styles.selection}><div className={styles.pitch}><div className={styles.pitchLine} />{selectedXI.players.map((slot) => <article key={slot.id} className={styles.pitchPlayer} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>{playerCard(slot.player, placement === "STORY" ? .25 : .20)}<span>{slot.label} · {rating(slot.player.totalRating)}</span><strong>{slot.player.name}</strong></article>)}</div><aside className={styles.coachStrip}>{coachCard(placement === "STORY" ? .19 : .15)}<div><span>TREINADOR · {selectedXI.formation}{weeklyMode && weeklyCoachTieCount > 1 ? " · DESEMPATE CANÔNICO" : ""}</span><h2>{selectedCoach.name}</h2><p>{selectedCoach.clubName}</p></div><strong>{selectedCoach.touchlinePoints}<small>TL POINTS · {weeklyMode ? `R${data.round.name}` : "TEMPORADA"}</small></strong></aside></section> : null}
    {artId === "TOP_COACH" ? <section className={styles.spotlight}><div className={styles.heroCopy}><span>LÍDER DOS TREINADORES</span><h2>{data.coaches[0]!.name}</h2><p>{data.coaches[0]!.clubName}</p><strong>{data.coaches[0]!.touchlinePoints}</strong><small>TL POINTS · TEMPORADA</small><div className={styles.coachRecord}>{data.coaches[0]!.wins} VITÓRIAS · {data.coaches[0]!.awayWins} FORA</div></div>{coachCard(1)}</section> : null}
    {tableMode ? <section className={styles.tablePanel}><table><thead><tr><th>POS</th><th>CLUBE</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th></tr></thead><tbody>{data.table.rows.map((row) => <tr key={row.team.providerTeamId}><td>{row.sportsRank}{row.isTied ? "=" : ""}</td><th scope="row"><span>{row.team.logoUrl ? <Image src={row.team.logoUrl} alt="" width={34} height={34} unoptimized /> : null}{row.team.name}</span></th><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? "+" : ""}{row.goalDifference}</td><td>{row.points}</td></tr>)}</tbody></table></section> : null}
    {artId === "GOLDEN_BOOT" ? goldenLeader && goldenPlayer ? <section className={styles.spotlight}><div className={styles.heroCopy}><span>LÍDER DA ARTILHARIA</span><h2>{goldenPlayer.name}</h2><p>{goldenPlayer.clubName}</p><strong>{goldenLeader.goals}</strong><small>GOLS · PREMIER LEAGUE 2026/27</small></div><div className={styles.heroCard}>{playerCard(goldenPlayer, .94)}</div></section> : <section className={styles.pending}><span>ARTILHARIA EM CONFERÊNCIA</span><h2>A disputa merece<br />números certos.</h2><p>Aguardando a consolidação dos gols oficiais da temporada.</p></section> : null}
    <footer className={styles.footer}><span>Dados até {sourceLabel}</span><strong>MONTE SEU XI NA TOUCHLINE <i>↗</i></strong></footer>
  </main>;
}
