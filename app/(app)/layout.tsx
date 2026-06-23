import { AppShell } from "@/components/app-shell";
import { isOwnerEmail } from "@/lib/admin/owner";
import { getCurrentSubscription } from "@/lib/billing/subscription";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [subscription, workspace] = await Promise.all([getCurrentSubscription(), getCurrentWorkspace()]);
  const profileName = workspace.status === "ready" ? workspace.profile.full_name || workspace.user.email || "Touchline User" : "Touchline User";
  const profileRole = workspace.status === "ready" ? `${workspace.profile.role} · ${subscription.status || "workspace"}` : subscription.status || "Workspace member";
  const isOwner = workspace.status === "ready" && isOwnerEmail(workspace.user.email);

  return (
    <AppShell planKey={subscription.planKey} subscriptionStatus={subscription.status} profileName={profileName} profileRole={profileRole} isOwner={isOwner}>
      {children}
    </AppShell>
  );
}
