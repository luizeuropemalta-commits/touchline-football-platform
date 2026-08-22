import Image from "next/image";

import { TOUCHLINE_ARENA_OFFICIAL_LOGO } from "@/lib/touchlineArena/arena-intro";

export default function GlobalLoading() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit items-center gap-3 rounded-full border border-cyan-200/20 bg-black/80 px-4 py-2 text-cyan-100 shadow-[0_10px_30px_rgba(0,0,0,.35)] backdrop-blur"
      role="status"
      aria-live="polite"
      aria-label="TouchLine is loading"
    >
      <div className="relative grid size-7 place-items-center" aria-hidden="true">
          <div className="absolute inset-0 animate-[spin_2.8s_linear_infinite] rounded-full border border-transparent border-t-cyan-300 border-r-cyan-300/20 shadow-[0_-4px_16px_rgba(34,211,238,.14)]"/>
          <div className="absolute inset-1 animate-[spin_3.8s_linear_infinite_reverse] rounded-full border border-transparent border-b-[#a3ff12] border-l-[#a3ff12]/20"/>
          <Image
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            width={20}
            height={20}
            priority
            unoptimized
            className="relative size-5 object-contain drop-shadow-[0_0_10px_rgba(163,255,18,.5)]"
          />
        </div>
      <p className="text-[10px] font-black tracking-[0.18em] text-cyan-100">TOUCHLINE</p>
    </div>
  );
}
