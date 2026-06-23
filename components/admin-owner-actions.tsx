"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crown, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

type ActionState = "idle" | "grant_elite" | "grant_pro" | "revoke";

export function AdminOwnerActions({ userId, ownerGrantActive }: { userId: string; ownerGrantActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function run(action: ActionState) {
    if (action === "idle") return;
    setLoading(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          action: action === "revoke" ? "revoke" : "grant",
          planKey: action === "grant_pro" ? "pro_agent" : "elite_agency",
          interval: "year",
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Admin action failed.");
      setMessage(action === "revoke" ? "Manual access revoked." : "Access granted.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete admin action.");
    } finally {
      setLoading("idle");
    }
  }

  const disabled = loading !== "idle";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => run("grant_elite")}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-[.12em] text-[#caff6d] transition hover:bg-[#a3ff12]/15 disabled:opacity-50"
      >
        {loading === "grant_elite" ? <LoaderCircle size={13} className="animate-spin" /> : <Crown size={13} />}
        Grant Elite
      </button>
      <button
        type="button"
        onClick={() => run("grant_pro")}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[.08] px-3 text-[8px] font-black uppercase tracking-[.12em] text-cyan-100 transition hover:bg-cyan-300/[.14] disabled:opacity-50"
      >
        {loading === "grant_pro" ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
        Grant Pro
      </button>
      {ownerGrantActive && (
        <button
          type="button"
          onClick={() => run("revoke")}
          disabled={disabled}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/[.08] px-3 text-[8px] font-black uppercase tracking-[.12em] text-rose-100 transition hover:bg-rose-300/[.14] disabled:opacity-50"
        >
          {loading === "revoke" ? <LoaderCircle size={13} className="animate-spin" /> : <XCircle size={13} />}
          Revoke
        </button>
      )}
      {message && <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{message}</span>}
    </div>
  );
}

