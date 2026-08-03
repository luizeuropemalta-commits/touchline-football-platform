import { createHmac, timingSafeEqual } from "node:crypto";

export const TOUCHLINE_PASSWORD_RECOVERY_COOKIE = "touchline-password-recovery-v1";
export const TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS = 15 * 60;

type PasswordRecoveryGrant = {
  userId: string;
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

export function createTouchLinePasswordRecoveryGrant(userId: string, now = Date.now()) {
  const grant: PasswordRecoveryGrant = {
    userId,
    issuedAt: now,
    expiresAt: now + TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  return `v1.${payload}.${signatureFor(payload)}`;
}

export function verifyTouchLinePasswordRecoveryGrant(
  token: string | null | undefined,
  userId: string,
  now = Date.now(),
) {
  if (!token) return false;
  const [version, payload, providedSignature, ...rest] = token.split(".");
  if (version !== "v1" || !payload || !providedSignature || rest.length) return false;

  try {
    const expected = Buffer.from(signatureFor(payload), "base64url");
    const provided = Buffer.from(providedSignature, "base64url");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return false;

    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PasswordRecoveryGrant>;
    return grant.userId === userId
      && Number.isFinite(grant.issuedAt)
      && Number.isFinite(grant.expiresAt)
      && Number(grant.issuedAt) <= now
      && Number(grant.expiresAt) > now
      && Number(grant.expiresAt) - Number(grant.issuedAt) === TOUCHLINE_PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000;
  } catch {
    return false;
  }
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
