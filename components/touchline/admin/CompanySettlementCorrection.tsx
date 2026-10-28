"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";

export function CompanySettlementCorrection({ settlementId, portuguese, onConfirmed }: { settlementId: string; portuguese: boolean; onConfirmed(): void }) {
  const t = (pt: string, en: string) => portuguese ? pt : en;
  const pending = useRef<{ key: string; id: string } | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const values = new FormData(event.currentTarget), reason = String(values.get("reason") ?? "").trim();
    if (reason.length < 20 || values.get("confirmed") !== "on") return;
    locked.current = true; setBusy(true); setMessage(null);
    const key = JSON.stringify([settlementId, reason]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/company-finance/settlement-correction", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ requestId: pending.current.id, settlementId, reason, confirmed: true }) });
      if (!response.ok) throw new Error("UNCONFIRMED");
      const data = await response.json();
      if (data.record?.id !== pending.current.id || data.record?.settlement_id !== settlementId) throw new Error("UNCONFIRMED");
      onConfirmed();
    } catch { setMessage(t("Correção não confirmada. Confira o histórico antes de tentar novamente; a mesma solicitação não será duplicada.", "Correction not confirmed. Check the history before retrying; the same request will not be duplicated.")); }
    finally { locked.current = false; setBusy(false); }
  }
  return <details className="rounded-xl border border-amber-300/20 p-4">
    <summary className="cursor-pointer py-2 font-semibold text-amber-200">{t("Cancelar registro de baixa incorreto", "Cancel an incorrect settlement record")}</summary>
    <form className="mt-4 grid gap-4" onSubmit={submit}>
      <p className="text-sm text-slate-300">{t("A baixa deixará de reduzir o saldo a pagar. O registro original e o motivo permanecerão no histórico. Isso não estorna nem devolve dinheiro no banco.", "This settlement will stop reducing the outstanding amount. The original entry and reason remain in the history. This does not refund or return money through your bank.")}</p>
      <label className="grid gap-2 text-sm">{t("Motivo da correção", "Correction reason")}<textarea name="reason" required minLength={20} maxLength={2000} disabled={busy} className="min-h-24 rounded-xl border border-white/20 bg-black/40 p-3" /></label>
      <label className="flex items-start gap-3 text-sm"><input name="confirmed" type="checkbox" required disabled={busy} className="mt-1 size-5" />{t("Conferi esta baixa e confirmo que seu registro está incorreto.", "I checked this settlement and confirm that its record is incorrect.")}</label>
      <Button type="submit" disabled={busy}>{busy ? t("Confirmando…", "Confirming…") : t("Confirmar cancelamento do registro", "Confirm record cancellation")}</Button>
      {message ? <p role="status" className="text-sm text-amber-200">{message}</p> : null}
    </form>
  </details>;
}
