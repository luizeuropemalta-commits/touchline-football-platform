"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TouchlineSocialDeliveryControlActions({
  scopeKey,
  killSwitchEngaged,
  dailyQuota,
  minimumGapSeconds,
}: {
  scopeKey: string;
  killSwitchEngaged: boolean;
  dailyQuota: number | null;
  minimumGapSeconds: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function setKillSwitch(nextEngaged: boolean) {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/social-publications/template-policy", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-delivery-control",
          scopeKey,
          killSwitchEngaged: nextEngaged,
          dailyQuota,
          minimumGapSeconds,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "O controle não pôde ser atualizado.");
      setMessage(nextEngaged ? "Kill switch acionado." : "Kill switch liberado; outbound continua desativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O controle não pôde ser atualizado.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mt-3">
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => void setKillSwitch(!killSwitchEngaged)}
      className={killSwitchEngaged
        ? "rounded-xl border border-emerald-300/25 bg-emerald-300/[.08] px-3 py-2 text-[10px] font-black text-emerald-100 disabled:opacity-45"
        : "rounded-xl border border-red-300/25 bg-red-300/[.08] px-3 py-2 text-[10px] font-black text-red-100 disabled:opacity-45"}
    >
      {killSwitchEngaged ? "Liberar política interna" : "Pausar imediatamente"}
    </button>
    <p className="mt-2 min-h-4 text-[10px] font-bold text-slate-400" role="status" aria-live="polite">{message}</p>
  </div>;
}
