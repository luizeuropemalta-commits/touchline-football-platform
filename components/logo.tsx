import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className={`group flex items-center gap-3 ${light ? "text-white" : "text-white"}`}>
      <span className="premium-ring relative grid size-14 place-items-center overflow-hidden rounded-[1.55rem] border border-cyan-200/40 bg-gradient-to-br from-cyan-300/[.18] via-blue-700/[.10] to-[#a3ff12]/[.08] shadow-[0_0_42px_rgba(34,211,238,.24)] transition duration-500 group-hover:scale-105 group-hover:border-[#a3ff12]/45">
        <span className="absolute inset-1 rounded-[1.15rem] border border-white/[.07] bg-black/10"/>
        <span className="absolute h-24 w-24 rounded-full border border-cyan-200/10"/>
        <span className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-cyan-300/20 blur-2xl"/>
        <span className="font-display relative text-[24px] font-black uppercase italic tracking-[-.16em] text-white drop-shadow-[0_0_18px_rgba(34,211,238,.75)]">AF</span>
      </span>
      <span>
        <span className="block text-[19px] font-black uppercase italic tracking-[-.07em]">Agente FIFA</span>
        <span className="block text-[7px] font-bold uppercase tracking-[.34em] text-cyan-300/70">Career Mode Universe</span>
      </span>
    </Link>
  );
}
