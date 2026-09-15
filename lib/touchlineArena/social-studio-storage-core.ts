import { createHash } from "node:crypto";

import {
  STUDIO_REVIEW_BUCKET,
  STUDIO_REVIEW_MAX_BYTES,
  validateStudioMedia,
  type StudioMedia,
} from "./social-studio-contract.ts";

type StorageFetch = typeof fetch;
type SignedUrlFactory = (objectKey: string, expiresIn: number) => Promise<string>;
export type StudioReviewUploadManifest = Omit<StudioMedia, "etag">;

export type StudioReviewBucket = Readonly<{
  id: string;
  name: string;
  public: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
}>;

export type StudioReviewStorage = Readonly<{
  probeExact(media: StudioMedia): Promise<void>;
  readExact(media: StudioMedia): Promise<Uint8Array>;
  uploadCreateOnly(media: StudioReviewUploadManifest, bytes: Uint8Array): Promise<StudioMedia>;
  createSignedPreview(media: StudioMedia, expiresIn?: number): Promise<string>;
}>;

function checksum(bytes: Uint8Array) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeBaseUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(parsed.hostname)) throw new Error("TL_STUDIO_STORAGE_HTTPS_REQUIRED");
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function objectUrl(baseUrl: string, media: Pick<StudioMedia, "objectKey">, authenticated: boolean) {
  const path = [STUDIO_REVIEW_BUCKET, ...media.objectKey.split("/")].map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/${authenticated ? "authenticated/" : ""}${path}`;
}

function headers(serviceRoleKey: string, extra: HeadersInit = {}) {
  if (!serviceRoleKey.trim()) throw new Error("TL_STUDIO_STORAGE_SERVICE_ROLE_REQUIRED");
  return { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, ...extra };
}

function responseEtag(value: string | null) {
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("TL_STUDIO_STORAGE_ETAG_INVALID");
  return value;
}

function contentLength(response: Response) {
  const ranged = response.headers.get("content-range")?.match(/\/([0-9]+)$/)?.[1];
  const raw = ranged ?? response.headers.get("content-length");
  const value = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("TL_STUDIO_STORAGE_LENGTH_INVALID");
  return value;
}

function readResponseMetadata(response: Response, media: Pick<StudioMedia, "byteSize">) {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "video/mp4") throw new Error("TL_STUDIO_STORAGE_MIME_MISMATCH");
  if (contentLength(response) !== media.byteSize) throw new Error("TL_STUDIO_STORAGE_LENGTH_MISMATCH");
  return responseEtag(response.headers.get("etag"));
}

function assertBucket(bucket: StudioReviewBucket) {
  const mimeTypes = [...(bucket.allowed_mime_types ?? [])].sort();
  if (bucket.id !== STUDIO_REVIEW_BUCKET || bucket.name !== STUDIO_REVIEW_BUCKET || bucket.public !== false
    || bucket.file_size_limit !== STUDIO_REVIEW_MAX_BYTES || JSON.stringify(mimeTypes) !== JSON.stringify(["video/mp4"])) {
    throw new Error("TL_STUDIO_STORAGE_BUCKET_CONTRACT_MISMATCH");
  }
}

function assertMp4(bytes: Uint8Array) {
  const body = Buffer.from(bytes);
  if (body.length < 32 || body.toString("ascii", 4, 8) !== "ftyp" || !body.includes(Buffer.from("moov")) || !body.includes(Buffer.from("mdat"))) {
    throw new Error("TL_STUDIO_STORAGE_INVALID_MP4");
  }
}

export function createStudioReviewStorageCore(input: Readonly<{
  supabaseUrl: string;
  serviceRoleKey: string;
  getBucket: () => Promise<StudioReviewBucket>;
  createSignedUrl: SignedUrlFactory;
  fetchImpl?: StorageFetch;
}>): StudioReviewStorage {
  const baseUrl = safeBaseUrl(input.supabaseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  let bucketCheck: Promise<void> | null = null;
  const verifyBucket = () => bucketCheck ??= input.getBucket().then(assertBucket).catch((error) => {
    bucketCheck = null;
    throw error;
  });

  async function probeMetadata(media: StudioMedia | StudioReviewUploadManifest) {
    await verifyBucket();
    const response = await fetchImpl(objectUrl(baseUrl, media, true), {
      method: "GET",
      headers: headers(input.serviceRoleKey, { range: "bytes=0-0" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return false;
    if (!response.ok || ![200, 206].includes(response.status)) throw new Error(`TL_STUDIO_STORAGE_PROBE_FAILED:${response.status}`);
    const etag = readResponseMetadata(response, media);
    await response.body?.cancel().catch(() => undefined);
    return etag;
  }

  async function probe(media: StudioMedia) {
    validateStudioMedia(media);
    const etag = await probeMetadata(media);
    if (etag !== false && etag !== media.etag) throw new Error("TL_STUDIO_STORAGE_ETAG_MISMATCH");
    return etag !== false;
  }

  async function readExact(media: StudioMedia) {
    validateStudioMedia(media);
    await verifyBucket();
    const response = await fetchImpl(objectUrl(baseUrl, media, true), {
      method: "GET",
      headers: headers(input.serviceRoleKey, { "if-match": media.etag }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) throw new Error("TL_STUDIO_STORAGE_OBJECT_MISSING");
    if (response.status === 412) throw new Error("TL_STUDIO_STORAGE_ETAG_MISMATCH");
    if (!response.ok) throw new Error(`TL_STUDIO_STORAGE_READ_FAILED:${response.status}`);
    if (readResponseMetadata(response, media) !== media.etag) throw new Error("TL_STUDIO_STORAGE_ETAG_MISMATCH");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== media.byteSize || checksum(bytes) !== media.sha256) throw new Error("TL_STUDIO_STORAGE_CHECKSUM_MISMATCH");
    assertMp4(bytes);
    return bytes;
  }

  return Object.freeze({
    async probeExact(media) {
      if (!await probe(media)) throw new Error("TL_STUDIO_STORAGE_OBJECT_MISSING");
    },
    readExact,
    async uploadCreateOnly(media, bytes) {
      validateStudioMedia({ ...media, etag: "pending-upload-etag" });
      if (bytes.byteLength !== media.byteSize || checksum(bytes) !== media.sha256) throw new Error("TL_STUDIO_STORAGE_UPLOAD_CHECKSUM_MISMATCH");
      assertMp4(bytes);
      if (await probeMetadata(media)) throw new Error("TL_STUDIO_STORAGE_OBJECT_ALREADY_EXISTS");
      const response = await fetchImpl(objectUrl(baseUrl, media, false), {
        method: "POST",
        headers: headers(input.serviceRoleKey, { "content-type": "video/mp4", "x-upsert": "false" }),
        body: Buffer.from(bytes),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if ([400, 409, 412].includes(response.status)) throw new Error("TL_STUDIO_STORAGE_OBJECT_ALREADY_EXISTS");
      if (!response.ok) throw new Error(`TL_STUDIO_STORAGE_UPLOAD_FAILED:${response.status}`);
      const uploadedEtag = await probeMetadata(media);
      if (!uploadedEtag) throw new Error("TL_STUDIO_STORAGE_OBJECT_MISSING");
      const stored = { ...media, etag: uploadedEtag };
      await readExact(stored);
      return stored;
    },
    async createSignedPreview(media, expiresIn = 300) {
      if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 300) throw new Error("TL_STUDIO_STORAGE_SIGNED_TTL_INVALID");
      if (!await probe(media)) throw new Error("TL_STUDIO_STORAGE_OBJECT_MISSING");
      const raw = await input.createSignedUrl(media.objectKey, expiresIn);
      const signed = new URL(raw, baseUrl);
      const expectedPrefix = `/storage/v1/object/sign/${STUDIO_REVIEW_BUCKET}/`;
      if (signed.protocol !== "https:" || signed.origin !== new URL(baseUrl).origin || !signed.pathname.startsWith(expectedPrefix)
        || !signed.searchParams.get("token")) throw new Error("TL_STUDIO_STORAGE_SIGNED_URL_INVALID");
      return signed.toString();
    },
  });
}
