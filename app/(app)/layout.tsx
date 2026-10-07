import { redirect } from "next/navigation";
import { AuthSessionMissingError } from "@supabase/supabase-js";

import { ArenaAdminShell } from "@/components/arena-admin-shell";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const viewer = await supabase.auth.getUser().catch(() => null);
  if (!viewer) redirect("/login?error=auth_unavailable");
  if (viewer.data.user === null && viewer.error instanceof AuthSessionMissingError) redirect("/login");
  if (viewer.error !== null) redirect("/login?error=auth_unavailable");
  const user = viewer.data.user;
  if (!user) redirect("/login");

  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : {};
  const metadataName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : "";
  const profileName = metadataName.trim() || user.email || "TouchLine ClubOwner";
  const isOwner = isOwnerEmail(user.email);

  return (
    <ArenaAdminShell
      profileName={profileName}
      profileEmail={user.email ?? ""}
      isOwner={isOwner}
    >
      {children}
    </ArenaAdminShell>
  );
}
