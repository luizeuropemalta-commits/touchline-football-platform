"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_POSITION_RANKING_GROUPS,
  TOUCHLINE_POSITION_RANKING_LABELS,
  type TouchlinePositionRankingGroup,
  type TouchlineRankedPlayer,
  type TouchlineRankingSnapshot,
} from "@/lib/touchlineArena/card-ranking";
import {
  TOUCHLINE_CARD_STARTING_TIER_KEY,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import {
  CLUB_OWNER_SQUAD_CARDS,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  findTouchLineClub,
  squadCardToExactPlayer,
} from "@/lib/touchlineArena/demo-data";
import { buildTouchlineSelection } from "@/lib/touchlineArena/touchline-selection";
import styles from "./ranking-simulator.module.css";

type SimulatorMode = "preseason" | "ranked-preview";

const TIER_COLORS: Record<TouchlineCardTierKey, string> = {
  "ruby-red": "#d82d3f",
  "sapphire-blue": "#3189e8",
  "amethyst-purple": "#9b61d8",
  "radiant-gold": "#d8a93b",
  "emerald-green": "#38a86c",
  "clear-diamond": "#dcecf4",
  "diamond-gold": "#f1cf68",
};

function tierForMode(player: TouchlineRankedPlayer, mode: SimulatorMode) {
  return mode === "preseason" ? TOUCHLINE_CARD_STARTING_TIER_KEY : player.tierKey;
}

function priceForTier(tierKey: TouchlineCardTierKey) {
  return touchlineArenaTierForKey(tierKey)?.retailPriceTc ?? 0;
}

function projectSelectionPoint(x: number, y: number) {
  return {
    x: 7 + (1 - y / 100) * 86,
    y: 7 + (x / 100) * 86,
  };
}

function openSelectionCardFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>, openCard: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openCard();
}

function PlayerLogo({ player }: { player: TouchlineRankedPlayer }) {
  const club = findTouchLineClub(player.clubName);
  if (!club?.logoUrl) return <span className={styles.logoFallback}>{player.clubName.slice(0, 2)}</span>;

  return (
    <Image
      src={club.logoUrl}
      alt=""
      width={44}
      height={44}
      className={styles.clubLogo}
      unoptimized
    />
  );
}

function SelectionCard({
  player,
  tierKey,
}: {
  player: TouchlineRankedPlayer;
  tierKey: TouchlineCardTierKey;
}) {
  const baseCard = CLUB_OWNER_SQUAD_CARDS.find((card) => card.id === player.playerId);
  if (!baseCard) return <PlayerLogo player={player} />;

  return (
    <TouchlineEliteExactCard
      className={styles.selectionRenderedCard}
      player={squadCardToExactPlayer({
        ...baseCard,
        cardTier: tierKey,
        seasonTotalRating: player.totalRating,
      })}
      labels={{
        nationality: "País",
        totalRating: "Nota total",
        cardPrice: "TC",
      }}
      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
      imageLoading="lazy"
      rankingMode="preview"
    />
  );
}

