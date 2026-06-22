import { AppShell } from "@/components/app-shell";
import { getCurrentSubscription } from "@/lib/billing/subscription";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const subscription = await getCurrentSubscription();
  return <AppShell planKey={subscription.planKey} subscriptionStatus={subscription.status}>{children}</AppShell>;
}
