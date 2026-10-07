"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const SiteLocaleReleaseContext = createContext(false);

/** The server supplies release policy; URL parameters never grant it. */
export function SiteLocaleReleaseProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <SiteLocaleReleaseContext.Provider value={enabled}>{children}</SiteLocaleReleaseContext.Provider>;
}

export function useSiteLocaleRelease() {
  const enabled = useContext(SiteLocaleReleaseContext);
  const pathname = usePathname();
  return enabled && !["/admin", "/visual-qa"].some(path => pathname === path || pathname?.startsWith(`${path}/`));
}
