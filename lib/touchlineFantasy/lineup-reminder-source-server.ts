import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  readLineupReminderSource,
  type LineupReminderScope,
  type LineupReminderSourceResult,
} from "./lineup-reminder-source.ts";

/** One internal read RPC, no retry or write. Validation in the shared reader
 * precedes lazy admin construction. This is not notification/send authority.
 */
export async function readLineupReminderSourceServer(
  input: LineupReminderScope & { maximumAgeMs: number },
): Promise<LineupReminderSourceResult> {
  return readLineupReminderSource({
    rpc: async (name, args) => {
      const unavailable = { data: null, error: null };
      const controller = new AbortController();
      const startedAt = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const elapsed = () => performance.now() - startedAt;
      const withinDeadline = () => { const ms = elapsed(); return Number.isFinite(ms) && ms >= 0 && ms < 5_000; };
      try {
        const deadline = new Promise<typeof unavailable>(resolve => {
          // Settle before abort listeners can resolve a late successful request.
          timer = setTimeout(() => { resolve(unavailable); controller.abort(); }, 5_000);
        });
        const admin = createAdminClient();
        if (!admin) return unavailable;
        if (!withinDeadline()) { controller.abort(); return unavailable; }
        const response = await Promise.race([
          admin.rpc(name, args).abortSignal(controller.signal), deadline,
        ]);
        if (controller.signal.aborted || !withinDeadline()) { controller.abort(); return unavailable; }
        return response;
      } catch {
        // Never expose configuration, SQL or transport errors to consumers.
        return unavailable;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  }, input, () => Date.now());
}
