import type { User } from "@supabase/supabase-js";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type WorkspaceCore = Awaited<ReturnType<typeof ensureUserWorkspace>>;

export type CurrentWorkspace =
  | { status: "missing-config" }
  | { status: "anonymous" }
  | { status: "error"; message: string }
  | (WorkspaceCore & { status: "ready"; user: User });

export async function getCurrentWorkspace(): Promise<CurrentWorkspace> {
  const supabase = await createClient();
  if (!supabase) return { status: "missing-config" };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  try {
    const workspace = await ensureUserWorkspace(user);
    return { status: "ready", user, ...workspace };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not load workspace." };
  }
}
