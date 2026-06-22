import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import { getCurrentSubscription } from "@/lib/billing/subscription";
import { planMap } from "@/lib/billing/plans";

export default async function SubscriptionPage() {
  const subscription = await getCurrentSubscription();
  const plan = subscription.planKey ? planMap[subscription.planKey] : null;
  return <div className="mx-auto max-w-2xl py-16"><div className="glass premium-ring rounded-3xl p-8 text-center sm:p-12"><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><CheckCircle2 size={30}/></div><p className="mt-6 text-[9px] font-black uppercase tracking-[.2em] text-[#a3ff12]">Subscription secured</p><h1 className="font-display mt-2 text-4xl text-white">{plan ? `${plan.name} activated` : "Checkout complete"}</h1><p className="mx-auto mt-4 max-w-md text-xs leading-6 text-slate-500">Stripe is confirming your payment and Touchline will synchronize access through its secure webhook. This normally takes only a moment.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/dashboard" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-wider text-[#071007]"><Sparkles size={14}/>Enter Command Center</Link><Link href="/billing" className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-5 text-[9px] font-black uppercase tracking-wider text-cyan-100">View billing</Link></div></div></div>;
}
