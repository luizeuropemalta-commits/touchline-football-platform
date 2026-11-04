/** Syntactic test identity only. No project, credential, account or network is
 * created. The fake JWT signature is intentionally not cryptographic proof. */
export const SYNTHETIC_PRODUCTION_PROJECT_REF = "abcdefghijklmnopqrst";
export function syntheticProjectCredential(role: string, projectRef = SYNTHETIC_PRODUCTION_PROJECT_REF) {
  return [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ ref: projectRef, role })).toString("base64url"),
    Buffer.from("synthetic-fixture-signature").toString("base64url")].join(".");
}
export function syntheticProductionEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM",
    VERCEL_ORG_ID: "team_P1d7YNrmUObvbJJTJRlGcXoz", TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: "true",
    TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: SYNTHETIC_PRODUCTION_PROJECT_REF,
    SUPABASE_URL: `https://${SYNTHETIC_PRODUCTION_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${SYNTHETIC_PRODUCTION_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://touchline.com.br",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: syntheticProjectCredential("anon"),
    SUPABASE_SERVICE_ROLE_KEY: syntheticProjectCredential("service_role"),
    ...overrides,
  };
}
