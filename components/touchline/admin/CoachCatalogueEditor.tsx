"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { parseCoachEditorial, type CoachEditorialCandidate, type CoachEditorialState } from "@/lib/touchlineArena/coach-catalogue-contract";

export function CoachCatalogueEditor({ initial, portuguese }: { initial: CoachEditorialState; portuguese: boolean }) {
  const [state, setState] = useState(initial), [selected, setSelected] = useState<{ action: string; candidate: CoachEditorialCandidate | null; catalogueRevision: number } | null>(null);
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"confirmed" | "unconfirmed" | "read-failed" | null>(null), [needsRead, setNeedsRead] = useState(false);
  const lock = useRef(false), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const key = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const t = (pt: string, en: string) => portuguese ? pt : en;
  const status = { pending: t("Pendente", "Pending"), approved: t("Aprovado para publicação", "Approved for publication"), ignored: t("Ignorado", "Ignored"), published: t("Publicado", "Published") };
  const actionLabel = (action: string) => ({ bootstrap: t("Importar os 20 registros legados", "Import the 20 legacy entries"), approve: t("Aprovar revisão", "Approve review"), ignore: t("Ignorar candidato", "Ignore candidate"), reopen: t("Reabrir revisão", "Reopen review"), publish: t("Publicar associação atual", "Publish current appointment") }[action] ?? action);
  async function refresh(signal: AbortSignal) {
    const response = await fetch("/api/admin/coaches", { credentials: "same-origin", cache: "no-store", signal });
    const body: unknown = await response.json();
    const next = response.ok && body && typeof body === "object" && "state" in body ? parseCoachEditorial(body.state) : null;
    if (!next) throw new Error("READ_FAILED");
    if (mounted.current) { setState(next); setNeedsRead(false); }
  }
  async function run(readOnly = false) {
    if (lock.current || !readOnly && (!selected || reason.trim().length < 20 || !confirmed || needsRead)) return;
    lock.current = true; setBusy(true); setMessage(null);
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 15_000);
    try {
      if (readOnly) { await refresh(abort.signal); return; }
      const input = { action: selected!.action, catalogueRevision: selected!.catalogueRevision, candidateId: selected!.candidate?.id ?? null, revision: selected!.candidate?.revision ?? null, reason: reason.trim(), confirmed: true };
      const bodyKey = JSON.stringify(input); if (key.current?.body !== bodyKey) key.current = { body: bodyKey, id: crypto.randomUUID() };
      const requestId = key.current.id;
      const response = await fetch("/api/admin/coaches", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ ...input, requestId }) });
      const result = await response.json();
      if (!response.ok || result.receipt?.requestId !== requestId || result.receipt?.action !== input.action) throw new Error("UNCONFIRMED");
      if (mounted.current) { setSelected(null); setReason(""); setConfirmed(false); setMessage("confirmed"); setNeedsRead(true); }
      await refresh(abort.signal);
    } catch { if (mounted.current) { setNeedsRead(true); setMessage(readOnly ? "read-failed" : "unconfirmed"); } }
    finally { clearTimeout(timer); if (mounted.current) setBusy(false); lock.current = false; }
  }
  function choose(action: string, candidate: CoachEditorialCandidate | null) { setSelected({ action, candidate, catalogueRevision: state.revision }); setReason(""); setConfirmed(false); setMessage(null); }
  return <section className="grid min-w-0 gap-5 text-sm text-slate-200" aria-label={t("Catálogo de técnicos", "Coach catalogue")}>
    <p>{t("Associações atuais publicadas", "Published current appointments")}: <strong>{state.currentCount}/20</strong> · {t("Leitura pública", "Public reads")}: {state.publicEnabled ? t("Ativa no banco", "Enabled in database") : t("Desligada no banco", "Disabled in database")}</p>
    <p>{t("A observação identifica quem participou de um jogo. Confira a nomeação atual na fonte oficial antes de aprovar e publicar. Publicar substitui somente a associação atual; contratos, pontos e preços anteriores permanecem preservados.", "An observation identifies who coached a fixture. Check the current appointment against the official source before approving and publishing. Publication replaces only the current appointment; historical contracts, points and prices are preserved.")}</p>
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void run(true)}>{busy ? t("Aguarde…", "Please wait…") : t("Atualizar revisão", "Refresh review")}</Button>
      {state.currentCount === 0 && !state.publicEnabled ? <Button disabled={busy || needsRead} onClick={() => choose("bootstrap", null)}>{actionLabel("bootstrap")}</Button> : null}</div>
    {message ? <p role="status" className="rounded-xl border border-white/20 p-4">{message === "confirmed" ? t("Decisão confirmada e registrada no histórico.", "Decision confirmed and recorded in history.") : message === "read-failed" ? t("Não foi possível atualizar. Novas decisões permanecem bloqueadas.", "Refresh failed. New decisions remain blocked.") : t("Resultado não confirmado. Atualize a revisão antes de outra decisão; nenhuma gravação será repetida automaticamente.", "Result not confirmed. Refresh the review before another decision; no write will be retried automatically.")}</p> : null}
    {selected ? <form className="grid min-w-0 gap-4 rounded-2xl border border-amber-300/40 bg-black/30 p-5" onSubmit={event => { event.preventDefault(); void run(); }}>
      <h2 className="text-lg font-semibold">{actionLabel(selected.action)}{selected.candidate ? ` · ${selected.candidate.name ?? selected.candidate.providerId}` : ""}</h2>
      {selected.action === "bootstrap" ? <p>{t("Importação explícita do catálogo local de 27/07/2026, com seus IDs e classificações existentes. Não é uma consulta nova ao Sportmonks e não ativa a leitura pública.", "Explicit import of the local 27 July 2026 catalogue, including its existing IDs and classifications. This is not a new Sportmonks request and does not activate public reads.")}</p> : null}
      <label className="grid gap-2">{t("Evidência e motivo da decisão (mínimo 20 caracteres)", "Decision evidence and reason (at least 20 characters)")}<textarea name="reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={20} maxLength={1000} disabled={busy} className="min-h-28 w-full min-w-0 rounded-xl border border-white/20 bg-black/50 p-3" /></label>
      <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required className="mt-1 size-5 shrink-0" />{t("Conferi os IDs, a origem e a associação atual e confirmo esta decisão.", "I checked the IDs, source and current appointment and confirm this decision.")}</label>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || needsRead || !confirmed || reason.trim().length < 20}>{actionLabel(selected.action)}</Button><Button type="button" disabled={busy} onClick={() => setSelected(null)}>{t("Cancelar", "Cancel")}</Button></div>
    </form> : null}
    {state.candidates.length === 0 ? <p className="rounded-xl border border-white/10 p-5">{t("Nenhuma mudança de técnico aguardando revisão.", "No coach changes awaiting review.")}</p> : <ul className="grid min-w-0 gap-4" aria-label={t("Candidatos", "Candidates")}>{state.candidates.map(candidate => <li key={candidate.id} className="grid min-w-0 gap-3 rounded-2xl border border-white/15 bg-black/20 p-5">
      <div><h2 className="break-words text-lg font-semibold text-white">{candidate.name ?? t("Nome oficial ausente", "Official name unavailable")} · {candidate.clubName}</h2><p>{status[candidate.status]}</p></div>
      <p className="break-words">Sportmonks ID {candidate.providerId} · {t("Clube", "Club")} {candidate.teamId} · {t("Atual", "Current")}: {candidate.currentName ?? "—"} ({candidate.currentProviderId ?? "—"})</p>
      <p className="break-words">{t("Origem", "Source")}: {candidate.sourceKind} · {t("Jogo", "Fixture")} {candidate.sourceId} · {candidate.fixtureAt ?? candidate.observedAt}</p>
      <details><summary className="cursor-pointer py-2">{t("Proveniência da observação", "Observation provenance")}</summary><p className="break-all py-3">SHA-256 {candidate.sourceHash}</p><p>{t("Recebido em", "Observed at")}: {candidate.observedAt}</p></details>
      <div className="flex flex-wrap gap-3">{(candidate.status === "pending" ? ["approve", "ignore"] : candidate.status === "approved" ? ["publish", "ignore"] : ["reopen"]).map(action => <Button key={action} disabled={busy || needsRead || action === "approve" && !candidate.name} onClick={() => choose(action, candidate)}>{actionLabel(action)}</Button>)}</div>
    </li>)}</ul>}
  </section>;
}
