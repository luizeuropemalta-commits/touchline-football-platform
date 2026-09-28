import type { ReactNode } from "react";
import { headers } from "next/headers";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER } from "@/lib/touchlinePreview/isolation";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import TouchlineCardLeadershipBoundary from "./TouchlineCardLeadershipBoundary";

/** Stable route-family boundary: entry pages do not fetch sporting awards. */
export default async function TouchlineCardLeadershipLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const isIsolatedPreview = isTouchlineIsolatedPreviewRequest(requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER));
  const dataSource = resolveTouchlineDataSource();
  return <TouchlineCardLeadershipBoundary enabled={!isIsolatedPreview && dataSource === "direct"}>
    {children}
  </TouchlineCardLeadershipBoundary>;
}
