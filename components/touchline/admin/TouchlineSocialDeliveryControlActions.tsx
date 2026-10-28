"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { socialAdminLanguage, socialAdminError } from "@/lib/touchlineArena/social-admin-language";

export default function TouchlineSocialDeliveryControlActions({
  locale: localeInput,
  scopeKey,
  killSwitchEngaged,
  dailyQuota,
  minimumGapSeconds,
}: {
  locale?: string;
  scopeKey: string;
  killSwitchEngaged: boolean;
  dailyQuota: number | null;
  minimumGapSeconds: number | null;
}) {
  const { locale, t } = socialAdminLanguage(localeInput);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
      if (!response.ok || !payload.ok) throw new Error(payload.error || t("O controle não pôde ser atualizado."));
      setMessage({ kind: "success", text: nextEngaged ? "Kill switch acionado." : "Kill switch liberado; outbound continua desativado." });
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: socialAdminError(error, "en-GB", "O controle não pôde ser atualizado.") });
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
      {killSwitchEngaged ? t("Liberar política interna") : t("Pausar imediatamente")}
    </button>
    <p className="mt-2 min-h-4 text-[10px] font-bold text-slate-400" role="status" aria-live="polite">{message ? message.kind === "success" ? t(message.text) : socialAdminError(message.text, locale, "O controle não pôde ser atualizado.") : null}</p>
  </div>;
}
