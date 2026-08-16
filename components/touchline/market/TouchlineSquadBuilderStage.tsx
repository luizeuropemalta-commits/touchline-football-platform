"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

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
  card: TouchlineEliteExactPlayer;
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
  coachProfileHref?: string | null;
  starters: TouchlineSquadBuilderStarter[];
  bench: TouchlineSquadBuilderBenchPlayer[];
  remainingSquad: TouchlineSquadBuilderBenchPlayer[];
  contractedCount: number;
  selectedRole: "all" | TouchlineSquadBuilderRole;
  onSelectRole: (role: TouchlineSquadBuilderRole) => void;
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
  coachProfileHref,
  starters,
  bench,
  remainingSquad,
  contractedCount,
  selectedRole,
  onSelectRole,
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
                  <div className={styles.rosterCard} aria-hidden="true">
                    <TouchlineEliteExactCard
                      player={player.card}
                      rankingMode="live"
                      optimizeForLiveCompact
                      enableInteractiveNeon={false}
                      showCardActions={false}
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
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
        <header><strong>{portuguese ? "Elenco restante" : "Remaining squad"}</strong><small>{remainingSquad.length}/{TOUCHLINE_SQUAD_RULES.reserveVault}</small></header>
        <div>{remainingSquad.length ? remainingSquad.map((player) => (
          <div key={player.id}>
            <div className={styles.rosterCard} aria-hidden="true">
              <TouchlineEliteExactCard
                player={player.card}
                rankingMode="live"
                optimizeForLiveCompact
                enableInteractiveNeon={false}
                showCardActions={false}
                showProfileAction={false}
                showSocialMetrics={false}
              />
            </div>
            <b>{player.shortName}</b>
            <small>{player.position}</small>
          </div>
        )) : <p>{portuguese ? "Os próximos contratos aparecerão aqui depois de completar o time titular e o banco." : "New contracts appear here after the Starting XI and bench are complete."}</p>}</div>
      </section>
    </section>
  );
}
