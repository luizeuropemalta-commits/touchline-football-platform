import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";
import { featureLabels, type FeatureKey } from "@/lib/billing/plans";

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const { feature } = await searchParams;
  const title = featureLabels[feature as FeatureKey] || "This premium system";
  return <div className="mx-auto max-w-2xl py-16"><div className="glass rounded-3xl p-8 text-center sm:p-12"><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><LockKeyhole size={28}/></div><p className="mt-6 text-[9px] font-black uppercase tracking-[.2em] text-cyan-300/60">Squad upgrade required</p><h1 className="font-display mt-2 text-4xl text-white">Unlock {title}</h1><p className="mx-auto mt-4 max-w-md text-xs leading-6 text-slate-500">Your current plan does not include this part of the football ecosystem. Upgrade to Pro or the matching premium tier for instant access.</p><Link href="/pricing" className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#a3ff12] px-6 text-[9px] font-black uppercase tracking-[.12em] text-[#071007]"><Sparkles size={14}/>Compare plans</Link></div></div>;
}
