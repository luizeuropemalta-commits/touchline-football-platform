"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";

import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  buildTouchlineMatchScoringBreakdownFields,
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import {
  isTouchlineTacticalSlotCandidateEligible,
  type TouchlineFormationGeometryRegistry,
} from "@/lib/touchlineArena/formation-geometry";
import { TOUCHLINE_SQUAD_RULES, resolveTouchlineSquadJourney } from "@/lib/touchlineArena/squad-rules";
import { touchlineCanonicalFormationSlots } from "@/lib/touchlineArena/pitch-layout";

import styles from "./TouchlineSquadBuilderStage.module.css";

export type TouchlineSquadBuilderRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type TouchlineSquadBuilderStarter = {
  id: string;
  name: string;
  shortName: string;
  role: TouchlineSquadBuilderRole;
  card: TouchlineEliteExactPlayer;
};

export type TouchlineSquadBuilderBenchPlayer = {
  id: string;
  shortName: string;
  role: TouchlineSquadBuilderRole;
  position: string;
  card: TouchlineEliteExactPlayer;
};

type FormationSlot = ReturnType<typeof touchlineCanonicalFormationSlots>[number] & { id: string };

type Props = {
  locale: string;
  formation: string;
  formationConfirmed: boolean;
  formationOptions: readonly string[];
  geometryRegistry?: TouchlineFormationGeometryRegistry;
  onSelectFormation: (formation: string) => void;
  coachName?: string | null;
  coachCard?: ReactNode;
  coachProfileHref?: string | null;
  starters: TouchlineSquadBuilderStarter[];
  bench: TouchlineSquadBuilderBenchPlayer[];
  remainingSquad: TouchlineSquadBuilderBenchPlayer[];
  contractedCount: number;
  formationFeedback?: string | null;
  canEditCardEngine?: boolean;
  onAssignPlayer: (selection: {
    role: TouchlineSquadBuilderRole;
    targetPlayerId: string | null;
    candidateId: string;
  }) => void;
};

function SquadPlayerCardZoom({
  card,
  locale,
  canEditCardEngine,
}: Readonly<{
  card: TouchlineEliteExactPlayer;
  locale: string;
  canEditCardEngine: boolean;
}>) {
  const portuguese = locale === "pt-BR";
  const profileHref = touchlinePlayerProfileHref(card, locale, { previewTier: card.cardTier });
  const tierKey = card.editorialCard?.tierKey ?? card.cardTier ?? null;
  const tierAccent = tierKey ? touchlineCardTierPalette(tierKey).accent : TOUCHLINE_NEUTRAL_CARD_ACCENT;
  const cardEngineHref = canEditCardEngine
    ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
    : null;

  return (
    <TouchlineCardZoom
      ariaLabel={`${portuguese ? "Ampliar card de" : "Expand card for"} ${card.name}`}
      tierAccent={tierAccent}
      tierLabel={tierKey ? touchlineCardTierName(tierKey, locale) : undefined}
      details={buildTouchlinePlayerCardZoomDetails({
        locale,
        name: card.name,
        clubName: card.clubName,
        position: card.position || card.role,
        nationality: card.nationality || card.countryCode3,
        editorialCard: card.editorialCard,
        cardReview: card.cardReview,
        touchlinePoints: card.fantasyPoints,
        extraFields: [
          {
            label: portuguese ? "Pontos da partida" : "Match points",
            value: card.matchFantasyPoints == null ? "—" : String(card.matchFantasyPoints),
            accent: true,
          },
          ...buildTouchlineVerifiedMatchFactFields({
            statistics: card.matchStats,
            position: card.position || card.role,
          }, locale),
          ...buildTouchlineMatchScoringBreakdownFields(card.matchPointContributions, locale),
        ],
        profileHref,
        cardEngineHref,
      })}
      expandedContent={(
        <TouchlineEliteExactCard
          player={card}
          rankingMode="live"
          forceNeonActive
          imageLoading="eager"
          playerProfileHref={profileHref}
        />
      )}
    >
      <TouchlineEliteExactCard
        player={card}
        rankingMode="live"
        optimizeForLiveCompact
        enableInteractiveNeon={false}
        showCardActions={false}
        showProfileAction={false}
        showSocialMetrics={false}
        allowVisualInventoryPreview
      />
    </TouchlineCardZoom>
  );
}

