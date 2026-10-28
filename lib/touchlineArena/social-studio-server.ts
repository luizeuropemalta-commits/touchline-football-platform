import "server-only";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "./auth-access";

// Shared by the private PNG page and byte reader. Legacy video mutations are retired.
export async function authorizeStudio() {
  const session = await createClient();
  if (!session) return null;
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user?.id || !isOwnerEmail(user.email) || !hasTouchLineArenaAccess(user)) return null;
  return user.id;
}
