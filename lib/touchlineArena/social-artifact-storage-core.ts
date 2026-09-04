import {
  checksumTouchlineSocialArtifact,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  type TouchlineSocialArtifactLocator,
  type TouchlineSocialArtifactMimeType,
  type TouchlineSocialArtifactReader,
  type TouchlineSocialStoredArtifact,
} from "./social-publication-contract.ts";
import { TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS } from "./social-lineup-worker-budget.ts";

const CONTENT_ADDRESS = /\/([a-f0-9]{64})\.(png|jpg)$/;

type StorageFetch = typeof fetch;

export type TouchlineSocialArtifactUpload = Readonly<{
  objectKey: string;
  contentType: TouchlineSocialArtifactMimeType;
  bytes: Uint8Array;
  artifactChecksum: string;
}>;

export type TouchlineSocialArtifactStorage = TouchlineSocialArtifactReader & Readonly<{
  uploadCreateOnly(input: TouchlineSocialArtifactUpload): Promise<TouchlineSocialArtifactLocator>;
}>;

function safeBaseUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("TL_SOCIAL_STORAGE_HTTPS_REQUIRED");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function safeObjectKey(value: string) {
  if (!value.startsWith("instagram/")
    || value.length > 1024
    || value.includes("..")
    || value.includes("\\")
    || value.split("/").some((segment) => !segment)) {
    throw new Error("TL_SOCIAL_STORAGE_KEY_INVALID");
  }
  const match = value.match(CONTENT_ADDRESS);
  if (!match) throw new Error("TL_SOCIAL_STORAGE_KEY_NOT_CONTENT_ADDRESSED");
  return value;
}

function expectedChecksumFromKey(objectKey: string) {
  const match = safeObjectKey(objectKey).match(CONTENT_ADDRESS);
  if (!match) throw new Error("TL_SOCIAL_STORAGE_KEY_NOT_CONTENT_ADDRESSED");
  return `sha256:${match[1]}`;
}

function objectUrl(baseUrl: string, objectKey: string, access: "read" | "write") {
  const path = [TOUCHLINE_SOCIAL_ARTIFACT_BUCKET, ...safeObjectKey(objectKey).split("/")]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const authenticated = access === "read" ? "authenticated/" : "";
  return `${baseUrl}/storage/v1/object/${authenticated}${path}`;
}

function normalizedContentType(value: string | null): TouchlineSocialArtifactMimeType | null {
  const mime = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mime === "image/png" || mime === "image/jpeg" ? mime : null;
}

function etag(value: string | null) {
  if (value === null) return null;
  if (value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("TL_SOCIAL_STORAGE_ETAG_INVALID");
  }
  return value;
}

