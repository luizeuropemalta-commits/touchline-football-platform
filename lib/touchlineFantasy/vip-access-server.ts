import "server-only";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
export type GuestPlanKey = "standard" | "master" | "vip";
export type VipAccessCommand = Readonly<{ email: string; reason: string; commandId: string; planKey?: GuestPlanKey }>;
export type VipAccessGrant = Readonly<{
  commandId: string; targetUserId: string; planKey: GuestPlanKey; status: "active";
  source: "owner_vip_grant" | "owner_guest_grant"; expiresAt: null; grantedAt: string; accessReady: true;
}>;
export type VipAccessRpc = {
  rpc(name: "touchline_fantasy_grant_vip_access" | "touchline_fantasy_grant_guest_access", args: Record<string, unknown>): PromiseLike<{
    data: unknown; error: { message?: string } | null;
  }>;
};

export function parseVipAccessCommand(value: unknown): VipAccessCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort().join(",");
  if (keys !== "commandId,email,reason" && keys !== "commandId,email,planKey,reason") return null;
  if (Object.hasOwn(input,"planKey") && (typeof input.planKey !== "string" || !["standard","master","vip"].includes(input.planKey))) return null;
  if (typeof input.email !== "string" || typeof input.reason !== "string" || typeof input.commandId !== "string") return null;
  if (CONTROL.test(input.email) || CONTROL.test(input.reason)) return null;
  const email = input.email.trim().toLowerCase(), reason = input.reason.trim();
  const [local, domain, extra] = email.split("@");
  if (!local || !domain || extra !== undefined || email.length > 254 || local.length > 64
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    || local.startsWith(".") || local.endsWith(".") || local.includes("..")
    || !domain.includes(".") || domain.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || reason.length < 2 || reason.length > 240 || !UUID.test(input.commandId)) return null;
  return { email, reason, commandId: input.commandId.toLowerCase(),
    ...(Object.hasOwn(input,"planKey") ? {planKey:input.planKey as GuestPlanKey} : {}) };
}

/** A bounded body is read only after the caller authenticates the owner. */
export async function readVipAccessCommand(request: Request): Promise<VipAccessCommand | null> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const length = request.headers.get("content-length");
  if (contentType !== "application/json" || (length !== null && (!/^\d+$/.test(length) || Number(length) > 2048))) return null;
  if (request.signal.aborted) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const payload = new Uint8Array(2048);
  let used = 0, expired = false;
  const cancel = () => { expired = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, 3000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!expired) {
      const { value, done } = await reader.read();
      if (expired) return null;
      if (done) return parseVipAccessCommand(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload.subarray(0, used))));
      used += value.byteLength;
      if (used > payload.byteLength) { cancel(); return null; }
      payload.set(value, used - value.byteLength);
    }
    return null;
  } catch { return null; }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

const ERRORS: Readonly<Record<string, number>> = {
  VIP_INVALID_COMMAND: 400, VIP_FORBIDDEN: 403, VIP_TARGET_NOT_REGISTERED: 404,
  VIP_TARGET_EMAIL_UNVERIFIED: 409, VIP_TARGET_AMBIGUOUS: 409, VIP_IDEMPOTENCY_CONFLICT: 409,
  VIP_OWNER_EXCLUDED: 409, VIP_TARGET_METADATA_INVALID: 409,
  VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED: 409,
  VIP_COLLECTION_PLAN_CHANGE_REQUIRED: 409,
};
export async function grantVipAccess(admin: VipAccessRpc, actor: { id: string; email: string }, command: VipAccessCommand) {
  const unavailable = { status: 503, body: { ok: false as const, error: "VIP_UNAVAILABLE" } };
  try {
    const planKey = command.planKey ?? "vip";
    const source = planKey === "vip" ? "owner_vip_grant" : "owner_guest_grant";
    const { data, error } = await admin.rpc(command.planKey ? "touchline_fantasy_grant_guest_access" : "touchline_fantasy_grant_vip_access", {
      p_actor_id: actor.id, p_actor_email: actor.email.trim().toLowerCase(),
      p_target_email: command.email, p_reason: command.reason, p_command_id: command.commandId,
      ...(command.planKey ? {p_plan_key:command.planKey} : {}),
    });
    if (error) {
      const code = error.message?.trim();
      return code && Object.hasOwn(ERRORS, code)
        ? { status: ERRORS[code]!, body: { ok: false as const, error: code } } : unavailable;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unavailable;
    const row = data as Record<string, unknown>, grant = row.grant as Record<string, unknown> | null;
    if (row.ok !== true || typeof row.replay !== "boolean" || !grant || typeof grant !== "object"
      || grant.commandId !== command.commandId || typeof grant.targetUserId !== "string" || !UUID.test(grant.targetUserId)
      || grant.planKey !== planKey || grant.status !== "active" || grant.source !== source || grant.expiresAt !== null || grant.accessReady !== true
      || typeof grant.grantedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(grant.grantedAt) || !Number.isFinite(Date.parse(grant.grantedAt))) return unavailable;
    return { status: 200, body: { ok: true as const, replay: row.replay, grant: {
      commandId: command.commandId, targetUserId: grant.targetUserId, planKey,
      status: "active" as const, source, expiresAt: null,
      grantedAt: grant.grantedAt, accessReady: true as const,
    } } };
  } catch { return unavailable; }
}
