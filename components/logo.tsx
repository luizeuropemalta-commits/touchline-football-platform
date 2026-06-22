import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className={`flex items-center gap-3 ${light ? "text-white" : "text-white"}`}>
      <span className="premium-ring relative grid size-12 place-items-center rounded-[1.35rem] border border-cyan-200/35 bg-gradient-to-br from-cyan-300/[.16] via-blue-700/[.10] to-[#a3ff12]/[.06] shadow-[0_0_34px_rgba(34,211,238,.2)]">
        <span className="absolute inset-1 rounded-[1rem] border border-white/[.06]"/>
        <span className="font-display relative text-[20px] font-black uppercase italic tracking-[-.14em] text-white drop-shadow-[0_0_14px_rgba(34,211,238,.65)]">AF</span>
      </span>
      <span><span className="block text-[18px] font-black uppercase italic tracking-[-.06em]">Agente FIFA</span><span className="block text-[7px] font-bold uppercase tracking-[.3em] text-cyan-300/65">Career Mode</span></span>
    </Link>
  );
}
