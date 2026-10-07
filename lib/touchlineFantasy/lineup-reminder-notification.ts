import type { LineupReminderKind } from "./lineup-reminder-delivery-policy.ts";
import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { getTouchlineNotificationCopy } from "../touchlineArena/notification-i18n.ts";

/** Presentation only. Caller must establish current owned claim, readiness and
 * consent before transport. Never accept public copy or destinations from queue
 * payloads. Identity is the opaque notification UUID, not the account UUID.
 */
export function buildLineupReminderNotification(input: {
  identityId: string;
  kind: LineupReminderKind;
  locale: TouchLineLocale;
} | null) {
  if (!input || typeof input.identityId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.identityId)
    || !["missing_xi", "complete_unconfirmed"].includes(input.kind)) return null;
  const copy = getTouchlineNotificationCopy(input.locale);
  if (!copy) return null;
  return {
    title: copy.reminders.title, body: copy.reminders[input.kind],
    tag: `lineup:${input.identityId.toLowerCase()}`,
    href: `/clubowner?lang=${input.locale}`,
    update: false,
  };
}
