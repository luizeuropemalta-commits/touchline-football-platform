export type NotificationQuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type NotificationQuietHoursState = "disabled" | "outside" | "quiet" | "invalid";

/**
 * Evaluate persisted preferences immediately before delivery, using the user's
 * zone rather than the server clock. This is only one delivery gate, not consent.
 * Missing/ambiguous configuration must not silently authorise an interruption.
 */
export function evaluateNotificationQuietHours(value: unknown, now: Date): NotificationQuietHoursState {
  if (value === undefined || !Number.isFinite(now.getTime())) return "invalid";
  const window = parseNotificationQuietHours(value);
  if (!window) return "invalid";
  if (!window.enabled) return "disabled";
  if (window.start === window.end) return "invalid";
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: window.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    if (!hour || !minute || !CLOCK.test(`${hour}:${minute}`)) return "invalid";
    const local = minutes(`${hour}:${minute}`);
    const start = minutes(window.start);
    const end = minutes(window.end);
    const quiet = start < end ? local >= start && local < end : local >= start || local < end;
    return quiet ? "quiet" : "outside";
  } catch {
    return "invalid";
  }
}

/** Validate the user's local clock window; never substitute a different zone. */
export function parseNotificationQuietHours(value: unknown): NotificationQuietHours | null {
  if (value === undefined) return { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== "boolean"
    || typeof input.start !== "string" || !CLOCK.test(input.start)
    || typeof input.end !== "string" || !CLOCK.test(input.end)
    || typeof input.timezone !== "string") return null;
  const timezone = input.timezone.trim();
  if (!timezone || timezone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(0);
  } catch {
    return null;
  }
  return { enabled: input.enabled, start: input.start, end: input.end, timezone };
}
