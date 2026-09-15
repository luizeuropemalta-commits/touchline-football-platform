import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { assertTouchlineSocialQaRuntime } from "./social-artifact-storage-server";
import { STUDIO_REVIEW_BUCKET } from "./social-studio-contract";
import { createStudioReviewStorageCore } from "./social-studio-storage-core";

export function createStudioReviewStorageFromEnvironment() {
  assertTouchlineSocialQaRuntime();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createAdminClient();
  if (!supabaseUrl || !serviceRoleKey || !admin) return null;
  return createStudioReviewStorageCore({
    supabaseUrl,
    serviceRoleKey,
    getBucket: async () => {
      const result = await admin.storage.getBucket(STUDIO_REVIEW_BUCKET);
      if (result.error || !result.data) throw new Error("TL_STUDIO_STORAGE_BUCKET_UNAVAILABLE");
      return result.data;
    },
    createSignedUrl: async (objectKey, expiresIn) => {
      const result = await admin.storage.from(STUDIO_REVIEW_BUCKET).createSignedUrl(objectKey, expiresIn);
      if (result.error || !result.data?.signedUrl) throw new Error("TL_STUDIO_STORAGE_SIGN_FAILED");
      return result.data.signedUrl;
    },
  });
}
