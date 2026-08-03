/**
 * Deployment-scoped guard for the temporary external audit mirror.
 *
 * These values are deliberately server-only.  They are supplied to one Vercel
 * preview deployment and never configured on the canonical production site.
 */
export function isTouchlineAuditMode() {
  return process.env.TOUCHLINE_AUDIT_MODE === "true";
}

export function isTouchlineAuditExpired(now = Date.now()) {
  const expiresAt = process.env.TOUCHLINE_AUDIT_EXPIRES_AT;
  if (!expiresAt) return true;
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || now >= timestamp;
}

export function hasTouchlineAuditToken(token: string | null) {
  const expected = process.env.TOUCHLINE_AUDIT_TOKEN;
  return Boolean(expected && token && token === expected);
}
