export type TouchlineBrowserStorageKind = "localStorage" | "sessionStorage";

export type TouchlineStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const inMemorySessionIds = new Map<string, string>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IdentityBoundBrowserSession = {
  version: 1;
  identityFingerprint: string;
  sessionId: string;
};

function resolveBrowserStorage(kind: TouchlineBrowserStorageKind): TouchlineStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window[kind] ?? null;
  } catch {
    return null;
  }
}

export function safeStorageRead(storage: TouchlineStorage | null | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageWrite(
  storage: TouchlineStorage | null | undefined,
  key: string,
  value: string,
) {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(storage: TouchlineStorage | null | undefined, key: string) {
  try {
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readBrowserStorage(kind: TouchlineBrowserStorageKind, key: string) {
  return safeStorageRead(resolveBrowserStorage(kind), key);
}

export function writeBrowserStorage(
  kind: TouchlineBrowserStorageKind,
  key: string,
  value: string,
) {
  return safeStorageWrite(resolveBrowserStorage(kind), key, value);
}

export function removeBrowserStorage(kind: TouchlineBrowserStorageKind, key: string) {
  return safeStorageRemove(resolveBrowserStorage(kind), key);
}

export function createResilientBrowserId(
  prefix = "",
  randomUuid?: (() => string) | null,
) {
  try {
    const uuidFactory = randomUuid === undefined
      ? globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
      : randomUuid;
    const uuid = uuidFactory?.().trim();
    if (uuid && UUID_PATTERN.test(uuid)) return uuid;
  } catch {
    // Fall through to a browser-compatible, non-cryptographic correlation id.
  }

  const prefixSegment = prefix ? `${prefix}-` : "";
  return `${prefixSegment}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createResilientBrowserUuid(randomUuid?: (() => string) | null) {
  try {
    const uuidFactory = randomUuid === undefined
      ? globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
      : randomUuid;
    const uuid = uuidFactory?.().trim();
    if (uuid && UUID_PATTERN.test(uuid)) return uuid;
  } catch {
    // Fall through to a UUID-shaped correlation id.
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createBrowserIdentityFingerprint(identity: string) {
  const normalizedIdentity = identity.trim();
  if (!normalizedIdentity) return null;

  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(normalizedIdentity));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function parseIdentityBoundBrowserSession(value: string | null): IdentityBoundBrowserSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<IdentityBoundBrowserSession>;
    if (
      parsed.version !== 1 ||
      typeof parsed.identityFingerprint !== "string" ||
      typeof parsed.sessionId !== "string" ||
      !UUID_PATTERN.test(parsed.sessionId)
    ) {
      return null;
    }
    return parsed as IdentityBoundBrowserSession;
  } catch {
    return null;
  }
}

export async function getOrCreateIdentityBoundBrowserSessionId(
  key: string,
  identity: string,
  options: {
    storage?: TouchlineStorage | null;
    identityFingerprint?: string | null;
    randomUuid?: (() => string) | null;
  } = {},
) {
  const identityFingerprint = options.identityFingerprint === undefined
    ? await createBrowserIdentityFingerprint(identity)
    : options.identityFingerprint;
  const memoryKey = `${key}:${identityFingerprint ?? identity}`;
  const storage = options.storage === undefined ? resolveBrowserStorage("sessionStorage") : options.storage;
  const storedSession = parseIdentityBoundBrowserSession(safeStorageRead(storage, key));

  if (identityFingerprint && storedSession?.identityFingerprint === identityFingerprint) {
    inMemorySessionIds.set(memoryKey, storedSession.sessionId);
    return storedSession.sessionId;
  }

  const memorySessionId = inMemorySessionIds.get(memoryKey);
  if (memorySessionId) return memorySessionId;

  const sessionId = createResilientBrowserUuid(options.randomUuid);
  inMemorySessionIds.set(memoryKey, sessionId);
  if (identityFingerprint) {
    safeStorageWrite(storage, key, JSON.stringify({
      version: 1,
      identityFingerprint,
      sessionId,
    } satisfies IdentityBoundBrowserSession));
  }
  return sessionId;
}

export function getOrCreateBrowserSessionId(key: string, prefix = "touchline-session") {
  const storedSessionId = readBrowserStorage("sessionStorage", key)?.trim();
  if (storedSessionId) {
    inMemorySessionIds.set(key, storedSessionId);
    return storedSessionId;
  }

  const memorySessionId = inMemorySessionIds.get(key);
  if (memorySessionId) return memorySessionId;

  const sessionId = createResilientBrowserId(prefix);
  inMemorySessionIds.set(key, sessionId);
  writeBrowserStorage("sessionStorage", key, sessionId);
  return sessionId;
}
