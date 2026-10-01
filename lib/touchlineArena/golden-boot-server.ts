import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGoldenBootPublicAuthority, type GoldenBootPublicAuthority } from "./golden-boot-public-authority.ts";

export type GoldenBootPublicRead = Readonly<{
  authority: GoldenBootPublicAuthority;
  /** Database clock plus conservative RPC elapsed time; not app wall time. */
  servedAtMs: number;
}>;
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Exactly one database read; never a provider fetch, refresh, or write. A
 * null response is a revocation/transport failure, not permission to keep a
 * previously displayed award. This reader cannot activate the producer. */
export async function readGoldenBootPublicState(admin: Admin | null): Promise<GoldenBootPublicRead | null> {
  if (!admin) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const startedAt = performance.now();
    // Awards must not hold navigation behind a slow/locked database. Abort the
    // fetch as well as bounding our wait; a late response cannot restore it.
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => { resolve(null); controller.abort(); }, 500);
    });
    const response = await Promise.race([
      admin.rpc("read_touchline_current_golden_boot").abortSignal(controller.signal),
      deadline,
    ]);
    if (!response || controller.signal.aborted) return null;
    const { data, error } = response;
    const elapsed = performance.now() - startedAt;
    const observedAtMs = data && typeof data === "object" ? data.observedAtMs : null;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 500
      || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0) return null;
    // Charge the whole RPC round trip, not half: network time must never
    // extend the database-issued expiry. Application clock skew is irrelevant.
    const servedAtMs = observedAtMs + Math.ceil(elapsed);
    if (error || !Number.isSafeInteger(servedAtMs) || servedAtMs < 0) return null;
    const authority = parseGoldenBootPublicAuthority(data);
    if (!authority) return null;
    if (authority.status === "ready") {
      const remaining = Date.parse(authority.expiresAt!) - servedAtMs;
      if (remaining <= 0 || remaining > 60_000) return null;
    }
    return Object.freeze({ authority, servedAtMs });
  } catch {
    // No SQL messages, credentials, provider metadata or raw rows reach clients.
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Request-local sharing only: no cross-request cache can retain a revoked boot.
// Default OFF until the migration, producer and full runtime proof are ready.
export const loadTouchlineGoldenBoot = cache(async (): Promise<GoldenBootPublicRead | null> => {
  if (process.env.TOUCHLINE_GOLDEN_BOOT_ENABLED !== "true") return null;
  try {
    return await readGoldenBootPublicState(createAdminClient());
  } catch {
    // Invalid local/server configuration must not prevent page navigation.
    return null;
  }
});
