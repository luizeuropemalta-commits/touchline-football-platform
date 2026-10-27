import type { FixtureAlertStatusObservation } from "./fixture-alert-status.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** A scoped observation is not delivery authority. Reject future/forged active
 * contracts rather than silently treating configuration as operational proof. */
export function parseFixtureAlertStatus(input: unknown, expected: Readonly<{ accountId: string; fixtureId: string; installationId: string | null }>): FixtureAlertStatusObservation | null {
  if (!UUID.test(expected.accountId) || !/^[1-9]\d{0,14}$/.test(expected.fixtureId)
    || expected.installationId !== null && !UUID.test(expected.installationId)
    || !record(input) || !exact(input, ["ok", "version", "data"]) || input.ok !== true || input.version !== 1 || !record(input.data)) return null;
  const d = input.data;
  const installation = typeof d.installationId === "string" ? d.installationId.toLowerCase() : d.installationId;
  if (!exact(d, ["accountId", "fixtureId", "installationId", "subscribed", "configuration", "device", "preference", "operational", "delivery", "active"])
    || typeof d.accountId !== "string" || d.accountId.toLowerCase() !== expected.accountId.toLowerCase()
    || d.fixtureId !== expected.fixtureId
    || installation !== (expected.installationId?.toLowerCase() ?? null)
    || typeof d.subscribed !== "boolean" || typeof d.configuration !== "string" || !["configured", "unconfigured"].includes(d.configuration)
    || typeof d.device !== "string" || !["not-requested", "missing", "registered", "invalid"].includes(d.device)
    || (d.installationId === null) !== (d.device === "not-requested")
    || typeof d.preference !== "string" || !["consent-required", "paused", "enabled", "quiet-hours", "unconfirmed"].includes(d.preference)
    || d.operational !== "unknown" || d.delivery !== "unconfirmed" || d.active !== false) return null;
  return { accountId: d.accountId, fixtureId: expected.fixtureId, installationId: expected.installationId,
    subscribed: d.subscribed, configuration: d.configuration as FixtureAlertStatusObservation["configuration"],
    device: d.device as FixtureAlertStatusObservation["device"], preference: d.preference as FixtureAlertStatusObservation["preference"],
    operational: "unknown", delivery: "unconfirmed", active: false };
}

export type FixtureAlertStatusReason = "mobileAlertsUnavailable" | "deviceNotLinked" | "deviceMissing" | "deviceUnverified"
  | "consentRequired" | "alertsPaused" | "quietHours" | "preferenceUnconfirmed";

/** Present only observed impediments. Configuration, a saved registration and
 * an enabled preference do not prove permission, possession or push delivery. */
export function fixtureAlertStatusReasons(observation: FixtureAlertStatusObservation): FixtureAlertStatusReason[] {
  if (observation.active !== false || observation.delivery !== "unconfirmed" || observation.operational !== "unknown") return [];
  const reasons: FixtureAlertStatusReason[] = [];
  if (observation.configuration === "unconfigured") reasons.push("mobileAlertsUnavailable");
  if (observation.device === "not-requested") reasons.push("deviceNotLinked");
  else if (observation.device === "missing") reasons.push("deviceMissing");
  else if (observation.device === "invalid") reasons.push("deviceUnverified");
  if (observation.preference === "consent-required") reasons.push("consentRequired");
  else if (observation.preference === "paused") reasons.push("alertsPaused");
  else if (observation.preference === "quiet-hours") reasons.push("quietHours");
  else if (observation.preference === "unconfirmed") reasons.push("preferenceUnconfirmed");
  return reasons;
}
