import type { ReactNode } from "react";
import { ScopedTouchlineCardLeadershipLayout } from "@/components/touchline/cards/TouchlineCardLeadershipLayout";

export default function TouchlineCoachLeadershipLayout({ children }: { children: ReactNode }) {
  return <ScopedTouchlineCardLeadershipLayout scope="coach-only">{children}</ScopedTouchlineCardLeadershipLayout>;
}
