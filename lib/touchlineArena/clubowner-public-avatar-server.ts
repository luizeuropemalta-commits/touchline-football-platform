import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail, ownerEmails } from "@/lib/admin/owner";
import { resolveClubOwnerAvatarRuntimeAdmission } from "./club-owner-avatar-runtime-admission";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import { TOUCHLINE_PUBLIC_ORIGIN, TOUCHLINE_QA_ORIGIN } from "./public-origin";
import { createAvatarEnvironmentGuard, awaitAvatarStep } from "./club-owner-avatar-upload-contract";
import { createClubOwnerAvatarReader } from "./club-owner-avatar-storage";
import { getClubOwnerAvatarResourceAdmission, type ClubOwnerAvatarResourceScope } from "./club-owner-avatar-resource-admission";
import { publicOwnerId } from "./clubowner-public-contract";
import { allowsClubOwnerAvatarLocalEnvironment } from "./club-owner-avatar-local-admission";
import { handlePublicOwnerAvatar, parsePublicOwnerAvatars, publicOwnerAvatarUrls } from "./clubowner-public-avatar-handler";

type Environment = Readonly<Record<string, string | undefined>>;
type Dependencies = { createAdminClient: () => Pick<SupabaseClient, "rpc"> | null; isOwnerEmail: (email: string) => boolean;
  ownersConfigured: boolean; fetchImpl: typeof fetch; assertEnvironment: () => void };

/** No resource creation or activation. Gates are independent and exact; the
 * published DTO gains only mediated URLs. Private descriptors stay in memory.
 * Rollback: turn PUBLIC_AVATAR_ENABLED off. Consent and follows are preserved.
 */
export function createPublicOwnerAvatarService(input: Environment, dependencies: Dependencies) {
  const environment = Object.freeze({ ...input }), deps = { ...dependencies };
  const assertCurrent = createAvatarEnvironmentGuard(deps.assertEnvironment);
  // Same explicit runtime admission as the private photo flow.
  // This permits URL projection locally; serving still validates the actual
  // request origin below. Never synthesize Vercel variables for a local host.
  const local = allowsClubOwnerAvatarLocalEnvironment(environment, "http://localhost:3100");
  const admission = resolveClubOwnerAvatarRuntimeAdmission(environment, local ? "http://localhost:3100"
    : environment.VERCEL_ENV === "production" ? TOUCHLINE_PUBLIC_ORIGIN : TOUCHLINE_QA_ORIGIN);
  const enabled = environment.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED === "true"
    && environment.TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED === "true"
    && environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED === "true"
    && environment.TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY === "true"
    && deps.ownersConfigured && resolveTouchlineDataSource(environment) === "direct"
    && admission !== null;
  let client: Pick<SupabaseClient, "rpc"> | null | undefined;
  const allowsOrigin = (origin: string) => admission !== null && (local
    ? allowsClubOwnerAvatarLocalEnvironment(environment, origin) : origin === admission.requestOrigin);
  async function read(ids: readonly string[], outerSignal: AbortSignal) {
    assertCurrent(); outerSignal.throwIfAborted();
    if (!enabled || !ids.length || ids.length > 20 || ids.some(id => !publicOwnerId(id) || id !== id.toLowerCase())
      || new Set(ids).size !== ids.length) throw Error("PUBLIC_AVATAR_UNAVAILABLE");
    client ??= deps.createAdminClient(); assertCurrent();
    if (!client) throw Error("PUBLIC_AVATAR_UNAVAILABLE");
    const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(8_000)]);
    const response = await awaitAvatarStep(() => client!.rpc("touchline_people_read_public_avatars", { p_public_ids: [...ids] }).abortSignal(signal).retry(false), signal);
    assertCurrent(); signal.throwIfAborted();
    if (response.error !== null || response.status !== 200) throw Error("PUBLIC_AVATAR_UNAVAILABLE");
    const rows = parsePublicOwnerAvatars(response.data, ids, email => { assertCurrent(); return deps.isOwnerEmail(email); });
    assertCurrent(); return rows;
  }
  return Object.freeze({ enabled, assertCurrent, allowsOrigin,
    async urls(ids: readonly string[]) {
      if (!enabled || ids.length === 0) return {};
      return publicOwnerAvatarUrls(await read(ids.map(id => id.toLowerCase()), AbortSignal.timeout(10_000)));
    },
    async serve(request: Request, publicId: string) {
      const resources = getClubOwnerAvatarResourceAdmission(); let scope: ClubOwnerAvatarResourceScope | null = null;
      try {
        const requestOrigin = new URL(request.url).origin;
        const origin = local && allowsClubOwnerAvatarLocalEnvironment(environment, requestOrigin)
          ? requestOrigin : admission?.requestOrigin ?? TOUCHLINE_QA_ORIGIN;
        return await handlePublicOwnerAvatar(request, publicId, { enabled, origin }, {
          assertEnvironment: assertCurrent,
          async read(id, signal) {
            scope ??= resources.tryAcquire(); if (!scope) throw Error("PUBLIC_AVATAR_BUSY");
            resources.assertOpen(scope); return (await read([id], signal))[0] ?? null;
          },
          async readImmutable(current, signal) {
            if (!scope) throw Error("PUBLIC_AVATAR_UNAVAILABLE"); resources.assertOpen(scope);
            const reader = createClubOwnerAvatarReader({ supabaseOrigin: environment.SUPABASE_URL!, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!,
              fetchImpl: deps.fetchImpl, resourceScope: scope, assertEnvironment: assertCurrent });
            return reader.readImmutable({ actorId: current.actorId, operationId: current.operationId!, digest: current.digest! }, signal);
          },
        });
      } finally { if (scope) resources.close(scope); }
    },
  });
}

export function publicOwnerAvatarService() {
  const environment = { ...process.env };
  const assertEnvironment = () => {
    if (Object.keys(environment).length !== Object.keys(process.env).length
      || Object.keys(environment).some(key => environment[key] !== process.env[key])) throw Error("PUBLIC_AVATAR_CONFIGURATION_CHANGED");
  };
  return createPublicOwnerAvatarService(environment, { createAdminClient, isOwnerEmail, ownersConfigured: ownerEmails().length > 0,
    fetchImpl: (input, init) => { assertEnvironment(); return fetch(input, init); }, assertEnvironment });
}
