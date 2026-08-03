"use client";

import { useState } from "react";
import { Gift, Plus } from "lucide-react";

function stableKey(prefix: string, parts: string[]) {
  return `${prefix}:${parts.join(":").toLowerCase().replace(/[^a-z0-9:]+/g, "-")}:${new Date().toISOString().slice(0, 10)}`;
}

export function CreatePromotionForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [message, setMessage] = useState("Create");
  const [busy, setBusy] = useState(false);

  async function createPromotion() {
    setBusy(true);
    setMessage("Creating");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_promotion", name, description, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Create failed");
      setMessage("Created");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Promotion name" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white">
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="ended">Ended</option>
      </select>
      <button type="button" onClick={createPromotion} disabled={busy || !name.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] disabled:opacity-50">
        <Plus size={14} /> {message}
      </button>
    </div>
  );
}

export function GrantCreditForm() {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [message, setMessage] = useState("Grant");
  const [busy, setBusy] = useState(false);

  const computedKey = idempotencyKey || stableKey("credit-grant", [userId, amount, reason]);

  async function grantCredit() {
    setBusy(true);
    setMessage("Granting");
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
      setMessage("Granted");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Clubowner user ID" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in TC" type="number" min="0" step="0.01" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} placeholder={computedKey} className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white" />
      <button type="button" onClick={grantCredit} disabled={busy || !userId.trim() || !reason.trim() || Number(amount) <= 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] disabled:opacity-50">
        <Gift size={14} /> {message}
      </button>
    </div>
  );
}

export function PromotionStatusActions({ promotionId }: { promotionId: string }) {
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
          {busyStatus === status ? "Saving" : status}
        </button>
      ))}
    </div>
  );
}
