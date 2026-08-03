import Image from "next/image";

import { TOUCHLINE_ARENA_OFFICIAL_LOGO } from "@/lib/touchlineArena/arena-intro";

export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black" role="status" aria-label="TouchLine Arena">
      <div className="relative text-center">
        <div className="relative mx-auto grid size-24 place-items-center">
          <div className="absolute inset-0 animate-[spin_2.8s_linear_infinite] rounded-full border border-transparent border-t-cyan-300 border-r-cyan-300/20 shadow-[0_-8px_30px_rgba(34,211,238,.14)]"/>
          <div className="absolute inset-3 animate-[spin_3.8s_linear_infinite_reverse] rounded-full border border-transparent border-b-[#a3ff12] border-l-[#a3ff12]/20"/>
          <Image
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            width={48}
            height={48}
            priority
            unoptimized
            className="relative size-12 object-contain drop-shadow-[0_0_18px_rgba(163,255,18,.5)]"
          />
        </div>
        <p className="mt-5 text-[9px] font-black text-cyan-200">TouchLine</p>
        <div className="mx-auto mt-4 h-px w-40 overflow-hidden bg-white/[.06]"><div className="h-full w-1/2 animate-[status-scan_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#a3ff12] to-transparent"/></div>
      </div>
    </div>
  );
}
