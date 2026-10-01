import type { ReactNode } from "react";
import { headers } from "next/headers";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER } from "@/lib/touchlinePreview/isolation";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import TouchlineCardLeadershipBoundary, { type TouchlineCardLeadershipScope } from "./TouchlineCardLeadershipBoundary";

/** Stable route-family boundary: entry pages do not fetch sporting awards. */
export default function TouchlineCardLeadershipLayout({ children }: { children: ReactNode }) {
  return <ScopedTouchlineCardLeadershipLayout scope="all">{children}</ScopedTouchlineCardLeadershipLayout>;
}

/** Scope is an internal component prop, never an extra Next route-layout prop. */
export async function ScopedTouchlineCardLeadershipLayout({ children, scope }: {
  children: ReactNode;
  scope: TouchlineCardLeadershipScope;
}) {
  const requestHeaders = await headers();
  const isIsolatedPreview = isTouchlineIsolatedPreviewRequest(requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER));
  const dataSource = resolveTouchlineDataSource();
  return <TouchlineCardLeadershipBoundary enabled={!isIsolatedPreview && dataSource === "direct"} scope={scope}>
    {children}
  </TouchlineCardLeadershipBoundary>;
}
