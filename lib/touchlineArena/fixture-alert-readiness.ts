/** The current server acknowledges saved interest only. Keep this boundary
 * separate from readiness facts: even a future `ready` string is not enough
 * to assert consent, the current installation, or actual delivery. */
export function isFixtureAlertRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775807");
}

export function parseFixtureAlertSavedInterest(input: unknown, expected: { accountId: string; fixtureId: string }, expectedSubscribed?: boolean, expectedRevision?: string):
  Readonly<{ subscribed: boolean; revision: string; delivery: "unavailable" }> | null {
  if (!expected || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.accountId)
    || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (!Object.hasOwn(body, "ok") || body.ok !== true || !Object.hasOwn(body, "delivery")
    || body.delivery !== "unavailable" || !Object.hasOwn(body, "data")
    || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) return null;
  const data = body.data as Record<string, unknown>;
  if (!Object.hasOwn(data, "accountId") || typeof data.accountId !== "string" || data.accountId.toLowerCase() !== expected.accountId.toLowerCase()
    || !Object.hasOwn(data, "fixtureId") || data.fixtureId !== expected.fixtureId) return null;
  if (!Object.hasOwn(data, "subscribed") || typeof data.subscribed !== "boolean"
    || (expectedSubscribed !== undefined && data.subscribed !== expectedSubscribed)) return null;
  if (!Object.hasOwn(data, "revision") || !isFixtureAlertRevision(data.revision)
    || (expectedRevision !== undefined && data.revision !== expectedRevision)) return null;
  return { subscribed: data.subscribed, revision: data.revision, delivery: "unavailable" };
}

/** View-model facts, NOT a server DTO and never evidence of physical delivery.
 * An adapter must obtain each fact from its existing verified source. The current
 * fixture API's delivery:'unavailable' must map to serverDelivery:'unavailable'. */
export type FixtureAlertFacts = Readonly<{
  contextKey: string; fixtureId: string;
  observation: "confirmed" | "loading" | "error";
  saved: boolean | null;
  serverDelivery: "ready" | "unavailable" | "unknown";
  browserSupported: boolean | null;
  installation: "ready" | "required" | "unknown";
  permission: "granted" | "denied" | "default" | "unknown";
  device: "registered" | "missing" | "unknown";
  preference: "enabled" | "consent-required" | "paused" | "unknown";
}>;
export type FixtureAlertStatus = "loading" | "error" | "unknown" | "server-unavailable" | "unsupported"
  | "install-required" | "permission-denied" | "permission-required" | "device-required"
  | "consent-required" | "paused" | "not-saved" | "active";
export type FixtureAlertReadiness = Readonly<{ status: FixtureAlertStatus; saved: boolean | null; active: boolean }>;

/** 'active' means prerequisites confirmed, never 'notification delivered'. */
export function deriveFixtureAlertReadiness(facts: FixtureAlertFacts): FixtureAlertReadiness {
  const result = (status: FixtureAlertStatus): FixtureAlertReadiness => ({ status,
    saved: facts.observation === "confirmed" && typeof facts.saved === "boolean" ? facts.saved : null,
    active: status === "active" });
  if (facts.observation === "loading") return result("loading");
  if (facts.observation !== "confirmed") return result("error");
  if (facts.serverDelivery === "unavailable") return result("server-unavailable");
  if (facts.serverDelivery !== "ready") return result("unknown");
  if (facts.installation === "required") return result("install-required");
  if (facts.browserSupported === false) return result("unsupported");
  if (facts.browserSupported !== true || facts.installation !== "ready") return result("unknown");
  if (facts.permission === "denied") return result("permission-denied");
  if (facts.permission === "default") return result("permission-required");
  if (facts.permission !== "granted") return result("unknown");
  if (facts.device === "missing") return result("device-required");
  if (facts.device !== "registered") return result("unknown");
  if (facts.preference === "paused") return result("paused");
  if (facts.preference === "consent-required") return result("consent-required");
  if (facts.preference !== "enabled" || typeof facts.saved !== "boolean") return result("unknown");
  return result(facts.saved ? "active" : "not-saved");
}

export type FixtureAlertIntent = "save-match" | "enable-match" | "remove-match";
export type FixtureAlertStep = "save-fixture" | "remove-fixture" | "request-permission" | "register-device" | "request-scoped-consent";
export type FixtureAlertOperation = Readonly<{ key: string; step: FixtureAlertStep; intent: FixtureAlertIntent }>;
export type FixtureAlertControl = Readonly<{
  contextKey: string; fixtureId: string; pending: FixtureAlertOperation | null; completedKeys: readonly string[];
}>;
export type FixtureAlertProposal = Readonly<{
  status: "proposed" | "no-op" | "blocked" | "duplicate" | "busy";
  control: FixtureAlertControl;
  operation?: FixtureAlertOperation;
}>;

/** One inert next-step proposal per user gesture. No permission, fetch or broad
 * preferences write is performed here. Consent needs a separate scoped screen. */
export function proposeFixtureAlertStep(control: FixtureAlertControl, facts: FixtureAlertFacts,
  intent: FixtureAlertIntent, gesture: Readonly<{ explicit: boolean; key: string }>): FixtureAlertProposal {
  const result = (status: FixtureAlertProposal["status"]): FixtureAlertProposal => ({ status, control });
  if (!gesture || gesture.explicit !== true || !/^[a-zA-Z0-9_-]{8,120}$/.test(gesture.key)
    || !control.contextKey || control.contextKey !== facts.contextKey || control.fixtureId !== facts.fixtureId
    || !/^[1-9]\d{0,14}$/.test(facts.fixtureId)
    || !["save-match", "enable-match", "remove-match"].includes(intent)) return result("blocked");
  if (control.completedKeys.includes(gesture.key)) return result("duplicate");
  if (control.pending) return result(control.pending.key === gesture.key && control.pending.intent === intent ? "duplicate" : "busy");
  if (facts.observation !== "confirmed" || typeof facts.saved !== "boolean") return result("blocked");
  let step: FixtureAlertStep;
  if (intent === "remove-match") {
    if (!facts.saved) return result("no-op");
    step = "remove-fixture";
  } else if (intent === "save-match") {
    if (facts.saved) return result("no-op");
    step = "save-fixture";
  } else {
    const status = deriveFixtureAlertReadiness(facts).status;
    if (status === "active") return result("no-op");
    if (status === "permission-required") step = "request-permission";
    else if (status === "device-required") step = "register-device";
    else if (status === "consent-required") step = "request-scoped-consent";
    else if (status === "not-saved") step = "save-fixture";
    else return result("blocked"); // No implicit unpause, install, or config change.
  }
  const operation = { key: gesture.key, step, intent };
  return { status: "proposed", control: { ...control, pending: operation }, operation };
}

/** Unknown timeout keeps the exact operation pending; never auto-retry a write.
 * Caller must reconcile it. Only explicit verified terminal outcomes settle it. */
export function settleFixtureAlertStep(control: FixtureAlertControl, key: string,
  outcome: "confirmed" | "rejected" | "unknown"): FixtureAlertControl {
  if (!control.pending || control.pending.key !== key || !["confirmed", "rejected"].includes(outcome)) return control;
  return { ...control, pending: null, completedKeys: [...control.completedKeys, key] };
}
