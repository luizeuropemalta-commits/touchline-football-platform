import { createHash } from "node:crypto";
import type { RankingsLiveArtId, RankingsLiveDerived } from "./social-rankings-live-contract.ts";
import { leadershipCrownEligibility } from "./touchlineArena/leadership-decision.ts";
function rating(value: number | null) {
  if (value === null || !Number.isFinite(value)) throw new Error("RANKINGS_EDITORIAL_RATING_UNAVAILABLE");
  return value.toFixed(2).replace(".", ",");
}

/** Platform copy is a proposal tied to the same immutable football facts. */
export function rankingsLiveCaptions(data: RankingsLiveDerived, artId: RankingsLiveArtId, placement: "FEED" | "STORY") {
  if (artId === "OVERALL_LEADER" && !leadershipCrownEligibility(data.leadership, { subjectType: "player", subjectId: data.overall.playerId }, { rankingId: "touchline-player-overall", snapshotId: data.seasonRanking.snapshot.snapshotId })) throw new Error("RANKINGS_EDITORIAL_LEADERSHIP_MISMATCH");
  const coach = data.coaches[0]!, weeklyCoach = data.weeklyCoaches[0]!;
  const top = data.goldenBoot.state === "FACTUAL_REVIEW" && data.goldenBoot.candidates.length === 1 ? data.goldenBoot.candidates[0] : null;
  if (artId === "GOLDEN_BOOT" && !top) throw new Error("GOLDEN_BOOT_RECONCILIATION_REQUIRED");
  const weeklyTies = data.weeklyCoaches.filter((c) => c.touchlinePoints === weeklyCoach.touchlinePoints && c.wins === weeklyCoach.wins && c.awayWins === weeklyCoach.awayWins).length;
  const leads: Record<RankingsLiveArtId, string> = {
    OVERALL_LEADER: `👑 ${data.overall.name} lidera este replay retrospectivo com ${rating(data.overall.totalRating)} de Total Rating. Resultado local após a rodada ${data.round.name}; não representa o ranking ativo publicado.`,
    GAMEWEEK_TOP_CARD: `⭐ ${data.weeklyOverall.name} é o card líder da rodada ${data.round.name}: ${rating(data.weeklyOverall.totalRating)} de Total Rating, pelo ${data.weeklyOverall.clubName}. Aqui conta somente esta rodada.`,
    GAMEWEEK_HERO: `⭐ Os destaques da rodada ${data.round.name}, posição por posição: ${data.weeklyLeaders.map((p) => `${p.name} (${rating(p.totalRating)})`).join("; ")}. Somente os ratings desta rodada.`,
    GAMEWEEK_XI_COACH: `⚽ O XI da rodada ${data.round.name} em ${data.weeklySelection.formation}: ${data.weeklySelection.players.map((p) => p.player.name).join(", ")}. Treinador: ${weeklyCoach.name}, com ${weeklyCoach.touchlinePoints} pontos TouchLine nesta rodada.${weeklyTies > 1 ? ` Selecionado pelo desempate canônico entre ${weeklyTies} treinadores com a mesma pontuação, vitórias e vitórias fora.` : ""}`,
    SEASON_XI_COACH: `⚽ A seleção do acumulado em ${data.selection.formation}: ${data.selection.players.map((p) => p.player.name).join(", ")}. No comando, ${coach.name}, com ${coach.touchlinePoints} pontos TouchLine na temporada. Não é o XI apenas da rodada.`,
    TOP_COACH: `📋 ${coach.name}, do ${coach.clubName}, lidera o acumulado dos treinadores com ${coach.touchlinePoints} pontos TouchLine: ${coach.wins} vitórias, ${coach.awayWins} delas fora de casa.`,
    GOLDEN_BOOT: top ? `⚽ ${top.name} soma ${top.goals} gols e lidera a artilharia da Premier League 2026/27 neste recorte. Gols válidos, incluindo pênaltis convertidos; gols contra ficam fora da contagem.` : "",
    LEAGUE_TABLE_PREVIEW: `⚽ Antes da rodada ${data.nextRound?.name}, confira a classificação dos clubes. ${data.table.rows[0]!.team.name} lidera com ${data.table.rows[0]!.points} pontos. A disputa continua.`,
    LEAGUE_TABLE_FINAL: `🏁 Rodada ${data.round.name} encerrada. ${data.table.rows[0]!.team.name} lidera com ${data.table.rows[0]!.points} pontos após os ${data.table.coverage.completedFixtures} jogos concluídos da temporada.`,
  };
  const source = new Date(data.provenance.asOf).toISOString();
  const dated = `Dados até ${source.slice(8, 10)}/${source.slice(5, 7)}/${source.slice(0, 4)} · ${source.slice(11, 16)} UTC.`;
  const body = `AMOSTRA RETROSPECTIVA · NÃO PUBLICADA\n\n${leads[artId]}\n\n${dated}\n\nMonte seu XI na TouchLine.`;
  return { INSTAGRAM: `${body}${placement === "FEED" ? "\n\n#TouchLine #PremierLeague" : ""}`, FACEBOOK: body };
}

