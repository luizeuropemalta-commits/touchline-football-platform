"use client";

import { useState } from "react";
import { RefreshCw, Save } from "lucide-react";

const CARD_STATUSES = ["pending", "ready", "published", "reserved", "sold", "retired"];
const SALE_STATUSES = ["not_listed", "available", "reserved", "sold"];
const ART_STATUSES = ["missing", "pending", "ready", "review"];
const label = (value: string, pt: boolean) => pt ? ({ pending: "Pendente", ready: "Pronto", published: "Publicado", reserved: "Reservado", sold: "Vendido", retired: "Retirado", not_listed: "Não listado", available: "Disponível", missing: "Ausente", review: "Revisão" }[value] ?? value) : value;

export function SyncCardInventoryButton({ locale = "en-GB" }: { locale?: "en-GB" | "pt-BR" }) {
  const pt = locale === "pt-BR";
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [busy, setBusy] = useState(false);

  async function syncCards() {
    setBusy(true);
    setStatus("busy");
    try {
      const response = await fetch("/api/admin/cards", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sync failed");
      setStatus("success");
      window.location.reload();
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={syncCards} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] disabled:opacity-50">
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      {{ idle: pt ? "Sincronizar rascunhos" : "Sync drafts", busy: pt ? "Sincronizando" : "Syncing", success: pt ? "Sincronizado" : "Synced", error: pt ? "Falha ao sincronizar" : "Sync failed" }[status]}
    </button>
  );
}

export function CardInventoryQuickEdit({
  cardId,
  cardStatus,
  saleStatus,
  artStatus,
  frameColor,
  locale = "en-GB",
}: {
  cardId: string;
  cardStatus: string;
  saleStatus: string;
  artStatus: string;
  frameColor: string;
  locale?: "en-GB" | "pt-BR";
}) {
  const pt = locale === "pt-BR";
  const [draft, setDraft] = useState({ cardStatus, saleStatus, artStatus, frameColor });
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus("busy");
    try {
      const response = await fetch("/api/admin/cards", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, ...draft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      setStatus("success");
      window.location.reload();
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <select value={draft.cardStatus} onChange={(event) => setDraft((current) => ({ ...current, cardStatus: event.target.value }))} className="h-9 rounded-xl border border-white/[.08] bg-black/30 px-2 text-[9px] font-bold  text-white">
        {CARD_STATUSES.map((value) => <option key={value} value={value}>{label(value, pt)}</option>)}
      </select>
      <select value={draft.saleStatus} onChange={(event) => setDraft((current) => ({ ...current, saleStatus: event.target.value }))} className="h-9 rounded-xl border border-white/[.08] bg-black/30 px-2 text-[9px] font-bold  text-white">
        {SALE_STATUSES.map((value) => <option key={value} value={value}>{label(value, pt)}</option>)}
      </select>
      <select value={draft.artStatus} onChange={(event) => setDraft((current) => ({ ...current, artStatus: event.target.value }))} className="h-9 rounded-xl border border-white/[.08] bg-black/30 px-2 text-[9px] font-bold  text-white">
        {ART_STATUSES.map((value) => <option key={value} value={value}>{label(value, pt)}</option>)}
      </select>
      <input value={draft.frameColor} onChange={(event) => setDraft((current) => ({ ...current, frameColor: event.target.value }))} className="h-9 rounded-xl border border-white/[.08] bg-black/30 px-2 text-[9px] font-bold  text-white" />
      <button type="button" onClick={save} disabled={busy} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black  text-[#caff6d] disabled:opacity-50">
        <Save size={12} />
        {{ idle: pt ? "Salvar" : "Save", busy: pt ? "Salvando" : "Saving", success: pt ? "Salvo" : "Saved", error: pt ? "Falha ao salvar" : "Save failed" }[status]}
      </button>
    </div>
  );
}
