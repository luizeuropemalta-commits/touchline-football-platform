"use client";

import { useState } from "react";
import { Gift, Plus } from "lucide-react";

function stableKey(prefix: string, parts: string[]) {
  return `${prefix}:${parts.join(":").toLowerCase().replace(/[^a-z0-9:]+/g, "-")}:${new Date().toISOString().slice(0, 10)}`;
}

export function CreatePromotionForm({ locale = "en-GB" }: { locale?: "en-GB" | "pt-BR" }) {
  const pt = locale === "pt-BR";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [message, setMessage] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [busy, setBusy] = useState(false);

  async function createPromotion() {
    setBusy(true);
    setMessage("busy");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_promotion", name, description, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Create failed");
      setMessage("success");
      window.location.reload();
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={pt ? "Nome da promoção" : "Promotion name"} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={pt ? "Descrição" : "Description"} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white">
        <option value="draft">{pt ? "Rascunho" : "Draft"}</option>
        <option value="active">{pt ? "Ativa" : "Active"}</option>
        <option value="paused">{pt ? "Pausada" : "Paused"}</option>
        <option value="ended">{pt ? "Encerrada" : "Ended"}</option>
      </select>
      <button type="button" onClick={createPromotion} disabled={busy || !name.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] disabled:opacity-50">
        <Plus size={14} /> {{ idle: pt ? "Criar" : "Create", busy: pt ? "Criando" : "Creating", success: pt ? "Criada" : "Created", error: pt ? "Falha ao criar" : "Create failed" }[message]}
      </button>
    </div>
  );
}

export function GrantCreditForm({ locale = "en-GB" }: { locale?: "en-GB" | "pt-BR" }) {
  const pt = locale === "pt-BR";
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [message, setMessage] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [busy, setBusy] = useState(false);

  const computedKey = idempotencyKey || stableKey("credit-grant", [userId, amount, reason]);

  async function grantCredit() {
    setBusy(true);
    setMessage("busy");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "grant_credit",
          userId,
          amountCents: Math.round(Number(amount) * 100),
          reason,
          idempotencyKey: computedKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Grant failed");
      setMessage("success");
      window.location.reload();
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={pt ? "ID do usuário ClubOwner" : "Clubowner user ID"} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={pt ? "Valor em TC" : "Amount in TC"} type="number" min="0" step="0.01" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={pt ? "Motivo obrigatório" : "Required reason"} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 py-3 text-xs font-bold text-white" />
      <input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} placeholder={computedKey} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <button type="button" onClick={grantCredit} disabled={busy || !userId.trim() || !reason.trim() || Number(amount) <= 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] disabled:opacity-50">
        <Gift size={14} /> {{ idle: pt ? "Conceder" : "Grant", busy: pt ? "Concedendo" : "Granting", success: pt ? "Concedido" : "Granted", error: pt ? "Falha ao conceder" : "Grant failed" }[message]}
      </button>
    </div>
  );
}

export function PromotionStatusActions({ promotionId, locale = "en-GB" }: { promotionId: string; locale?: "en-GB" | "pt-BR" }) {
  const pt = locale === "pt-BR";
  const [busyStatus, setBusyStatus] = useState<string | null>(null);

  async function updateStatus(status: string) {
    setBusyStatus(status);
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promotionId, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Update failed");
      window.location.reload();
    } finally {
      setBusyStatus(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {["active", "paused", "ended"].map((status) => (
        <button key={status} type="button" onClick={() => void updateStatus(status)} disabled={Boolean(busyStatus)} className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-3 py-2 text-[8px] font-black text-cyan-100 disabled:opacity-50">
          {busyStatus === status ? (pt ? "Salvando" : "Saving") : (pt ? ({ active: "Ativa", paused: "Pausada", ended: "Encerrada" }[status] ?? status) : status)}
        </button>
      ))}
    </div>
  );
}