export default function RankingSimulator({ snapshot }: { snapshot: TouchlineRankingSnapshot }) {
  const [mode, setMode] = useState<SimulatorMode>("ranked-preview");
  const [activeGroup, setActiveGroup] = useState<TouchlinePositionRankingGroup | "all">("all");
  const [zoomedSelectionSlotId, setZoomedSelectionSlotId] = useState<string | null>(null);

  const visiblePlayers = useMemo(
    () => activeGroup === "all"
      ? snapshot.players
      : snapshot.positions.find((position) => position.group === activeGroup)?.players ?? [],
    [activeGroup, snapshot],
  );

  const tierDistribution = useMemo(() => {
    const counts = new Map<TouchlineCardTierKey, number>();
    for (const player of snapshot.players) {
      const tierKey = tierForMode(player, mode);
      counts.set(tierKey, (counts.get(tierKey) ?? 0) + 1);
    }
    return counts;
  }, [mode, snapshot.players]);
  const selection = useMemo(() => buildTouchlineSelection(snapshot), [snapshot]);
  const zoomedSelectionSlot = selection.players.find((slot) => slot.id === zoomedSelectionSlotId) ?? null;

  useEffect(() => {
    if (!zoomedSelectionSlotId) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomedSelectionSlotId(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [zoomedSelectionSlotId]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>TouchLine Arena · Controle privado</span>
          <h1>Simulador do ranking dos cards</h1>
          <p>Prévia isolada. Esta tela não publica cores, preços ou posições no jogo.</p>
        </div>
        <div className={styles.headerStatus}>
          <LockKeyhole aria-hidden="true" />
          <div>
            <span>Estado</span>
            <strong>Rascunho bloqueado</strong>
          </div>
        </div>
      </header>

      <section className={styles.controlBand} aria-label="Modo da simulação">
        <div className={styles.segmented}>
          <button type="button" aria-pressed={mode === "preseason"} className={mode === "preseason" ? styles.activeSegment : ""} onClick={() => setMode("preseason")}>
            Pré-temporada
          </button>
          <button type="button" aria-pressed={mode === "ranked-preview"} className={mode === "ranked-preview" ? styles.activeSegment : ""} onClick={() => setMode("ranked-preview")}>
            Após fechamento
          </button>
        </div>
        <div className={styles.sourceLine}>
          <Database aria-hidden="true" />
          <span>Fonte: dados simulados para QA</span>
          <i />
          <span>{snapshot.players.length} cards</span>
          <i />
          <span>6 rankings posicionais</span>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumo da simulação">
        <article>
          <ShieldCheck aria-hidden="true" />
          <span>Fase pública atual</span>
          <strong>Ruby Red · 1 TC</strong>
          <small>O jogo continua sem mudança.</small>
        </article>
        <article>
          <Trophy aria-hidden="true" />
          <span>Líderes posicionais</span>
          <strong>{mode === "preseason" ? "6 líderes simulados" : "6 Diamond Gold"}</strong>
          <small>{mode === "preseason" ? "Ainda sem mudança pública." : "Um líder em cada grupo."}</small>
        </article>
        <article>
          <CheckCircle2 aria-hidden="true" />
          <span>Regra de desempate</span>
          <strong>Pontos · Minutos · Jogos</strong>
          <small>ID TouchLine encerra o empate.</small>
        </article>
      </section>

      <section className={styles.auditBand} aria-label="Barreira de publicação">
        <div className={styles.auditSummary}>
          <ShieldAlert aria-hidden="true" />
          <div>
            <span>Publicação protegida</span>
            <strong>Bloqueada por fonte simulada</strong>
            <small>Nenhuma cor ou preço desta tela pode entrar na Arena.</small>
          </div>
        </div>
        <div className={styles.auditChecks}>
          <span className={styles.failedCheck}>TouchLine verificado</span>
          <span>35 IDs únicos</span>
          <span>6 grupos completos</span>
          <span>Preço oficial v2</span>
          <span className={styles.failedCheck}>Snapshot publicado</span>
        </div>
      </section>

      <section className={styles.leaderBand}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Líderes da rodada simulada</span>
            <h2>Topo por posição</h2>
          </div>
          <small>O primeiro de cada posição recebe Diamond Gold somente após publicação auditada.</small>
        </div>
        <div className={styles.leaderGrid}>
          {snapshot.positions.map((position) => {
            const leader = position.players[0];
            if (!leader) return null;
            const shownTier = tierForMode(leader, mode);
            return (
              <button key={position.group} type="button" onClick={() => setActiveGroup(position.group)} className={activeGroup === position.group ? styles.selectedLeader : ""}>
                <span className={styles.rankMarker}>#1</span>
                <PlayerLogo player={leader} />
                <span className={styles.leaderCopy}>
                  <small>{TOUCHLINE_POSITION_RANKING_LABELS[position.group].pt}</small>
                  <strong>{leader.name}</strong>
                  <em>Rating {leader.totalRating?.toFixed(2) ?? "—"} · {leader.minutesPlayed} min</em>
                </span>
                <span className={styles.tierSwatch} style={{ background: TIER_COLORS[shownTier] }} title={shownTier} />
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.selectionBand}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Seleção TouchLine</span>
            <h2>Os 11 líderes no campo</h2>
          </div>
          <small>Formação 4-3-3 v1. A escalação nasce do mesmo snapshot do ranking, sem um segundo cálculo.</small>
        </div>
        <div className={styles.selectionLayout}>
          <div className={styles.selectionPitch} aria-label="Formação TouchLine 4-3-3">
            <Image
              src="/touchlineArena/ranking/touchline-selection-pitch-horizontal.webp"
              alt=""
              fill
              priority
              sizes="(max-width: 760px) 96vw, 1200px"
              className={styles.selectionPitchArt}
            />
            {selection.players.map((slot) => {
              const shownTier = tierForMode(slot.player, mode);
              const point = projectSelectionPoint(slot.x, slot.y);
              return (
                <article
                  key={slot.id}
                  className={styles.selectionPlayer}
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    "--tier-color": TIER_COLORS[shownTier],
                  } as React.CSSProperties}
                >
                  <span className={styles.selectionSlot}>{slot.label}</span>
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.selectionCard}
                    aria-label={`Ampliar card de ${slot.player.name}`}
                    onClick={() => setZoomedSelectionSlotId(slot.id)}
                    onKeyDown={(event) => openSelectionCardFromKeyboard(event, () => setZoomedSelectionSlotId(slot.id))}
                  >
                    <SelectionCard player={slot.player} tierKey={shownTier} />
                  </div>
                </article>
              );
            })}
            {zoomedSelectionSlot ? (
              <div
                className={styles.selectionZoomBackdrop}
                role="dialog"
                aria-modal="true"
                aria-label={`Card ampliado de ${zoomedSelectionSlot.player.name}`}
                onClick={() => setZoomedSelectionSlotId(null)}
              >
                <div className={styles.selectionZoomContent} onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.selectionZoomClose}
                    aria-label="Fechar card ampliado"
                    onClick={() => setZoomedSelectionSlotId(null)}
                  >
                    <X aria-hidden="true" />
                  </button>
                  <SelectionCard
                    player={zoomedSelectionSlot.player}
                    tierKey={tierForMode(zoomedSelectionSlot.player, mode)}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <aside className={styles.selectionMeta}>
            <div className={styles.selectionMetaStatus}>
              <Activity aria-hidden="true" />
              <div>
                <span>Estado da escalação</span>
                <strong>{selection.complete ? "11 posições completas" : `${selection.missingSlots.length} posições ausentes`}</strong>
              </div>
            </div>
            <div className={styles.selectionMetaSource}>
              <small>Snapshot {selection.sourceSnapshotId}</small>
              <small>{selection.version}</small>
            </div>
            <p>O mercado não escolhe nenhum atleta. Pontos, minutos, jogos e ID TouchLine definem a ordem.</p>
          </aside>
        </div>
      </section>

      <section className={styles.distributionBand}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Distribuição automática</span>
            <h2>Cores e preços</h2>
          </div>
          <small>O valor de mercado não participa do cálculo.</small>
        </div>
        <div className={styles.tierDistribution}>
          {[
            "diamond-gold",
            "clear-diamond",
            "emerald-green",
            "radiant-gold",
            "amethyst-purple",
            "sapphire-blue",
            "ruby-red",
          ].map((tierKey) => {
            const typedTierKey = tierKey as TouchlineCardTierKey;
            const tier = touchlineArenaTierForKey(typedTierKey);
            return (
              <article key={tierKey}>
                <span className={styles.tierGem} aria-hidden="true">
                  {tier ? <Image src={tier.frameUrl} alt="" width={342} height={512} /> : null}
                </span>
                <div>
                  <strong>{tier?.label}</strong>
                  <small>{priceForTier(typedTierKey)} TC</small>
                </div>
                <b>{tierDistribution.get(typedTierKey) ?? 0}</b>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.rankingBand}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Conferência atleta por atleta</span>
            <h2>Resultado da simulação</h2>
          </div>
          <small>Ordenação estável para impedir mudanças visuais sem alteração de dados.</small>
        </div>

        <div className={styles.groupTabs} role="tablist" aria-label="Posições">
          <button role="tab" aria-selected={activeGroup === "all"} type="button" onClick={() => setActiveGroup("all")} className={activeGroup === "all" ? styles.activeTab : ""}>Todos</button>
          {TOUCHLINE_POSITION_RANKING_GROUPS.map((group) => (
            <button role="tab" aria-selected={activeGroup === group} key={group} type="button" onClick={() => setActiveGroup(group)} className={activeGroup === group ? styles.activeTab : ""}>
              {TOUCHLINE_POSITION_RANKING_LABELS[group].pt}
            </button>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Posição</th>
                <th>Jogador</th>
                <th>Clube</th>
                <th>Nota total</th>
                <th>Minutos</th>
                <th>Jogos</th>
                <th>Cor</th>
                <th>Preço</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((player) => {
                const shownTier = tierForMode(player, mode);
                const tier = touchlineArenaTierForKey(shownTier);
                return (
                  <tr key={player.playerId}>
                    <td><b>#{player.positionRank}</b><small>{TOUCHLINE_POSITION_RANKING_LABELS[player.positionGroup].pt}</small></td>
                    <td><strong>{player.name}</strong><small>{player.position}</small></td>
                    <td><span className={styles.clubCell}><PlayerLogo player={player} /> {player.clubName}</span></td>
                    <td><strong>{player.totalRating?.toFixed(2) ?? "—"}</strong></td>
                    <td>{player.minutesPlayed}</td>
                    <td>{player.appearances}</td>
                    <td><span className={styles.tierCell}><i style={{ background: TIER_COLORS[shownTier] }} /> {tier?.label}</span></td>
                    <td><b>{priceForTier(shownTier)} TC</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.footer}>
        <ShieldCheck aria-hidden="true" />
        <span>Para entrar no jogo, um snapshot precisa ser auditado, publicado e identificado por rodada.</span>
      </footer>
    </main>
  );
}