/** Produces no queue writes and no executable delivery permission. Accounts are owner-selected. */
export function rankingsLiveDispatchProposal(data: RankingsLiveDerived, artId: RankingsLiveArtId) {
  const roundScoped = artId.startsWith("GAMEWEEK_") || artId.startsWith("LEAGUE_TABLE_");
  const scope = artId === "LEAGUE_TABLE_PREVIEW" ? data.nextRound?.provider_round_id : roundScoped ? data.round.provider_round_id : "season";
  if (!scope) throw new Error("RANKINGS_DISPATCH_SCOPE_MISSING");
  const suggestedAt = artId === "LEAGUE_TABLE_PREVIEW"
    ? data.nextRoundStartsAt ? new Date(Date.parse(data.nextRoundStartsAt) - 86400000).toISOString() : null
    : data.provenance.asOf;
  if (artId === "LEAGUE_TABLE_PREVIEW" && !suggestedAt) throw new Error("RANKINGS_NEXT_ROUND_START_MISSING");
  const instanceKey = `sha256:${createHash("sha256").update([artId, data.provenance.competitionId, data.provenance.seasonId, scope, data.provenance.revision].join("\0")).digest("hex")}`;
  const subjectPlayer = artId === "OVERALL_LEADER" ? data.overall : artId === "GAMEWEEK_TOP_CARD" ? data.weeklyOverall : null;
  const subjectTeam = subjectPlayer ? data.playerClubProviderIds[subjectPlayer.playerId] : artId === "TOP_COACH" ? data.coaches[0]?.clubProviderId : artId === "GOLDEN_BOOT" && data.goldenBoot.state === "FACTUAL_REVIEW" ? data.playerClubProviderIds[data.goldenBoot.candidates[0]?.playerId ?? ""] : null;
  return { artId, instanceKey, publishable: false, outbound: "DISABLED", permission: "PAUSED", enabled: false, suggestedAt,
    trigger: artId === "LEAGUE_TABLE_PREVIEW" ? "T_MINUS_24_HOURS_FIRST_ROUND_FIXTURE" : "AFTER_COMPLETE_ROUND_RECONCILIATION",
    editorialSchedule: null, timeZone: null, ownerEditable: true,
    destinations: ["INSTAGRAM", "FACEBOOK"].flatMap((platform) => ["FEED", "STORY"].map((placement) => ({ platform, placement, accountId: null, selected: false, artworkApproved: false, captionApproved: false }))),
    internal: subjectTeam ? { state: "SUBJECT_CLUB_PROPOSAL_NOT_SELECTED", providerTeamIds: [subjectTeam], selected: false } : { state: "PENDING_OWNER_COLLECTIVE_DESTINATION", providerTeamIds: [], selected: false },
    rules: ["No automatic activation from a suggested time", "All relevant fixtures must be final; postponed/incomplete round blocks", "Separate artwork and caption approvals for every platform/placement", "Require decoded MP4 and two observed loops before approval", "Revalidate sources, card publication and active ranking before delivery", "Use destination account plus placement plus factual instance as the delivery idempotency key", "Confirmed/in-flight delivery never retries; uncertain delivery reconciles first"],
    blockers: [...data.gates, "OWNER_DESTINATION_AND_SCHEDULE_REQUIRED", "NO_DELIVERY_ADAPTER_IN_THIS_PROPOSAL"] };
}
