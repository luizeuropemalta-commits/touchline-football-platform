"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import ClubHubNavigationPending from "./ClubHubNavigationPending";

type ClubHubCardLinkProps = {
  children: ReactNode;
  className: string;
  href: string;
  pendingLabel: string;
  style: CSSProperties;
};

const PENDING_FAILSAFE_MS = 10_000;

/**
 * Keeps navigation feedback local to the activated card, including after a
 * browser back/forward restore where `useLinkStatus` alone may not repaint.
 */
export default function ClubHubCardLink({
  children,
  className,
  href,
  pendingLabel,
  style,
}: ClubHubCardLinkProps) {
  const pathname = usePathname();
  const [pendingState, setPendingState] = useState({ pathname, requested: false });
  const requested = pendingState.pathname === pathname && pendingState.requested;
  const resetPending = useCallback(() => {
    setPendingState({ pathname, requested: false });
  }, [pathname]);

  useEffect(() => {
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, [resetPending]);

  useEffect(() => {
    if (!requested) return;
    const timeout = window.setTimeout(resetPending, PENDING_FAILSAFE_MS);
    return () => window.clearTimeout(timeout);
  }, [requested, resetPending]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.currentTarget.hasAttribute("download")
      || (event.currentTarget.target !== "" && event.currentTarget.target !== "_self")
    ) return;
    setPendingState({ pathname, requested: true });
  }

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      style={style}
      onClick={handleClick}
    >
      {children}
      <ClubHubNavigationPending
        label={pendingLabel}
        forcePending={requested}
        onPendingSettled={resetPending}
      />
    </Link>
  );
}
