export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#03070c]">
      <div className="relative text-center">
        <div className="relative mx-auto grid size-24 place-items-center">
          <div className="absolute inset-0 animate-[spin_2.8s_linear_infinite] rounded-full border border-transparent border-t-cyan-300 border-r-cyan-300/20 shadow-[0_-8px_30px_rgba(34,211,238,.14)]"/>
          <div className="absolute inset-3 animate-[spin_3.8s_linear_infinite_reverse] rounded-full border border-transparent border-b-[#a3ff12] border-l-[#a3ff12]/20"/>
          <div className="size-5 rotate-45 border-2 border-white shadow-[0_0_18px_rgba(255,255,255,.4)]"/>
        </div>
        <p className="mt-5 text-[9px] font-black uppercase tracking-[.3em] text-cyan-200">Entering football universe</p>
        <div className="mx-auto mt-4 h-px w-40 overflow-hidden bg-white/[.06]"><div className="h-full w-1/2 animate-[status-scan_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#a3ff12] to-transparent"/></div>
      </div>
    </div>
  );
}
