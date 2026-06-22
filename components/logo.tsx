import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className={`flex items-center gap-3 ${light ? "text-white" : "text-white"}`}>
      <span className="premium-ring relative grid size-10 place-items-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[.13] to-blue-700/[.08] shadow-[0_0_30px_rgba(34,211,238,.16)]">
        <span className="block size-4 rotate-45 border-2 border-[#a3ff12] shadow-[0_0_14px_rgba(163,255,18,.72)]" />
      </span>
      <span><span className="block text-[18px] font-black uppercase italic tracking-[-.06em]">Touchline</span><span className="block text-[7px] font-bold uppercase tracking-[.3em] text-cyan-300/65">Career Universe</span></span>
    </Link>
  );
}
