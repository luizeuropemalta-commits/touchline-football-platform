import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";
import { canAccess, featureLabels, type FeatureKey, type PlanKey } from "@/lib/billing/plans";

export function FeatureGate({ planKey, feature, children }: {
  planKey: PlanKey | null;
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  if (canAccess(planKey, feature)) return children;
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-8 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.10),transparent_55%)]"/>
      <div className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><LockKeyhole size={22}/></div>
      <h3 className="relative mt-4 text-lg font-black text-white">{featureLabels[feature]} is a premium feature</h3>
      <p className="relative mx-auto mt-2 max-w-md text-xs leading-6 text-slate-500">Upgrade your squad to unlock this system and keep your football operation moving.</p>
      <Link href={`/upgrade?feature=${feature}`} className="relative mx-auto mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-[.12em] text-[#071007]"><Sparkles size={14}/>View upgrade</Link>
    </div>
  );
}
