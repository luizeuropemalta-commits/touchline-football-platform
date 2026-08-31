import { createClient } from "@supabase/supabase-js";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const BUCKET = "touchline-social-drafts";
const FILE_SIZE_LIMIT = 12_582_912;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg"];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_SOCIAL_STORAGE_ENV_MISSING:${name}`);
  return value;
}

const mode = process.argv[2] ?? "verify";
if (!new Set(["create", "verify", "remove-empty"]).has(mode)) {
  throw new Error("TL_SOCIAL_STORAGE_MODE_INVALID");
}

const projectRef = required("TOUCHLINE_QA_SUPABASE_PROJECT_REF");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const urlRef = new URL(supabaseUrl).hostname.split(".", 1)[0];
if (process.env.VERCEL_ENV === "production"
  || projectRef !== QA_PROJECT_REF
  || urlRef !== QA_PROJECT_REF) {
  throw new Error("TL_SOCIAL_STORAGE_QA_BOUNDARY_MISMATCH");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertBucketContract(bucket: {
  id: string;
  name: string;
  public: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
}) {
  const actualMimeTypes = [...(bucket.allowed_mime_types ?? [])].sort();
  if (bucket.id !== BUCKET
    || bucket.name !== BUCKET
    || bucket.public !== false
    || bucket.file_size_limit !== FILE_SIZE_LIMIT
    || JSON.stringify(actualMimeTypes) !== JSON.stringify([...ALLOWED_MIME_TYPES].sort())) {
    throw new Error("TL_SOCIAL_STORAGE_BUCKET_CONTRACT_MISMATCH");
  }
}

if (mode === "create") {
  const existing = await client.storage.getBucket(BUCKET);
  if (existing.error && !/not found/i.test(existing.error.message)) {
    throw new Error("TL_SOCIAL_STORAGE_BUCKET_READ_FAILED");
  }
  if (!existing.data) {
    const created = await client.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: FILE_SIZE_LIMIT,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
    if (created.error) throw new Error("TL_SOCIAL_STORAGE_BUCKET_CREATE_FAILED");
  }
}

if (mode === "remove-empty") {
  const listed = await client.storage.from(BUCKET).list("", { limit: 1 });
  if (listed.error) throw new Error("TL_SOCIAL_STORAGE_BUCKET_LIST_FAILED");
  if ((listed.data ?? []).length > 0) throw new Error("TL_SOCIAL_STORAGE_BUCKET_NOT_EMPTY");
  const removed = await client.storage.deleteBucket(BUCKET);
  if (removed.error) throw new Error("TL_SOCIAL_STORAGE_BUCKET_REMOVE_FAILED");
  process.stdout.write(JSON.stringify({ projectRef, bucket: BUCKET, state: "REMOVED_EMPTY" }) + "\n");
  process.exit(0);
}

const verified = await client.storage.getBucket(BUCKET);
if (verified.error || !verified.data) throw new Error("TL_SOCIAL_STORAGE_BUCKET_MISSING");
assertBucketContract(verified.data);
process.stdout.write(JSON.stringify({ projectRef, bucket: BUCKET, state: "PRIVATE_CREATE_ONLY_READY" }) + "\n");
