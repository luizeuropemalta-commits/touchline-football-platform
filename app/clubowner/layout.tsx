import { Suspense, type ReactNode } from "react";
import TouchlineAccountLoading from "@/components/touchline/TouchlineAccountLoading";
import TouchlineCardLeadershipLayout from "@/components/touchline/cards/TouchlineCardLeadershipLayout";

/** The route loading boundary is nested inside this layout. Public ranking
 * reads in the leadership layout must also have a visible loading boundary,
 * otherwise the root footer can appear alone while those reads are pending. */
export default function ClubOwnerLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<TouchlineAccountLoading />}>
    <TouchlineCardLeadershipLayout>{children}</TouchlineCardLeadershipLayout>
  </Suspense>;
}
