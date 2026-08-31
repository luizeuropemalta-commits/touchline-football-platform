import "server-only";

import { createTouchlineSocialArtifactStorageCore } from "./social-artifact-storage-core.ts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";

export function assertTouchlineSocialQaRuntime() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configuredRef = process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF;
  if (!supabaseUrl || !configuredRef) throw new Error("TL_SOCIAL_QA_BOUNDARY_NOT_CONFIGURED");
  const urlRef = new URL(supabaseUrl).hostname.split(".", 1)[0];
  if (process.env.VERCEL_ENV === "production"
    || configuredRef !== QA_PROJECT_REF
    || urlRef !== QA_PROJECT_REF) {
    throw new Error("TL_SOCIAL_QA_BOUNDARY_MISMATCH");
  }
}

/** QA-only factory. Secrets stay inside the server-only Storage closure. */
export function createTouchlineSocialArtifactStorageFromEnvironment() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  assertTouchlineSocialQaRuntime();
  return createTouchlineSocialArtifactStorageCore({ supabaseUrl, serviceRoleKey });
}

export {
  createTouchlineSocialArtifactStorageCore as createTouchlineSocialArtifactStorage,
  type TouchlineSocialArtifactStorage,
  type TouchlineSocialArtifactUpload,
} from "./social-artifact-storage-core.ts";
