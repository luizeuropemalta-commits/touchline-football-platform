"use client";

import { useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";

export function PortalButton({ label = "Manage subscription" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await response.json();
    if (response.ok && data.url) window.location.href = data.url;
    else {
      setError(data.error || "Billing portal unavailable.");
      setLoading(false);
    }
  }

  return <div><button onClick={openPortal} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[.08] px-5 text-[9px] font-black uppercase tracking-[.12em] text-cyan-100 transition hover:bg-cyan-300/[.14] disabled:opacity-50">{loading ? <LoaderCircle size={14} className="animate-spin"/> : <CreditCard size={14}/>} {label}</button>{error && <p className="mt-2 text-[10px] text-rose-300">{error}</p>}</div>;
}
