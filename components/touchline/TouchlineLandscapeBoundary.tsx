import type { ReactNode } from "react";

/**
 * Owns the one shared skip target for TouchLine routes.
 *
 * The product must remain usable in portrait as well as landscape. Individual
 * surfaces adapt their layout at their own breakpoints; this global boundary
 * must never hide the application, make it inert, or request an orientation
 * lock on a customer's device.
 */
export default function TouchlineLandscapeBoundary({
  children,
  skipLabel,
}: Readonly<{
  children: ReactNode;
  skipLabel: string;
}>) {
  return <>
    <a
      href="#touchline-main-content"
      className="sr-only fixed left-4 top-4 z-[2147483647] rounded-lg bg-[#edfff0] px-4 py-3 text-sm font-black text-[#041019] shadow-[0_16px_48px_rgba(0,0,0,.45)] focus:not-sr-only focus:outline focus:outline-3 focus:outline-offset-4 focus:outline-cyan-300"
    >
      {skipLabel}
    </a>
    <div
      id="touchline-main-content"
      tabIndex={-1}
      data-touchline-main-content-fallback
    >
      {children}
    </div>
  </>;
}
