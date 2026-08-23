"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Save, ShieldCheck } from "lucide-react";

import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import {
  TOUCHLINE_CALIBRATED_FORMATION_CODES,
  resolveTouchlineFormationGeometry,
  touchlineFormationGeometryPayload,
  validateTouchlineFormationGeometry,
  type TouchlineFormationGeometry,
  type TouchlineFormationGeometryRegistry,
  type TouchlineFormationGeometrySlot,
  type TouchlineCalibratedFormationCode,
} from "@/lib/touchlineArena/formation-geometry";
import type { TouchlineFormationGeometryVersionRecord } from "@/lib/touchlineArena/formation-geometry-server";

import styles from "./FormationCalibrationStudio.module.css";

type Props = Readonly<{
  locale: string;
  registry: TouchlineFormationGeometryRegistry;
  history: readonly TouchlineFormationGeometryVersionRecord[];
}>;

function editableGeometry(source: TouchlineFormationGeometry) {
  return {
    ...source,
    slots: source.slots.map((slot) => ({ ...slot, allowedPositions: [...slot.allowedPositions] })),
  } as TouchlineFormationGeometry;
}

function statusCopy(locale: string, english: string, portuguese: string) {
  return locale === "pt-BR" ? portuguese : english;
}

export default function FormationCalibrationStudio({ locale, registry, history }: Props) {
  const router = useRouter();
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const [formationCode, setFormationCode] = useState<TouchlineCalibratedFormationCode>(TOUCHLINE_CALIBRATED_FORMATION_CODES[0]);
  const published = resolveTouchlineFormationGeometry(formationCode, registry);
  const [draft, setDraft] = useState(() => editableGeometry(published));
  const [selectedSlotId, setSelectedSlotId] = useState(draft.slots[0]?.id ?? "GK");
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"draft" | "preview">("draft");
  const [reason, setReason] = useState("QA visual calibration");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(statusCopy(locale, "Draft ready. Nothing is auto-saved.", "Rascunho pronto. Nada é salvo automaticamente."));
  const validation = useMemo(() => validateTouchlineFormationGeometry(draft), [draft]);
  const selectedSlot = draft.slots.find((slot) => slot.id === selectedSlotId) ?? draft.slots[0]!;
  const formationHistory = history.filter((entry) => entry.formationCode === formationCode);

  function selectFormation(nextCode: TouchlineCalibratedFormationCode) {
    const next = editableGeometry(resolveTouchlineFormationGeometry(nextCode, registry));
    setFormationCode(nextCode);
    setDraft(next);
    setSelectedSlotId(next.slots[0]?.id ?? "GK");
    setPhase("draft");
    setMessage(statusCopy(locale, "Current published geometry loaded.", "Geometria publicada atual carregada."));
  }

  function updateSlot(slotId: string, change: Partial<Pick<TouchlineFormationGeometrySlot, "x" | "y">>) {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.id === slotId ? { ...slot, ...change } : slot),
    }));
    setPhase("draft");
  }

  function moveFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!draggingSlotId || !pitchRef.current) return;
    const bounds = pitchRef.current.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, Math.round((((event.clientX - bounds.left) / bounds.width) * 100) * 10) / 10));
    const y = Math.min(96, Math.max(4, Math.round((((event.clientY - bounds.top) / bounds.height) * 100) * 10) / 10));
    updateSlot(draggingSlotId, { x, y });
  }

  async function command(body: Record<string, unknown>) {
    setBusy(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/admin/formation-geometries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; result?: { geometryVersion?: number } } | null;
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || "Formation command rejected.");
      setMessage(statusCopy(locale, `Published version ${payload.result?.geometryVersion ?? "new"}.`, `Versão ${payload.result?.geometryVersion ?? "nova"} publicada.`));
      setPhase("draft");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? statusCopy(locale, "Request timed out. Refresh version history before retrying.", "A solicitação expirou. Atualize o histórico antes de tentar novamente.")
        : error instanceof Error ? error.message : "Formation command failed.");
    } finally {
      window.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>TOUCHLINE · QA ONLY</span>
          <h1>{statusCopy(locale, "Formation Calibration", "Calibração de Formações")}</h1>
          <p>{statusCopy(locale, "One reusable 2D geometry per formation. Arena camera layouts remain independent and untouched.", "Uma geometria 2D reutilizável por formação. Os layouts de câmera da Arena permanecem independentes e intocados.")}</p>
        </div>
        <div className={styles.guard}><ShieldCheck aria-hidden="true" /><strong>ADMIN QA</strong><small>Draft → Preview → Save & Validate</small></div>
      </header>

      <section className={styles.toolbar} aria-label={statusCopy(locale, "Calibration controls", "Controles de calibração")}>
        <label><span>{statusCopy(locale, "Formation", "Formação")}</span><select value={formationCode} onChange={(event) => selectFormation(event.target.value as TouchlineCalibratedFormationCode)}>{TOUCHLINE_CALIBRATED_FORMATION_CODES.map((code) => <option key={code}>{code}</option>)}</select></label>
        <div><span>{statusCopy(locale, "Published", "Publicada")}</span><strong>v{published.geometryVersion || "code"}</strong></div>
        <div><span>{statusCopy(locale, "Phase", "Fase")}</span><strong>{phase.toUpperCase()}</strong></div>
        <div><span>{statusCopy(locale, "Validation", "Validação")}</span><strong className={validation.publishable ? styles.valid : styles.invalid}>{validation.publishable ? "PASS" : `${validation.issues.length} ISSUE(S)`}</strong></div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.preview} aria-labelledby="formation-preview-title">
          <header><div><span>ARSENAL · VISUAL REFERENCE</span><h2 id="formation-preview-title">{formationCode}</h2></div><Image src="/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png" alt="Arsenal" width={64} height={64} /></header>
          <div
            ref={pitchRef}
            className={styles.pitchShell}
            onPointerMove={moveFromPointer}
            onPointerUp={() => setDraggingSlotId(null)}
            onPointerCancel={() => setDraggingSlotId(null)}
          >
            <TouchlinePitchSurface className={styles.pitch} ariaLabel={`${formationCode} calibration preview`}>
              {draft.slots.map((slot) => <button
                key={slot.id}
                type="button"
                className={`${styles.slot} ${selectedSlotId === slot.id ? styles.selected : ""}`}
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDraggingSlotId(slot.id); setSelectedSlotId(slot.id); }}
                onClick={() => setSelectedSlotId(slot.id)}
                aria-label={`${slot.id} X ${slot.x} Y ${slot.y}`}
              ><b>{slot.id}</b><small>{slot.x}, {slot.y}</small></button>)}
            </TouchlinePitchSurface>
          </div>
        </section>

        <aside className={styles.inspector}>
          <header><span>{statusCopy(locale, "Selected tactical slot", "Slot tático selecionado")}</span><strong>{selectedSlot.id}</strong><small>{selectedSlot.line} · {selectedSlot.role}</small></header>
          <div className={styles.coordinates}>
            <label><span>X</span><input type="number" min="2" max="98" step="0.1" value={selectedSlot.x} onChange={(event) => updateSlot(selectedSlot.id, { x: Number(event.target.value) })} /></label>
            <label><span>Y</span><input type="number" min="4" max="96" step="0.1" value={selectedSlot.y} onChange={(event) => updateSlot(selectedSlot.id, { y: Number(event.target.value) })} /></label>
          </div>
          <dl><div><dt>Side</dt><dd>{selectedSlot.side}</dd></div><div><dt>Priority</dt><dd>{selectedSlot.priority}</dd></div><div><dt>Allowed</dt><dd>{selectedSlot.allowedPositions.join(", ")}</dd></div></dl>
          <button type="button" className={styles.reset} onClick={() => { setDraft(editableGeometry(published)); setPhase("draft"); setMessage(statusCopy(locale, "Reset to current published geometry.", "Restaurado para a geometria publicada atual.")); }}><RotateCcw aria-hidden="true" />{statusCopy(locale, "Reset to current published", "Restaurar publicada atual")}</button>
        </aside>
      </div>

      <section className={styles.validation} aria-live="polite">
        <header><CheckCircle2 aria-hidden="true" /><div><strong>{validation.publishable ? statusCopy(locale, "Geometry is publishable", "Geometria pronta para publicar") : statusCopy(locale, "Publication blocked", "Publicação bloqueada")}</strong><span>{validation.checkedViewports.join(" · ")}</span></div></header>
        {validation.issues.length ? <ul>{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.viewport ? `${issue.viewport} · ` : ""}{issue.message}</li>)}</ul> : <p>{statusCopy(locale, "11 slots, boundaries, role capacities and card/label collisions passed.", "11 slots, limites, capacidades e colisões de card/label aprovados.")}</p>}
      </section>

      <section className={styles.actions}>
        <label><span>{statusCopy(locale, "Audit reason", "Motivo de auditoria")}</span><input value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} /></label>
        <button type="button" onClick={() => { setPhase("preview"); setMessage(statusCopy(locale, "Preview locked. Review validation, then save.", "Preview travado. Revise a validação e salve.")); }} disabled={!validation.publishable || busy}>{statusCopy(locale, "Preview", "Preview")}</button>
        <button type="button" className={styles.save} onClick={() => void command({ action: "publish", formationCode, geometry: touchlineFormationGeometryPayload(draft), reason })} disabled={phase !== "preview" || !validation.publishable || !reason.trim() || busy}><Save aria-hidden="true" />{busy ? statusCopy(locale, "Saving…", "Salvando…") : statusCopy(locale, "Save & Validate", "Salvar e validar")}</button>
        <output>{message}</output>
      </section>

      <section className={styles.history}>
        <header><span>VERSION HISTORY</span><h2>{formationCode}</h2></header>
        <div>{formationHistory.length ? formationHistory.map((entry) => <article key={entry.id}><div><strong>v{entry.geometryVersion}</strong><span>{entry.status}</span>{entry.rollbackOfVersion ? <small>rollback of v{entry.rollbackOfVersion}</small> : null}</div><p>{entry.changeReason}</p><time>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.publishedAt))}</time><button type="button" disabled={entry.status === "published" || busy} onClick={() => void command({ action: "rollback", formationCode, targetVersion: entry.geometryVersion, reason: `Rollback to v${entry.geometryVersion}: ${reason}` })}>{statusCopy(locale, "Rollback as new version", "Rollback como nova versão")}</button></article>) : <p>{statusCopy(locale, "Code default is active; the first validated save creates version 1.", "O padrão do código está ativo; o primeiro save validado cria a versão 1.")}</p>}</div>
      </section>
    </main>
  );
}
