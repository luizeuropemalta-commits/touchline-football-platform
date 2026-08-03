import Image from "next/image";
import Link from "next/link";

import { TOUCHLINE_ARENA_OFFICIAL_LOGO } from "@/lib/touchlineArena/arena-intro";

export function TouchLineWordmark({
  className = "",
  onLight = false,
}: {
  className?: string;
  onLight?: boolean;
}) {
  return (
    <span className={`font-black  italic ${className}`}>
      <span className="text-[#a3ff12]">Touch</span>
      <span className={onLight ? "text-[#071007]" : "text-white"}>Line</span>
    </span>
  );
}

export function PremierTouchLineBrand({
  className = "",
  onLight = false,
}: {
  className?: string;
  onLight?: boolean;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className={onLight ? "text-[#071007]" : "text-white"}>Premier</span>
      <TouchLineWordmark onLight={onLight} />
    </span>
  );
}

export function Logo({
  light = false,
  href = "/arena",
  officialArena = false,
}: {
  light?: boolean;
  href?: string;
  officialArena?: boolean;
}) {
  return (
    <Link href={href} className={`group flex items-center gap-3 ${light ? "text-white" : "text-white"}`}>
      <span className="premium-ring relative grid size-14 place-items-center overflow-hidden rounded-[1.55rem] border border-cyan-200/40 bg-gradient-to-br from-cyan-300/[.18] via-blue-700/[.10] to-[#a3ff12]/[.08] shadow-[0_0_42px_rgba(34,211,238,.24)] transition duration-500 group-hover:scale-105 group-hover:border-[#a3ff12]/45">
        <span className="absolute inset-1 rounded-[1.15rem] border border-white/[.07] bg-black/10"/>
        <span className="absolute h-24 w-24 rounded-full border border-cyan-200/10"/>
        <span className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-cyan-300/20 blur-2xl"/>
        {officialArena ? (
          <Image
            src={TOUCHLINE_ARENA_OFFICIAL_LOGO}
            alt=""
            width={38}
            height={38}
            priority
            unoptimized
            className="relative size-[38px] object-contain drop-shadow-[0_0_15px_rgba(163,255,18,.65)]"
          />
        ) : (
          <span className="font-display relative text-[23px] font-black italic text-white drop-shadow-[0_0_18px_rgba(34,211,238,.75)]">TL</span>
        )}
      </span>
      <span>
        <TouchLineWordmark className="block text-[19px]" />
        <span className="block text-[7px] font-bold text-cyan-300/70">Arena / TouchLine England</span>
      </span>
    </Link>
  );
}