function formationSlots(formation: string, geometryRegistry?: TouchlineFormationGeometryRegistry): FormationSlot[] {
  return touchlineCanonicalFormationSlots(formation, geometryRegistry).map((slot) => ({
    ...slot,
    id: slot.id,
  }));
}

function roleLabel(role: TouchlineSquadBuilderRole, portuguese: boolean) {
  if (role === "goalkeeper") return portuguese ? "Goleiro" : "Goalkeeper";
  if (role === "defender") return portuguese ? "Defensor" : "Defender";
  if (role === "midfielder") return portuguese ? "Meio-campista" : "Midfielder";
  return portuguese ? "Atacante" : "Forward";
}

function vacancyLabel(role: TouchlineSquadBuilderRole, count: number, portuguese: boolean) {
  if (!portuguese) return `${count} ${roleLabel(role, false).toLowerCase()}${count === 1 ? "" : "s"} required`;
  const label = role === "goalkeeper"
    ? count === 1 ? "goleiro" : "goleiros"
    : role === "defender"
      ? count === 1 ? "defensor" : "defensores"
      : role === "midfielder"
        ? count === 1 ? "meio-campista" : "meio-campistas"
        : count === 1 ? "atacante" : "atacantes";
  return `${count} ${label} ${count === 1 ? "necessário" : "necessários"}`;
}

