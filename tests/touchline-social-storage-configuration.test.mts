import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/qa/configure-touchline-social-draft-storage.mts", import.meta.url), "utf8");

test("social Storage configuration is QA-bound, private and create-only", () => {
  assert.match(source, /QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy"/);
  assert.match(source, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(source, /public: false/);
  assert.match(source, /fileSizeLimit: FILE_SIZE_LIMIT/);
  assert.match(source, /allowedMimeTypes: ALLOWED_MIME_TYPES/);
  assert.doesNotMatch(source, /upsert:\s*true/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)/);
});

test("destructive Storage removal is explicit and fails closed when not empty", () => {
  assert.match(source, /mode === "remove-empty"/);
  assert.match(source, /TL_SOCIAL_STORAGE_BUCKET_NOT_EMPTY/);
  assert.match(source, /deleteBucket\(BUCKET\)/);
  assert.doesNotMatch(source, /emptyBucket\(/);
});
