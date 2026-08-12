/**
 * Public presentation contract for the launch-test checkout policy.
 *
 * The database remains the authority for whether this policy is enabled and
 * for the final payable amount.  This module only validates the narrow public
 * payload returned with a Market inventory snapshot, so the client never
 * guesses that a contract is free.
 */
export type TouchlineLaunchTestCheckoutPolicy = Readonly<{
  key: string;
  mode: "zero-tc-test";
  notice: string;
}>;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseTouchlineLaunchTestCheckoutPolicy(
  value: unknown,
): TouchlineLaunchTestCheckoutPolicy | null {
  const policy = recordOf(value);
  const key = typeof policy?.key === "string" ? policy.key.trim() : "";
  const mode = policy?.mode;
  const notice = typeof policy?.notice === "string" ? policy.notice.trim() : "";
  if (!key || mode !== "zero-tc-test" || !notice) return null;

  return Object.freeze({ key, mode, notice });
}

export function touchlineLaunchTestPayablePriceTc(
  referencePriceTc: number,
  policy: TouchlineLaunchTestCheckoutPolicy | null | undefined,
) {
  if (!Number.isInteger(referencePriceTc) || referencePriceTc < 0) return null;
  return policy?.mode === "zero-tc-test" ? 0 : referencePriceTc;
}
