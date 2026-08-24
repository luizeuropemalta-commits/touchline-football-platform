"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Save } from "lucide-react";

import type { TouchlineCardReviewField, TouchlineCardReviewPresentation } from "@/lib/touchlineArena/card-review-state";
import { touchlineCardReviewFieldLabel } from "@/lib/touchlineArena/card-review-state";

export type CardEngineInboxRow = Readonly<{
  playerId: string;
  playerName: string;
  clubName: string;
  provider: { displayName: string | null; shirtNumber: number | null; countryCode3: string | null; position: string | null };
  override: { displayName: string | null; shirtNumber: number | null; countryCode3: string | null; position: string | null };
  effective: { displayName: string | null; shirtNumber: number | null; countryCode3: string | null; position: string | null };
  cardReview: TouchlineCardReviewPresentation;
  positionConflict: {
    providerPosition: string;
    touchlinePosition: string;
    resolution: "TOUCHLINE_AUTHORITY";
  } | null;
}>;

const editableFields = ["displayName", "shirtNumber", "countryCode3", "position"] as const;
type EditableField = typeof editableFields[number];

function fieldLabel(field: EditableField, locale: string) {
  const reviewField: Record<EditableField, TouchlineCardReviewField> = { displayName: "display_name", shirtNumber: "shirt_number", countryCode3: "nationality", position: "position" };
  return touchlineCardReviewFieldLabel(reviewField[field], locale);
}

