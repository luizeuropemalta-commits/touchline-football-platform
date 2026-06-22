"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { BillingInterval, PlanKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export function CheckoutButton({ planKey, interval, featured = false, label = "Choose plan" }: {
  planKey: PlanKey;
  interval: BillingInterval;
  featured?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey, interval }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/pricing?plan=${planKey}`)}`;
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout could not be started.");
      window.location.href = data.url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not be started.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={checkout} disabled={loading} className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-[10px] font-black uppercase tracking-[.14em] transition duration-300 disabled:opacity-60",
        featured
          ? "border-[#a3ff12]/50 bg-[#a3ff12] text-[#071007] shadow-[0_0_30px_rgba(163,255,18,.16)] hover:-translate-y-0.5 hover:bg-[#bcff52]"
          : "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/[.12]",
      )}>
        {loading ? <LoaderCircle size={15} className="animate-spin"/> : <>{label}<ArrowRight size={14}/></>}
      </button>
      {error && <p className="mt-2 text-center text-[10px] text-rose-300">{error}</p>}
    </div>
  );
}
