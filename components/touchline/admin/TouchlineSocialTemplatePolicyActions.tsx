"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "approve-template-artwork" | "approve-template-caption"
  | "enable-auto-publish" | "pause-template" | "revoke-template";

export default function TouchlineSocialTemplatePolicyActions({
  templateId,
  templateIdentityChecksum,
  visualTemplateChecksum,
  baseCopyChecksum,
  state,
  artworkApproved,
  captionApproved,
}: {
  templateId: string;
  templateIdentityChecksum: string;
  visualTemplateChecksum: string;
  baseCopyChecksum: string;
  state: string;
  artworkApproved: boolean;
  captionApproved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: Action) {
    if (pending) return;
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/social-publications/template-policy", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          templateId,
          expectedIdentityChecksum: templateIdentityChecksum,
          expectedContentChecksum: action === "approve-template-artwork"
            ? visualTemplateChecksum : action === "approve-template-caption" ? baseCopyChecksum : undefined,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A alteração não pôde ser registrada.");
      setMessage("Política da versão atualizada com sucesso.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A alteração não pôde ser registrada.");
    } finally {
      setPending(null);
    }
  }

  const fullyApproved = artworkApproved && captionApproved;
  const revoked = state === "REVOKED";
  return <div className="grid gap-2 sm:grid-cols-2">
    <button type="button" disabled={artworkApproved || revoked || pending !== null}
      aria-busy={pending === "approve-template-artwork"}
      onClick={() => void act("approve-template-artwork")}
      className="rounded-xl border border-cyan-300/25 bg-cyan-300/[.08] px-3 py-2 text-[10px] font-black text-cyan-100 disabled:opacity-45">
      {artworkApproved ? "Template visual aprovado" : "Aprovar template visual"}
    </button>
    <button type="button" disabled={captionApproved || revoked || pending !== null}
      aria-busy={pending === "approve-template-caption"}
      onClick={() => void act("approve-template-caption")}
      className="rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-2 text-[10px] font-black text-[#caff6d] disabled:opacity-45">
      {captionApproved ? "Template de copy aprovado" : "Aprovar template de copy"}
    </button>
    <button type="button" disabled={!fullyApproved || state === "AUTO_PUBLISH_ENABLED" || revoked || pending !== null}
      aria-busy={pending === "enable-auto-publish"}
      onClick={() => void act("enable-auto-publish")}
      className="rounded-xl border border-emerald-300/25 bg-emerald-300/[.08] px-3 py-2 text-[10px] font-black text-emerald-100 disabled:opacity-45">
      {state === "AUTO_PUBLISH_ENABLED" ? "Elegibilidade automática ativa" : "Ativar elegibilidade automática"}
    </button>
    <button type="button" disabled={!fullyApproved || state === "PAUSED" || revoked || pending !== null}
      aria-busy={pending === "pause-template"}
      onClick={() => void act("pause-template")}
      className="rounded-xl border border-amber-300/25 bg-amber-300/[.08] px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-45">
      {state === "PAUSED" ? "Template pausado" : "Pausar imediatamente"}
    </button>
    <button type="button" disabled={revoked || pending !== null}
      aria-busy={pending === "revoke-template"}
      onClick={() => void act("revoke-template")}
      className="rounded-xl border border-red-300/25 bg-red-300/[.08] px-3 py-2 text-[10px] font-black text-red-100 disabled:opacity-45 sm:col-span-2">
      {revoked ? "Versão revogada" : "Revogar esta versão"}
    </button>
    <p className="min-h-4 text-[10px] font-bold text-slate-400 sm:col-span-2" role="status" aria-live="polite">{message}</p>
  </div>;
}
