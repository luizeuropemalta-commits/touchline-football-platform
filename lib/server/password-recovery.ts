import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TOUCHLINE_PASSWORD_RECOVERY_COOKIE = "touchline-password-recovery-v1";
export const TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60;
export const TOUCHLINE_PASSWORD_RECOVERY_INTENT_COOKIE = "touchline-password-recovery-intent-v1";
export const TOUCHLINE_PASSWORD_RECOVERY_INTENT_MAX_AGE_SECONDS = 60 * 60;

type PasswordRecoveryGrant = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

type PasswordRecoveryIntent = {
  emailHash: string;
  issuedAt: number;
  expiresAt: number;
};

function recoverySigningSecret() {
  const secret = (
    process.env.TOUCHLINE_AUTH_RECOVERY_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ""
  ).trim();
  if (!secret) throw new Error("Password recovery signing is not configured.");
  return secret;
}

function signatureFor(payload: string) {
  return createHmac("sha256", recoverySigningSecret()).update(payload).digest("base64url");
}

function normalizedEmailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("base64url");
}

function createSignedPayload(value: object) {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `v1.${payload}.${signatureFor(payload)}`;
}

function parseSignedPayload(token: string | null | undefined) {
  if (!token) return null;
  const [version, payload, providedSignature, ...rest] = token.split(".");
  if (version !== "v1" || !payload || !providedSignature || rest.length) return null;

  try {
    const expected = Buffer.from(signatureFor(payload), "base64url");
    const provided = Buffer.from(providedSignature, "base64url");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function createTouchLinePasswordRecoveryGrant(userId: string, now = Date.now()) {
  const grant: PasswordRecoveryGrant = {
    userId,
    issuedAt: now,
    expiresAt: now + TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000,
  };
  return createSignedPayload(grant);
}

export function verifyTouchLinePasswordRecoveryGrant(
  token: string | null | undefined,
  userId: string,
  now = Date.now(),
) {
  const grant = parseSignedPayload(token) as Partial<PasswordRecoveryGrant> | null;
  return grant?.userId === userId
    && Number.isFinite(grant.issuedAt)
    && Number.isFinite(grant.expiresAt)
    && Number(grant.issuedAt) <= now
    && Number(grant.expiresAt) > now
    && Number(grant.expiresAt) - Number(grant.issuedAt) === TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000;
}

export function createTouchLinePasswordRecoveryIntent(email: string, now = Date.now()) {
  const intent: PasswordRecoveryIntent = {
    emailHash: normalizedEmailHash(email),
    issuedAt: now,
    expiresAt: now + TOUCHLINE_PASSWORD_RECOVERY_INTENT_MAX_AGE_SECONDS * 1000,
  };
  return createSignedPayload(intent);
}

export function verifyTouchLinePasswordRecoveryIntent(
  token: string | null | undefined,
  email: string | null | undefined,
  now = Date.now(),
) {
  if (!email) return false;
  const intent = parseSignedPayload(token) as Partial<PasswordRecoveryIntent> | null;
  return intent?.emailHash === normalizedEmailHash(email)
    && Number.isFinite(intent.issuedAt)
    && Number.isFinite(intent.expiresAt)
    && Number(intent.issuedAt) <= now
    && Number(intent.expiresAt) > now
    && Number(intent.expiresAt) - Number(intent.issuedAt) === TOUCHLINE_PASSWORD_RECOVERY_INTENT_MAX_AGE_SECONDS * 1000;
}

export function touchLinePasswordRecoveryCookieOptions(requestUrl: string) {
  return {
    httpOnly: true,
    secure: new URL(requestUrl).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  };
}

export function touchLinePasswordRecoveryIntentCookieOptions(requestUrl: string) {
  return {
    ...touchLinePasswordRecoveryCookieOptions(requestUrl),
    maxAge: TOUCHLINE_PASSWORD_RECOVERY_INTENT_MAX_AGE_SECONDS,
  };
}
