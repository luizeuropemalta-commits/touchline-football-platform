"use client";

import { useId, type CSSProperties } from "react";

type MarkProps = {
  className?: string;
  size?: number;
};

function markStyle(size: number): CSSProperties {
  return { width: size, height: size, flex: `0 0 ${size}px` };
}

export function TouchlineCoinMark({ className = "", size = 24 }: MarkProps) {
  const gradientId = useId().replace(/:/g, "");
  const glowId = useId().replace(/:/g, "");

  return (
    <svg
      className={className}
      style={markStyle(size)}
      viewBox="0 0 56 56"
      fill="none"
      role="img"
      aria-label="Moeda TouchLine TC"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="5" x2="48" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff8c9" />
          <stop offset="0.28" stopColor="#ffd75c" />
          <stop offset="0.66" stopColor="#eca91e" />
          <stop offset="1" stopColor="#8b5008" />
        </linearGradient>
        <filter id={glowId} x="-14" y="-14" width="84" height="84" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1 0 0 0 0 .66 0 0 0 0 .04 0 0 0 .9 0" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        <circle cx="28" cy="28" r="24" fill="#231607" stroke={`url(#${gradientId})`} strokeWidth="3" />
        <circle cx="28" cy="28" r="19.5" fill="#100b05" stroke="#ffe98a" strokeOpacity=".36" />
        <path d="M28 12.5 41 18v15.2L28 44 15 33.2V18l13-5.5Z" fill="#171006" stroke={`url(#${gradientId})`} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M18.5 20h13v4.2h-4.2v13h-4.6v-13h-4.2V20Z" fill="#ffe98a" />
        <path d="M31 20h4.5v12.2l4-2.8v4.8L31 40V20Z" fill="#f0b52d" />
        <path d="M28 6.3v2.8M28 46.9v2.8M6.3 28h2.8M46.9 28h2.8" stroke="#fff1a9" strokeWidth="1.8" strokeLinecap="round" opacity=".78" />
      </g>
    </svg>
  );
}

export function TouchlineSelectedPlayersMark({ className = "", size = 25 }: MarkProps) {
  const gradientId = useId().replace(/:/g, "");

  return (
    <svg
      className={className}
      style={markStyle(size)}
      viewBox="0 0 60 48"
      fill="none"
      role="img"
      aria-label="Três atletas selecionados"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="7" x2="52" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#efff9b" />
          <stop offset=".54" stopColor="#a3ff12" />
          <stop offset="1" stopColor="#79e7ff" />
        </linearGradient>
      </defs>
      <path d="M30 2.8 55 12v25L30 45.2 5 37V12L30 2.8Z" fill="#07110d" stroke={`url(#${gradientId})`} strokeWidth="2" />
      <circle cx="30" cy="16" r="5.5" fill="#dfffb4" />
      <circle cx="18.5" cy="19" r="4.5" fill="#86f1ff" opacity=".9" />
      <circle cx="41.5" cy="19" r="4.5" fill="#86f1ff" opacity=".9" />
      <path d="M20.5 35.5c.3-7.2 3.5-11 9.5-11s9.2 3.8 9.5 11H20.5Z" fill="#a3ff12" />
      <path d="M9.5 35.5c.2-5.9 3.2-9.1 9-9.1 2 0 3.6.4 4.9 1.3-2 2.1-3.1 4.7-3.3 7.8H9.5ZM50.5 35.5c-.2-5.9-3.2-9.1-9-9.1-2 0-3.6.4-4.9 1.3 2 2.1 3.1 4.7 3.3 7.8h10.6Z" fill="#79e7ff" opacity=".78" />
      <path d="M30 27v8.5M26 30.5h8" stroke="#07110d" strokeWidth="1.7" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
