export const TOUCHLINE_ARENA_PERSISTENCE_NAMESPACE_VERSION = 2 as const;

const STORAGE_NAMESPACE_PREFIX = "touchline:arena:persistence:v2";
const COOKIE_NAMESPACE_PREFIX = "touchline_arena_persistence_v2";
const MAX_SUBJECT_ID_LENGTH = 160;
const MAX_LEGACY_KEY_LENGTH = 512;
const RESOURCE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,79})$/;

export type ArenaPersistencePrincipal =
  | Readonly<{
      kind: "authenticated";
      userId: string;
    }>
  | Readonly<{
      kind: "demo";
      demoId?: string;
    }>
  | Readonly<{
      kind: "anonymous";
      sessionId: string;
    }>;

export type ArenaPersistenceNamespace = Readonly<{
  version: typeof TOUCHLINE_ARENA_PERSISTENCE_NAMESPACE_VERSION;
  principalKind: ArenaPersistencePrincipal["kind"];
  subjectToken: string;
  storagePrefix: string;
  cookiePrefix: string;
}>;

export type ArenaPersistenceKeys = Readonly<{
  namespace: ArenaPersistenceNamespace;
  resource: string;
  storageKey: string;
  cookieName: string;
}>;

export type ArenaLegacyMigrationAuthorization =
  | Readonly<{ allowed: false }>
  | Readonly<{
      allowed: true;
      userId: string;
    }>;

export type ArenaLegacyMigrationRequest = Readonly<{
  principal: ArenaPersistencePrincipal;
  resource: string;
  legacyStorageKey?: string | null;
  legacyCookieName?: string | null;
  authorization?: ArenaLegacyMigrationAuthorization | null;
}>;

export type ArenaLegacyMigrationPlan = Readonly<{
  mode: "copy-once";
  source: Readonly<{
    storageKey?: string;
    cookieName?: string;
  }>;
  target: ArenaPersistenceKeys;
  removeLegacyAfterWrite: true;
}>;

function requiredOpaqueId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > MAX_SUBJECT_ID_LENGTH) {
    throw new Error(`${label} must not exceed ${MAX_SUBJECT_ID_LENGTH} characters.`);
  }
  return normalized;
}

function normalizedResource(resource: string) {
  const normalized = resource.trim();
  if (!RESOURCE_PATTERN.test(normalized)) {
    throw new Error(
      "Arena persistence resource must be a lowercase key containing only letters, numbers, dots, underscores or hyphens.",
    );
  }
  return normalized;
}

function cookieSafeToken(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("");
}

function principalSubject(principal: ArenaPersistencePrincipal) {
  switch (principal.kind) {
    case "authenticated":
      return requiredOpaqueId(principal.userId, "Arena authenticated user_id");
    case "demo":
      return requiredOpaqueId(principal.demoId ?? "default", "Arena demo id");
    case "anonymous":
      return requiredOpaqueId(principal.sessionId, "Arena anonymous session id");
  }
}

/**
 * Produces a deterministic namespace without reading browser or server state.
 * Authenticated, demo and anonymous identities can never resolve to the same
 * prefix, and authenticated prefixes are scoped to the exact opaque user_id.
 */
export function arenaPersistenceNamespace(
  principal: ArenaPersistencePrincipal,
): ArenaPersistenceNamespace {
  const subjectToken = cookieSafeToken(principalSubject(principal));
  const scope = `${principal.kind}:${subjectToken}`;

  return Object.freeze({
    version: TOUCHLINE_ARENA_PERSISTENCE_NAMESPACE_VERSION,
    principalKind: principal.kind,
    subjectToken,
    storagePrefix: `${STORAGE_NAMESPACE_PREFIX}:${scope}`,
    cookiePrefix: `${COOKIE_NAMESPACE_PREFIX}_${principal.kind}_${subjectToken}`,
  });
}

/**
 * Returns the paired localStorage key and cookie name for one logical resource.
 * The helper performs no persistence itself, so callers cannot accidentally
 * fall back to a global legacy key.
 */
export function arenaPersistenceKeys(
  principal: ArenaPersistencePrincipal,
  resource: string,
): ArenaPersistenceKeys {
  const namespace = arenaPersistenceNamespace(principal);
  const normalized = normalizedResource(resource);

  return Object.freeze({
    namespace,
    resource: normalized,
    storageKey: `${namespace.storagePrefix}:${normalized}`,
    cookieName: `${namespace.cookiePrefix}_${cookieSafeToken(normalized)}`,
  });
}

function optionalLegacyKey(value: string | null | undefined, label: string) {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty when provided.`);
  if (normalized.length > MAX_LEGACY_KEY_LENGTH) {
    throw new Error(`${label} must not exceed ${MAX_LEGACY_KEY_LENGTH} characters.`);
  }
  return normalized;
}

/**
 * Builds a one-time migration plan only for an authenticated user whose exact
 * user_id is named in an explicit authorization. It never reads, copies or
 * deletes data; the future integration must copy successfully and then remove
 * the global legacy value as directed by the returned plan.
 */
export function planArenaLegacyPersistenceMigration(
  request: ArenaLegacyMigrationRequest,
): ArenaLegacyMigrationPlan | null {
  if (request.principal.kind !== "authenticated") return null;
  if (request.authorization?.allowed !== true) return null;

  const principalUserId = requiredOpaqueId(
    request.principal.userId,
    "Arena authenticated user_id",
  );
  const authorizedUserId = requiredOpaqueId(
    request.authorization.userId,
    "Arena legacy migration authorization user_id",
  );
  if (principalUserId !== authorizedUserId) return null;

  const storageKey = optionalLegacyKey(
    request.legacyStorageKey,
    "Arena legacy storage key",
  );
  const cookieName = optionalLegacyKey(
    request.legacyCookieName,
    "Arena legacy cookie name",
  );
  if (!storageKey && !cookieName) {
    throw new Error("Arena legacy migration requires a storage key or cookie name.");
  }

  const target = arenaPersistenceKeys(request.principal, request.resource);
  if (storageKey === target.storageKey || cookieName === target.cookieName) {
    throw new Error("Arena legacy migration source must differ from its namespaced target.");
  }

  return Object.freeze({
    mode: "copy-once",
    source: Object.freeze({
      ...(storageKey ? { storageKey } : {}),
      ...(cookieName ? { cookieName } : {}),
    }),
    target,
    removeLegacyAfterWrite: true,
  });
}
