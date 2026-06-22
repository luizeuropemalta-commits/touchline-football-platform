import { Check } from "lucide-react";
import { Logo } from "./logo";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#03070c] lg:grid lg:grid-cols-[1.02fr_.98fr]">
      <section className="arena-bg flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16 xl:px-24">
        <Logo />
        <div className="my-auto w-full max-w-[420px] py-12">{children}</div>
        <p className="text-[9px] text-slate-700">© 2026 Touchline Technologies Ltd. All rights reserved.</p>
      </section>
      <section className="pitch-grid relative hidden overflow-hidden border-l border-cyan-100/10 bg-[#07111b] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-32 size-[440px] rounded-full border border-cyan-300/10"/><div className="absolute -right-10 -top-10 size-[280px] rounded-full border border-cyan-300/10"/>
        <div className="relative mt-auto max-w-xl">
          <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Enter the football world</p>
          <h2 className="font-display mt-5 text-5xl uppercase italic leading-[.96] xl:text-6xl">Build careers.<br/><span className="text-[#a3ff12]">Create icons.</span></h2>
          <p className="mt-6 max-w-md text-xs leading-6 text-slate-500">The next-generation command center for agents who want to shape the game, not just manage a database.</p>
          <div className="mt-9 space-y-4">{["Live transfer market intelligence","Player progression and career strategy","Global reputation and achievement system"].map(x=><div key={x} className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="grid size-6 place-items-center rounded-lg border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><Check size={12} strokeWidth={3}/></span>{x}</div>)}</div>
        </div>
        <div className="relative mt-auto flex items-center gap-3 border-t border-white/[.07] pt-6"><span className="pulse-live size-2 rounded-full bg-[#a3ff12]"/><p className="text-[8px] font-black uppercase tracking-[.15em] text-slate-600"><strong className="mr-2 text-slate-300">Market online</strong>18,402 players tracked live</p></div>
      </section>
    </main>
  );
}