export default function TouchlineSquadBuilderStage({
  locale,
  formation,
  formationConfirmed,
  formationOptions,
  geometryRegistry,
  onSelectFormation,
  coachName,
  coachCard,
  coachProfileHref,
  starters,
  bench,
  remainingSquad,
  contractedCount,
  formationFeedback,
  canEditCardEngine = false,
  onAssignPlayer,
}: Props) {
  const portuguese = locale === "pt-BR";
  const slots = useMemo(() => formationSlots(formation, geometryRegistry), [formation, geometryRegistry]);
  const [activeSlot, setActiveSlot] = useState<{
    id: string;
    role: TouchlineSquadBuilderRole;
    allowedPositions: FormationSlot["allowedPositions"];
    targetPlayerId: string | null;
  } | null>(null);
  const startersBySlot = useMemo(() => {
    const available = [...starters];
    const assigned = new Map<string, TouchlineSquadBuilderStarter>();
    for (const slot of slots) {
      const exactIndex = available.findIndex((player) => isTouchlineTacticalSlotCandidateEligible({
        position: player.card.position || player.role,
        role: player.role,
      }, slot));
      const broadIndex = available.findIndex((player) => player.role === slot.role);
      const selectedIndex = exactIndex >= 0 ? exactIndex : broadIndex;
      if (selectedIndex < 0) continue;
      const [player] = available.splice(selectedIndex, 1);
      if (player) assigned.set(slot.id, player);
    }
    return assigned;
  }, [slots, starters]);
  const squadCandidates = useMemo(
    () => [...bench, ...remainingSquad],
    [bench, remainingSquad],
  );
  const eligibleCandidates = useMemo(() => (
    activeSlot
      ? squadCandidates.filter((player) => isTouchlineTacticalSlotCandidateEligible(
          { position: player.position, role: player.role },
          activeSlot,
        ))
      : []
  ), [activeSlot, squadCandidates]);
  const vacancyCounts = slots.reduce<Partial<Record<TouchlineSquadBuilderRole, number>>>((counts, slot) => {
    const player = startersBySlot.get(slot.id);
    if (!player) counts[slot.role] = (counts[slot.role] ?? 0) + 1;
    return counts;
  }, {});
  const vacancies = (Object.entries(vacancyCounts) as Array<[TouchlineSquadBuilderRole, number]>).filter(([, count]) => count > 0);
  const vacancyTotal = vacancies.reduce((total, [, count]) => total + count, 0);
  const vacancySummary = vacancies.map(([role, count]) => vacancyLabel(role, count, portuguese)).join(" · ");

  useEffect(() => {
    if (!activeSlot) return;
    function closePicker(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveSlot(null);
    }
    window.addEventListener("keydown", closePicker);
    return () => window.removeEventListener("keydown", closePicker);
  }, [activeSlot]);
  const journey = resolveTouchlineSquadJourney({
    hasCoach: Boolean(coachName),
    hasFormation: formationConfirmed,
    starterCount: starters.length,
    benchCount: bench.length,
    contractedCount,
  });
  const steps = [
    { key: "coach", label: portuguese ? "Treinador" : "Coach", complete: journey.coachComplete },
    { key: "formation", label: portuguese ? "Formação" : "Formation", complete: journey.formationComplete },
    { key: "starting-xi", label: portuguese ? "Time titular" : "Starting XI", complete: journey.startingXiComplete },
    { key: "bench", label: portuguese ? "Banco" : "Bench", complete: journey.benchComplete },
    { key: "full-squad", label: portuguese ? "Elenco completo" : "Full squad", complete: journey.fullSquadComplete },
    { key: "review", label: portuguese ? "Revisar clube" : "Review club", complete: false },
  ] as const;
  const currentStepIndex = Math.max(0, steps.findIndex((step) => step.key === journey.currentStep));

  return (
    <section className={styles.shell} aria-labelledby="touchline-squad-builder-title">
      <header className={styles.hero}>
        <div>
          <span>{portuguese ? "CONSTRUÇÃO DO CLUBE" : "CLUB CONSTRUCTION"}</span>
          <h1 id="touchline-squad-builder-title">{portuguese ? "Monte seu time TouchLine" : "Build Your TouchLine Team"}</h1>
          <p>{portuguese ? "Escolha seu treinador, contrate seus atletas e prepare seu clube para a Arena." : "Choose your coach, sign your players and prepare your club for the Arena."}</p>
        </div>
        <strong>{formation}</strong>
      </header>

      <ol className={styles.progress} aria-label={portuguese ? "Etapas para montar o clube" : "Club-building steps"}>
        {steps.map((step, index) => (
          <li key={step.key} className={step.complete ? styles.complete : index === currentStepIndex ? styles.current : ""} aria-current={index === currentStepIndex ? "step" : undefined}>
            <b>{step.complete ? <Check aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</b>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      <section className={`${styles.formationStep} ${journey.formationComplete ? styles.completeFormation : ""}`} aria-labelledby="market-formation-title">
        <div>
          <span>{portuguese ? "PASSO 2 · OBRIGATÓRIO" : "STEP 2 · REQUIRED"}</span>
          <strong id="market-formation-title">{portuguese ? "Escolha a formação do Meu Clube" : "Choose My Club formation"}</strong>
          <small>{portuguese ? "Depois de confirmar, as posições do Market Transfer serão liberadas." : "Once confirmed, Market Transfer positions will unlock."}</small>
        </div>
        <div role="group" aria-label={portuguese ? "Formações disponíveis" : "Available formations"}>
          {formationOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={journey.formationComplete && formation === option ? styles.activeFormation : ""}
              onClick={() => {
                setActiveSlot(null);
                onSelectFormation(option);
              }}
              aria-pressed={journey.formationComplete && formation === option}
              disabled={!journey.coachComplete}
            >
              <b>{option}</b>
              <span>{portuguese ? "Usar formação" : "Use formation"}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <div className={styles.pitchColumn}>
          <TouchlinePitchSurface className={styles.pitch} ariaLabel={portuguese ? `Time titular ${formation}` : `${formation} Starting XI`}>
            <div className={`${styles.formationStatus} ${vacancyTotal ? styles.incompleteFormation : styles.readyFormation}`} role="status" aria-live="polite">
              <strong>{vacancyTotal ? vacancySummary : (portuguese ? "Formação completa" : "Formation complete")}</strong>
              {formationFeedback ? <span>{formationFeedback}</span> : null}
            </div>
            {slots.map((slot) => {
              const player = startersBySlot.get(slot.id);
              return player ? (
                <article
                  key={slot.id}
                  className={styles.playerSlot}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                >
                  <span className={styles.playerCardZoom}>
                    <SquadPlayerCardZoom card={player.card} locale={locale} canEditCardEngine={canEditCardEngine} />
                  </span>
                  <strong>{player.shortName}</strong>
                  <button
                    type="button"
                    className={styles.changePlayer}
                    onClick={() => setActiveSlot({ id: slot.id, role: slot.role, allowedPositions: slot.allowedPositions, targetPlayerId: player.id })}
                    disabled={!journey.formationComplete}
                    aria-label={`${portuguese ? "Alterar" : "Change"} ${player.name} · ${roleLabel(slot.role, portuguese)}`}
                    aria-haspopup="dialog"
                  >
                    {portuguese ? "Alterar" : "Change"}
                  </button>
                </article>
              ) : (
                <button
                  key={slot.id}
                  type="button"
                  className={`${styles.emptySlot} ${activeSlot?.id === slot.id ? styles.selected : ""}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onClick={() => setActiveSlot({ id: slot.id, role: slot.role, allowedPositions: slot.allowedPositions, targetPlayerId: null })}
                  disabled={!journey.formationComplete}
                  aria-label={`${portuguese ? "Adicionar" : "Add"} ${roleLabel(slot.role, portuguese)}`}
                  aria-pressed={activeSlot?.id === slot.id}
                  aria-haspopup="dialog"
                >
                  <b>+</b>
                  <span>{roleLabel(slot.role, portuguese)}</span>
                </button>
              );
            })}
            {activeSlot ? (
              <section className={styles.slotPicker} role="dialog" aria-modal="false" aria-labelledby="formation-slot-picker-title">
                <header>
                  <div>
                    <span>{portuguese ? "SELEÇÃO NO CAMPO" : "ON-PITCH SELECTION"}</span>
                    <strong id="formation-slot-picker-title">
                      {activeSlot.targetPlayerId
                        ? (portuguese ? `Substituir ${roleLabel(activeSlot.role, portuguese)}` : `Replace ${roleLabel(activeSlot.role, portuguese)}`)
                        : (portuguese ? `${roleLabel(activeSlot.role, portuguese)} necessário` : `${roleLabel(activeSlot.role, portuguese)} required`)}
                    </strong>
                  </div>
                  <button type="button" onClick={() => setActiveSlot(null)} aria-label={portuguese ? "Fechar seleção" : "Close selection"} autoFocus>
                    <X aria-hidden="true" />
                  </button>
                </header>
                <p>{portuguese ? "Somente atletas elegíveis para esta posição." : "Only players eligible for this position."}</p>
                <div className={styles.slotPickerCandidates}>
                  {eligibleCandidates.length ? eligibleCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        onAssignPlayer({
                          role: activeSlot.role,
                          targetPlayerId: activeSlot.targetPlayerId,
                          candidateId: candidate.id,
                        });
                        setActiveSlot(null);
                      }}
                    >
                      <span className={styles.slotPickerCard} aria-hidden="true">
                        <TouchlineEliteExactCard
                          player={candidate.card}
                          rankingMode="live"
                          optimizeForLiveCompact
                          enableInteractiveNeon={false}
                          showCardActions={false}
                          showProfileAction={false}
                          showSocialMetrics={false}
                          allowVisualInventoryPreview
                        />
                      </span>
                      <span><b>{candidate.shortName}</b><small>{candidate.position}</small></span>
                    </button>
                  )) : (
                    <p>{portuguese ? "Nenhum atleta elegível disponível no elenco." : "No eligible squad player is available."}</p>
                  )}
                </div>
              </section>
            ) : null}
          </TouchlinePitchSurface>

          <aside className={styles.technicalArea} aria-label={portuguese ? "Área técnica e preparação do elenco" : "Technical area and squad preparation"}>
            <span>{portuguese ? "ÁREA TÉCNICA" : "TECHNICAL AREA"}</span>
            {coachProfileHref && coachCard ? (
              <a className={styles.coachCardLink} href={coachProfileHref} aria-label={portuguese ? `Abrir perfil de ${coachName ?? "treinador"}` : `Open profile for ${coachName ?? "coach"}`}>
                <div className={styles.coachCard}>{coachCard}</div>
              </a>
            ) : (
              <div className={styles.coachCard}>{coachCard ?? <b className={styles.emptyCoach} aria-hidden="true">+</b>}</div>
            )}
            <div className={styles.coachBrief}>
              <strong>{coachName ?? (portuguese ? "Escolha seu treinador" : "Choose your coach")}</strong>
              <p>{portuguese ? "Defina a formação, contrate atletas e leve o grupo completo para a Arena." : "Set the formation, sign players and take the complete group into the Arena."}</p>
              {coachProfileHref ? <a href={coachProfileHref}>{portuguese ? "Ver perfil do treinador" : "View coach profile"}</a> : null}
            </div>
            <div className={styles.summary} aria-label={portuguese ? "Progresso do elenco" : "Squad progress"}>
              <span><small>{portuguese ? "Titulares" : "Starting XI"}</small><strong>{starters.length}/11</strong></span>
              <span><small>{portuguese ? "Banco" : "Bench"}</small><strong>{bench.length}/9</strong></span>
              <span><small>{portuguese ? "Elenco" : "Squad"}</small><strong>{contractedCount}/35</strong></span>
            </div>
          </aside>
        </div>
      </div>

      <section className={styles.bench} aria-label={portuguese ? "Banco da partida" : "Matchday bench"}>
        <header><span>TOUCHLINE</span><strong>{portuguese ? "Banco da partida" : "Matchday bench"}</strong><small>{bench.length}/{TOUCHLINE_SQUAD_RULES.bench}</small></header>
        <div className={styles.benchSlots}>
          {Array.from({ length: TOUCHLINE_SQUAD_RULES.bench }, (_, index) => {
            const player = bench[index];
            return (
              <div key={player?.id ?? `empty-bench-${index}`} className={player ? styles.filledBenchSlot : ""}>
                {player ? (
                  <div className={styles.rosterCard}>
                    <SquadPlayerCardZoom card={player.card} locale={locale} canEditCardEngine={canEditCardEngine} />
                  </div>
                ) : null}
                <b>{player?.shortName ?? "+"}</b>
                <small>{player?.position ?? (portuguese ? "Vaga" : "Slot")}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.remaining} aria-label={portuguese ? "Elenco restante" : "Remaining squad"}>
        <header>
          <strong>{portuguese ? "Elenco restante" : "Remaining squad"}</strong>
          <small>
            {starters.length === TOUCHLINE_SQUAD_RULES.starters
              ? `${remainingSquad.length}/${TOUCHLINE_SQUAD_RULES.reserveVault}`
              : portuguese
                ? `${remainingSquad.length} · aguardando ${TOUCHLINE_SQUAD_RULES.starters - starters.length}`
                : `${remainingSquad.length} · ${TOUCHLINE_SQUAD_RULES.starters - starters.length} awaiting placement`}
          </small>
        </header>
        <div>{remainingSquad.length ? remainingSquad.map((player) => (
          <div key={player.id}>
            <div className={styles.rosterCard}>
              <SquadPlayerCardZoom card={player.card} locale={locale} canEditCardEngine={canEditCardEngine} />
            </div>
            <b>{player.shortName}</b>
            <small>{player.position}</small>
          </div>
        )) : <p>{portuguese ? "Os próximos contratos aparecerão aqui depois de completar o time titular e o banco." : "New contracts appear here after the Starting XI and bench are complete."}</p>}</div>
      </section>
    </section>
  );
}