export function CardEngineInbox({ rows, locale }: { rows: readonly CardEngineInboxRow[]; locale: "en-GB" | "pt-BR" }) {
  const [filter, setFilter] = useState<"all" | "position_conflict" | TouchlineCardReviewField>("all");
  const [openPlayerId, setOpenPlayerId] = useState(rows[0]?.playerId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const visibleRows = useMemo(() => rows.filter((row) => filter === "all"
    || (filter === "position_conflict" ? Boolean(row.positionConflict) : row.cardReview.missingFields.includes(filter))), [rows, filter]);
  const selected = visibleRows.find((row) => row.playerId === openPlayerId) ?? visibleRows[0] ?? null;
  const pt = locale === "pt-BR";
  const counters = Object.fromEntries(([
    "market_value", "shirt_number", "nationality", "position", "display_name", "club_asset",
  ] as TouchlineCardReviewField[]).map((field) => [field, rows.filter((row) => row.cardReview.missingFields.includes(field)).length]));
  const positionConflictCount = rows.filter((row) => row.positionConflict).length;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const fields: Record<string, string | null> = {};
    for (const field of editableFields) {
      const value = String(data.get(field) ?? "").trim();
      fields[field] = value || null;
    }
    setBusy(true); setStatus(pt ? "Salvando override editorial protegido…" : "Saving protected editorial override…");
    try {
      const response = await fetch("/api/admin/manual-card-editorial?action=save-review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: selected.playerId, fields }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Editorial save failed.");
      setStatus(payload.cardReview?.state === "COMPLETE"
        ? (pt ? "Completo. Recarregue: o card voltará a cores automaticamente." : "Complete. Reload: the card returns to colour automatically.")
        : (pt ? `${payload.cardReview?.missingFields?.length ?? 0} campos ainda requerem atenção.` : `${payload.cardReview?.missingFields?.length ?? 0} fields still require attention.`));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Editorial save failed.");
    } finally { setBusy(false); }
  }

  if (!rows.length) return <section className="rounded-3xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.035] p-6 text-sm font-bold text-[#d9ff96]">{pt ? "CARD ENGINE INBOX · nenhum card requer revisão." : "CARD ENGINE INBOX · no cards require review."}</section>;
  return <section className="grid gap-5 rounded-3xl border border-slate-300/20 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.8fr)]">
    <div>
      <p className="text-[10px] font-black tracking-[.18em] text-slate-300">CARD ENGINE INBOX</p>
      <h2 className="mt-1 text-3xl font-black italic text-white">{pt ? "Cards em revisão" : "Cards requiring review"}</h2>
      <div className="mt-4 flex flex-wrap gap-2">{(["all", "position_conflict", ...Object.keys(counters)] as Array<"all" | "position_conflict" | TouchlineCardReviewField>).map((key) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${filter === key ? "border-slate-100 bg-slate-100 text-slate-950" : "border-white/10 bg-white/[.03] text-slate-300"}`}>{key === "all" ? `TOTAL REVIEW REQUIRED: ${rows.length}` : key === "position_conflict" ? `${pt ? "CONFLITO DE POSIÇÃO" : "POSITION CONFLICT"}: ${positionConflictCount}` : `${touchlineCardReviewFieldLabel(key, locale)}: ${counters[key]}`}</button>)}</div>
      <div className="mt-4 grid gap-2">{visibleRows.map((row) => <button key={row.playerId} type="button" onClick={() => setOpenPlayerId(row.playerId)} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left ${selected?.playerId === row.playerId ? "border-slate-200/40 bg-slate-100/10" : "border-white/[.07] bg-black/20"}`}><span><strong className="block text-sm text-white">{row.playerName}</strong><small className="text-[10px] font-bold text-slate-400">{row.clubName} · {row.cardReview.missingFields.length} {pt ? "pendente(s)" : "pending"}</small></span><ChevronRight size={16} className="text-slate-300" /></button>)}</div>
    </div>
    {selected ? <form onSubmit={save} className="rounded-2xl border border-white/[.08] bg-black/25 p-4">
      <p className="text-[10px] font-black tracking-[.16em] text-slate-400">REVIEW REQUIRED</p><h3 className="mt-1 text-xl font-black text-white">{selected.playerName}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{selected.clubName}</p>
      <div className="mt-4 rounded-xl border border-slate-300/15 bg-slate-300/[.05] p-3"><p className="text-[10px] font-black text-slate-300">{pt ? "FALTANDO" : "MISSING"}</p><ul className="mt-2 space-y-1 text-xs font-bold text-slate-200">{selected.cardReview.missingFields.map((field) => <li key={field}>• {touchlineCardReviewFieldLabel(field, locale)}</li>)}</ul></div>
      {selected.positionConflict ? <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/[.07] p-3"><p className="text-[10px] font-black text-amber-200">{pt ? "CONFLITO DA FONTE" : "SOURCE CONFLICT"}</p><p className="mt-2 text-xs font-bold text-amber-50">{pt ? "Fonte oficial" : "Official source"}: {selected.positionConflict.providerPosition}</p><p className="mt-1 text-xs font-bold text-[#d9ff96]">TouchLine: {selected.positionConflict.touchlinePosition}</p><p className="mt-2 text-[10px] font-bold text-amber-100/70">{pt ? "O override TouchLine aprovado continua sendo a autoridade final até revisão do proprietário." : "The approved TouchLine override remains final authority until owner review."}</p></div> : null}
      <div className="mt-4 grid gap-3">{editableFields.map((field) => <label key={field} className="grid gap-1 text-[10px] font-black text-slate-300">{fieldLabel(field, locale)}<span className="grid grid-cols-3 gap-2 text-[9px] font-bold"><span className="text-slate-500">{pt ? "Provider" : "Provider"}<b className="mt-1 block truncate text-slate-200">{String(selected.provider[field] ?? "—")}</b></span><span className="text-slate-500">{pt ? "Override" : "Override"}<b className="mt-1 block truncate text-cyan-100">{String(selected.override[field] ?? "—")}</b></span><span className="text-slate-500">{pt ? "Efetivo" : "Effective"}<b className="mt-1 block truncate text-[#d9ff96]">{String(selected.effective[field] ?? "—")}</b></span></span><input name={field} defaultValue={selected.override[field] ?? ""} inputMode={field === "shirtNumber" ? "numeric" : undefined} maxLength={field === "countryCode3" ? 3 : undefined} className="h-10 rounded-xl border border-white/[.1] bg-black/35 px-3 text-xs font-bold text-white outline-none" /></label>)}</div>
      <p className="mt-3 text-[10px] font-bold text-slate-500">{pt ? "Valor de mercado e publicação seguem a regra canônica já existente; não há tier ou preço manual neste formulário." : "Market value and publication stay on the existing canonical rule; this form has no manual tier or price."}</p>
      <button type="submit" disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-4 text-[10px] font-black text-slate-950 disabled:opacity-50"><Save size={14} />{busy ? (pt ? "SALVANDO" : "SAVING") : (pt ? "SALVAR E REVALIDAR" : "SAVE & REVALIDATE")}</button><p aria-live="polite" className="mt-3 text-[10px] font-bold text-slate-400">{status}</p>
    </form> : null}
  </section>;
}
