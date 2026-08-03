export type TouchlineBrowserStorageKind = "localStorage" | "sessionStorage";

export type TouchlineStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const inMemorySessionIds = new Map<string, string>();

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
    if (uuid) return uuid;
  } catch {
    // Fall through to a browser-compatible, non-cryptographic correlation id.
  }

  const prefixSegment = prefix ? `${prefix}-` : "";
  return `${prefixSegment}${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
