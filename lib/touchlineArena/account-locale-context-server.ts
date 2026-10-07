import "server-only";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER } from "@/lib/touchlinePreview/isolation";

export type AccountLocaleContext =
  | { mode: "account"; accountId: string }
  | { mode: "guest" | "demo" | "unavailable" };

/** Server-owned mode only; no preference reads, writes or locale inference.
 * Demonstration callers opt out before any authentication or request work.
 * An authentication failure is not proof of a guest session.
 */
export async function loadAccountLocaleContext(
  { demonstration = false }: { demonstration?: boolean } = {},
): Promise<AccountLocaleContext> {
  if (demonstration === true) return { mode: "demo" };
  try {
    const source = resolveTouchlineDataSource();
    if (source === "qa-mirror") return { mode: "demo" };
    if (source !== "direct") return { mode: "unavailable" };
    const requestHeaders = await headers();
    if (isTouchlineIsolatedPreviewRequest(requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) {
      return { mode: "demo" };
    }
    const client = await createClient();
    if (!client) return { mode: "unavailable" };
    // Keep login/recovery rendering available when Auth stalls. This bounds
    // waiting, not the SDK transport; a late receipt cannot change the fallback.
    const result = await resolveServerReadWithin(client.auth.getUser(), null, 8_000);
    if (!result || !result.data || typeof result.data !== "object" || !Object.hasOwn(result.data, "user")) {
      return { mode: "unavailable" };
    }
    const { user } = result.data;
    if (user === null && (result.error === null || result.error instanceof AuthSessionMissingError)) {
      return { mode: "guest" };
    }
    if (result.error !== null || !user || !hasTouchLineArenaAccess(user)
      || typeof user.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
      return { mode: "unavailable" };
    }
    return { mode: "account", accountId: user.id };
  } catch {
    return { mode: "unavailable" };
  }
}