function storageHeaders(serviceRoleKey: string, extra: HeadersInit = {}) {
  if (!serviceRoleKey.trim()) throw new Error("TL_SOCIAL_STORAGE_SERVICE_ROLE_REQUIRED");
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function isMissingObjectResponse(response: Response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  return String(payload?.statusCode ?? "") === "404"
    && String(payload?.error ?? "").toLowerCase() === "not_found";
}

async function probeObject(input: Readonly<{
  fetchImpl: StorageFetch;
  url: string;
  serviceRoleKey: string;
}>) {
  const response = await input.fetchImpl(input.url, {
    method: "GET",
    headers: storageHeaders(input.serviceRoleKey, { range: "bytes=0-0" }),
    cache: "no-store",
    signal: AbortSignal.timeout(TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS),
  });
  if (await isMissingObjectResponse(response)) return null;
  if (!response.ok) throw new Error(`TL_SOCIAL_STORAGE_PROBE_FAILED:${response.status}`);
  const contentRange = response.headers.get("content-range")?.match(/\/([0-9]+)$/)?.[1] ?? null;
  const contentLength = contentRange
    ?? (response.status === 206 ? null : response.headers.get("content-length"));
  await response.body?.cancel().catch(() => undefined);
  return {
    etag: etag(response.headers.get("etag")),
    contentType: normalizedContentType(response.headers.get("content-type")),
    contentLength,
  };
}

/**
 * Internal protocol adapter. Product code must import the server-only facade.
 * A service-role key is never retained outside this closure or returned.
 */
export function createTouchlineSocialArtifactStorageCore(input: Readonly<{
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: StorageFetch;
}>): TouchlineSocialArtifactStorage {
  const baseUrl = safeBaseUrl(input.supabaseUrl);
  const serviceRoleKey = input.serviceRoleKey;
  const fetchImpl = input.fetchImpl ?? fetch;

  async function readExact(locator: TouchlineSocialArtifactLocator): Promise<TouchlineSocialStoredArtifact> {
    if (locator.storageProvider !== "SUPABASE_STORAGE"
      || locator.bucket !== TOUCHLINE_SOCIAL_ARTIFACT_BUCKET) {
      throw new Error("TL_SOCIAL_STORAGE_LOCATOR_INVALID");
    }
    const url = objectUrl(baseUrl, locator.objectKey, "read");
    const head = await probeObject({ fetchImpl, url, serviceRoleKey });
    if (!head) throw new Error("TL_SOCIAL_STORAGE_OBJECT_MISSING");
    if (locator.etag !== null && head.etag !== null && locator.etag !== head.etag) {
      throw new Error("TL_SOCIAL_STORAGE_ETAG_CHANGED");
    }
    const conditionalEtag = locator.etag ?? head.etag;
    const response = await fetchImpl(url, {
      method: "GET",
      headers: storageHeaders(serviceRoleKey, conditionalEtag ? { "if-match": conditionalEtag } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS),
    });
    if (await isMissingObjectResponse(response)) throw new Error("TL_SOCIAL_STORAGE_OBJECT_MISSING");
    if (response.status === 412) throw new Error("TL_SOCIAL_STORAGE_ETAG_CHANGED");
    if (!response.ok) throw new Error(`TL_SOCIAL_STORAGE_GET_FAILED:${response.status}`);
    const contentType = normalizedContentType(response.headers.get("content-type")) ?? head.contentType;
    if (!contentType) throw new Error("TL_SOCIAL_STORAGE_CONTENT_TYPE_INVALID");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const declaredLength = response.headers.get("content-length") ?? head.contentLength;
    if (declaredLength !== null && Number(declaredLength) !== bytes.byteLength) {
      throw new Error("TL_SOCIAL_STORAGE_CONTENT_LENGTH_MISMATCH");
    }
    const checksum = checksumTouchlineSocialArtifact(bytes);
    if (checksum !== expectedChecksumFromKey(locator.objectKey)) {
      throw new Error("TL_SOCIAL_STORAGE_CONTENT_ADDRESS_MISMATCH");
    }
    const responseEtag = etag(response.headers.get("etag")) ?? head.etag;
    if (locator.etag !== null && responseEtag !== null && locator.etag !== responseEtag) {
      throw new Error("TL_SOCIAL_STORAGE_ETAG_CHANGED");
    }
    return {
      locator: Object.freeze({ ...locator, etag: locator.etag ?? responseEtag }),
      contentType,
      bytes,
    };
  }

  return Object.freeze({
    async uploadCreateOnly(upload) {
      const expectedChecksum = expectedChecksumFromKey(upload.objectKey);
      if (upload.artifactChecksum !== expectedChecksum
        || checksumTouchlineSocialArtifact(upload.bytes) !== expectedChecksum) {
        throw new Error("TL_SOCIAL_STORAGE_UPLOAD_CHECKSUM_MISMATCH");
      }
      const readUrl = objectUrl(baseUrl, upload.objectKey, "read");
      if (await probeObject({ fetchImpl, url: readUrl, serviceRoleKey })) {
        throw new Error("TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS");
      }
      const url = objectUrl(baseUrl, upload.objectKey, "write");
      const response = await fetchImpl(url, {
        method: "POST",
        headers: storageHeaders(serviceRoleKey, {
          "content-type": upload.contentType,
          "x-upsert": "false",
        }),
        body: Buffer.from(upload.bytes),
        cache: "no-store",
        signal: AbortSignal.timeout(TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS),
      });
      if ([400, 409, 412].includes(response.status)) {
        throw new Error("TL_SOCIAL_STORAGE_OBJECT_ALREADY_EXISTS");
      }
      if (!response.ok) throw new Error(`TL_SOCIAL_STORAGE_UPLOAD_FAILED:${response.status}`);
      const locator: TouchlineSocialArtifactLocator = Object.freeze({
        storageProvider: "SUPABASE_STORAGE",
        bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
        objectKey: upload.objectKey,
        etag: etag(response.headers.get("etag")),
      });
      const stored = await readExact(locator);
      return stored.locator;
    },
    readExact,
  });
}
