import "server-only";
import { TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS, TOUCHLINE_FANTASY_BETA_BUDGET_EUR } from "@/lib/touchlineFantasy/market-plan-policy";

export type BetaEnrollmentRpc = {
  rpc(name: "touchline_fantasy_enroll_beta", args: Record<string, unknown>): PromiseLike<{
    data: unknown; error: { message?: string } | null;
  }>;
};

/** No plan, actor, target, currency or budget may come from the browser. */
export async function readBetaEnrollmentCommand(request: Request): Promise<boolean> {
  const length = request.headers.get("content-length");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > 128)) || request.signal.aborted) return false;
  const reader = request.body?.getReader();
  if (!reader) return false;
  const bytes = new Uint8Array(128);
  let used = 0, expired = false;
  const cancel = () => { expired = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, 3000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!expired) {
      const { value, done } = await reader.read();
      if (expired) return false;
      if (done) {
        const command: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used)));
        return command !== null && typeof command === "object" && !Array.isArray(command) && Object.keys(command).length === 0;
      }
      used += value.byteLength;
      if (used > bytes.length) { cancel(); return false; }
      bytes.set(value, used - value.byteLength);
    }
    return false;
  } catch { return false; }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

const ERRORS: Readonly<Record<string, number>> = {
  BETA_FORBIDDEN: 403, BETA_OWNER_EXCLUDED: 403,
  BETA_ACTIVE_PLAN_PRESERVED: 409, BETA_EXISTING_PLAN_REQUIRES_REVIEW: 409,
};

export async function enrollBeta(admin: BetaEnrollmentRpc, user: { id: string; email: string }) {
  const unavailable = { status: 503, body: { ok: false as const, error: "BETA_UNAVAILABLE" } };
  try {
    const { data, error } = await admin.rpc("touchline_fantasy_enroll_beta", {
      p_user_id: user.id, p_user_email: user.email.trim().toLowerCase(),
    });
    if (error) {
      const code = error.message?.trim();
      return code && Object.hasOwn(ERRORS, code)
        ? { status: ERRORS[code]!, body: { ok: false as const, error: code } } : unavailable;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unavailable;
    const result = data as Record<string, unknown>;
    if (result.ok !== true || result.planKey !== "beta" || result.status !== "active"
      || result.budgetEur !== TOUCHLINE_FANTASY_BETA_BUDGET_EUR || !Array.isArray(result.allowedClubTeamIds)
      || result.allowedClubTeamIds.length !== TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS.length
      || result.allowedClubTeamIds.some((value, index) => value !== TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS[index])) return unavailable;
    return { status: 200, body: { ok: true as const, planKey: "beta" as const, status: "active" as const,
      budgetEur: TOUCHLINE_FANTASY_BETA_BUDGET_EUR, allowedClubTeamIds: [...TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS] } };
  } catch { return unavailable; }
}
