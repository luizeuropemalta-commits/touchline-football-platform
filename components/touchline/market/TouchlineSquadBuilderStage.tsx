"use client";

import type { ReactNode } from "react";
import { Check, ChevronRight, ShieldCheck } from "lucide-react";

import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import { TOUCHLINE_SQUAD_RULES, resolveTouchlineSquadJourney } from "@/lib/touchlineArena/squad-rules";

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
  position: string;
};

type FormationSlot = {
  id: string;
  role: TouchlineSquadBuilderRole;
  roleIndex: number;
  x: number;
  y: number;
};

type Props = {
  locale: string;
  formation: string;
  formationConfirmed: boolean;
  formationOptions: readonly string[];
  onSelectFormation: (formation: string) => void;
  coachName?: string | null;
  coachCard?: ReactNode;
  starters: TouchlineSquadBuilderStarter[];
  bench: TouchlineSquadBuilderBenchPlayer[];
  remainingSquad: TouchlineSquadBuilderBenchPlayer[];
  contractedCount: number;
  selectedRole: "all" | TouchlineSquadBuilderRole;
  onSelectRole: (role: TouchlineSquadBuilderRole) => void;
  arenaHref: string;
};

function evenlySpacedY(count: number, index: number) {
  if (count <= 1) return 50;
  return 14 + ((72 / (count - 1)) * index);
}

function formationSlots(formation: string): FormationSlot[] {
  const formationLines = formation
    .split("-")
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
  const defenders = formationLines[0] ?? 4;
  const forwards = formationLines.at(-1) ?? 3;
  const midfielders = formationLines.length > 2
    ? formationLines.slice(1, -1).reduce((total, value) => total + value, 0)
    : 3;
  const lines: Array<{ role: TouchlineSquadBuilderRole; count: number; x: number }> = [
    { role: "goalkeeper", count: 1, x: 9 },
    { role: "defender", count: defenders, x: 34 },
    { role: "midfielder", count: midfielders, x: 61 },
    { role: "forward", count: forwards, x: 88 },
  ];

  return lines.flatMap(({ role, count, x }) => Array.from({ length: count }, (_, roleIndex) => ({
    id: `${role}-${roleIndex}`,
    role,
    roleIndex,
    x,
    y: evenlySpacedY(count, roleIndex),
  })));
}

function roleLabel(role: TouchlineSquadBuilderRole, portuguese: boolean) {
  if (role === "goalkeeper") return portuguese ? "Goleiro" : "Goalkeeper";
  if (role === "defender") return portuguese ? "Defensor" : "Defender";
  if (role === "midfielder") return portuguese ? "Meio-campista" : "Midfielder";
  return portuguese ? "Atacante" : "Forward";
}

