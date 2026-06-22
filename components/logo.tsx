import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className={`flex items-center gap-3 ${light ? "text-white" : "text-white"}`}>
      <span className="relative grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/[.06] shadow-[0_0_25px_rgba(34,211,238,.12)]">
        <span className="block size-4 rotate-45 border-2 border-[#a3ff12] shadow-[0_0_10px_rgba(163,255,18,.6)]" />
      </span>
      <span><span className="block text-[17px] font-black uppercase italic tracking-[-.04em]">Touchline</span><span className="block text-[7px] font-bold uppercase tracking-[.28em] text-cyan-300/60">Agent OS</span></span>
    </Link>
  );
}