export default function TouchlineSquadBuilderStage({
  locale,
  formation,
  formationConfirmed,
  formationOptions,
  onSelectFormation,
  coachName,
  coachCard,
  starters,
  bench,
  remainingSquad,
  contractedCount,
  selectedRole,
  onSelectRole,
  arenaHref,
}: Props) {
  const portuguese = locale === "pt-BR";
  const slots = formationSlots(formation);
  const startersByRole = new Map<TouchlineSquadBuilderRole, TouchlineSquadBuilderStarter[]>();
  for (const role of ["goalkeeper", "defender", "midfielder", "forward"] as const) {
    startersByRole.set(role, starters.filter((player) => player.role === role));
  }
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
    { key: "arena", label: portuguese ? "Entrar na Arena" : "Enter Arena", complete: false },
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
              onClick={() => onSelectFormation(option)}
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
            {slots.map((slot) => {
              const player = startersByRole.get(slot.role)?.[slot.roleIndex];
              return player ? (
                <button
                  key={slot.id}
                  type="button"
                  className={styles.playerSlot}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onClick={() => onSelectRole(slot.role)}
                  disabled={!journey.formationComplete}
                  aria-label={`${player.name} · ${roleLabel(slot.role, portuguese)}`}
                >
                  <span aria-hidden="true">
                    <TouchlineEliteExactCard
                      player={player.card}
                      rankingMode="live"
                      optimizeForLiveCompact
                      enableInteractiveNeon={false}
                      showCardActions={false}
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
                  </span>
                  <strong>{player.shortName}</strong>
                </button>
              ) : (
                <button
                  key={slot.id}
                  type="button"
                  className={`${styles.emptySlot} ${selectedRole === slot.role ? styles.selected : ""}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onClick={() => onSelectRole(slot.role)}
                  disabled={!journey.formationComplete}
                  aria-label={`${portuguese ? "Adicionar" : "Add"} ${roleLabel(slot.role, portuguese)}`}
                  aria-pressed={selectedRole === slot.role}
                >
                  <b>+</b>
                  <span>{roleLabel(slot.role, portuguese)}</span>
                </button>
              );
            })}
          </TouchlinePitchSurface>

          <aside className={styles.technicalArea} aria-label={portuguese ? "Área técnica" : "Technical area"}>
            <span>{portuguese ? "ÁREA TÉCNICA" : "TECHNICAL AREA"}</span>
            <div className={styles.coachCard}>{coachCard ?? <b className={styles.emptyCoach} aria-hidden="true">+</b>}</div>
            <strong>{coachName ?? (portuguese ? "Escolha seu treinador" : "Choose your coach")}</strong>
          </aside>
        </div>

        <aside className={styles.nextAction} aria-live="polite">
          <span>{portuguese ? "PRÓXIMA AÇÃO" : "NEXT ACTION"}</span>
          <h3>
            {!journey.coachComplete
              ? (portuguese ? "Escolha seu treinador" : "Choose your coach")
              : !journey.formationComplete
                ? (portuguese ? "Confirme a formação" : "Confirm formation")
              : !journey.startingXiComplete
                ? (portuguese ? `Complete o time titular · ${starters.length}/11` : `Complete the Starting XI · ${starters.length}/11`)
                : !journey.benchComplete
                  ? (portuguese ? `Complete o banco · ${bench.length}/9` : `Complete the bench · ${bench.length}/9`)
                  : !journey.fullSquadComplete
                    ? (portuguese ? `Complete o elenco · ${contractedCount}/35` : `Complete the squad · ${contractedCount}/35`)
                    : (portuguese ? "Revise e confirme seu clube" : "Review and confirm your club")}
          </h3>
          <p>{journey.formationComplete
            ? (portuguese ? "Selecione uma posição vazia. O Market mostrará somente atletas elegíveis para esse setor." : "Select an empty slot. Market will show only players eligible for that area.")
            : (portuguese ? "Treinador e formação são obrigatórios antes da primeira contratação." : "Coach and formation are required before the first signing.")}</p>
          <div className={styles.summary}>
            <span><small>{portuguese ? "Titulares" : "Starting XI"}</small><strong>{starters.length}/11</strong></span>
            <span><small>{portuguese ? "Banco" : "Bench"}</small><strong>{bench.length}/9</strong></span>
            <span><small>{portuguese ? "Elenco" : "Squad"}</small><strong>{contractedCount}/35</strong></span>
          </div>
          <a className={journey.reviewAvailable ? styles.primaryAction : styles.disabledAction} href={journey.reviewAvailable ? arenaHref : undefined} aria-disabled={!journey.reviewAvailable}>
            <ShieldCheck aria-hidden="true" />
            {portuguese ? "Confirmar clube e entrar na Arena" : "Confirm club and enter Arena"}
            <ChevronRight aria-hidden="true" />
          </a>
        </aside>
      </div>

      <section className={styles.bench} aria-label={portuguese ? "Banco da partida" : "Matchday bench"}>
        <header><span>TOUCHLINE</span><strong>{portuguese ? "Banco da partida" : "Matchday bench"}</strong><small>{bench.length}/{TOUCHLINE_SQUAD_RULES.bench}</small></header>
        <div className={styles.benchSlots}>
          {Array.from({ length: TOUCHLINE_SQUAD_RULES.bench }, (_, index) => {
            const player = bench[index];
            return <span key={player?.id ?? `empty-bench-${index}`} className={player ? styles.filledBenchSlot : ""}><b>{player?.shortName ?? "+"}</b><small>{player?.position ?? (portuguese ? "Vaga" : "Slot")}</small></span>;
          })}
        </div>
      </section>

      <section className={styles.remaining} aria-label={portuguese ? "Elenco restante" : "Remaining squad"}>
        <header><strong>{portuguese ? "Elenco restante" : "Remaining squad"}</strong><small>{remainingSquad.length}/{TOUCHLINE_SQUAD_RULES.reserveVault}</small></header>
        <div>{remainingSquad.length ? remainingSquad.map((player) => <span key={player.id}><b>{player.shortName}</b><small>{player.position}</small></span>) : <p>{portuguese ? "Os próximos contratos aparecerão aqui depois de completar o time titular e o banco." : "New contracts appear here after the Starting XI and bench are complete."}</p>}</div>
      </section>
    </section>
  );
}
