import type { TouchlineCommercialCompetition } from "./commercial-activation.ts";

export type TouchlineCentralLifecycleState = "COMING_SOON" | "PRE_REGISTRATION" | "OPEN" | "ACTIVE";
export type TouchlineCentralMessageCategory =
  | "MAINTENANCE"
  | "PAYMENT"
  | "CONTRACT"
  | "FUTURE_LEAGUE"
  | "ADMINISTRATIVE";
export type TouchlineCentralPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type TouchlineCentralAudience =
  | Readonly<{ kind: "GLOBAL" }>
  | Readonly<{ kind: "COMPETITION"; competition: TouchlineCommercialCompetition }>
  | Readonly<{ kind: "USER"; userId: string; competition: TouchlineCommercialCompetition | null }>;

export type TouchlineCentralLocalization = Readonly<{
  locale: string;
  title: string;
  body: string;
  deepLink: string | null;
}>;

export type TouchlineCentralMessage = Readonly<{
  id: string;
  origin: "ADMIN";
  publication: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  lifecycleState: TouchlineCentralLifecycleState;
  category: TouchlineCentralMessageCategory;
  priority: TouchlineCentralPriority;
  audience: TouchlineCentralAudience;
  publishedAt: string | null;
  localizations: readonly TouchlineCentralLocalization[];
}>;

export type TouchlineCentralInboxItem = Readonly<{
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  category: TouchlineCentralMessageCategory;
  lifecycleState: TouchlineCentralLifecycleState;
  priority: TouchlineCentralPriority;
  readAt: string | null;
}>;

const PRIORITY_WEIGHT: Record<TouchlineCentralPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

/** Accepts internal product paths only; deep links must never redirect away from TouchLine. */
export function isSafeTouchlineCentralDeepLink(value: string | null): boolean {
  if (value === null) return true;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  const path = value.split(/[?#]/, 1)[0];
  return ["/arena", "/club-owner", "/market-transfer", "/rankings", "/notifications"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function localizationFor(message: TouchlineCentralMessage, locale: string) {
  return message.localizations.find((entry) => entry.locale === locale)
    ?? message.localizations.find((entry) => entry.locale === "en")
    ?? message.localizations[0]
    ?? null;
}

function appliesToInbox(message: TouchlineCentralMessage, userId: string, competition: TouchlineCommercialCompetition) {
  if (message.audience.kind === "GLOBAL") return true;
  if (message.audience.kind === "COMPETITION") return message.audience.competition === competition;
  return message.audience.userId === userId
    && (message.audience.competition === null || message.audience.competition === competition);
}

/**
 * Pure consumer read model. The server must supply only messages that the
 * authenticated ClubOwner may read; this function performs no database write,
 * notification delivery, preference lookup or payment action.
 */
export function resolveTouchlineCentralInbox(input: {
  userId: string;
  competition: TouchlineCommercialCompetition;
  locale: string;
  messages: readonly TouchlineCentralMessage[];
  readAtByMessageId: Readonly<Record<string, string | null | undefined>>;
}): TouchlineCentralInboxItem[] {
  return input.messages
    .filter((message) => message.origin === "ADMIN" && message.publication === "PUBLISHED")
    .filter((message) => appliesToInbox(message, input.userId, input.competition))
    .map((message) => ({ message, localization: localizationFor(message, input.locale) }))
    .filter((entry): entry is { message: TouchlineCentralMessage; localization: TouchlineCentralLocalization } => (
      entry.localization !== null && isSafeTouchlineCentralDeepLink(entry.localization.deepLink)
    ))
    .sort((left, right) => {
      const priority = PRIORITY_WEIGHT[right.message.priority] - PRIORITY_WEIGHT[left.message.priority];
      if (priority) return priority;
      return Date.parse(right.message.publishedAt ?? "") - Date.parse(left.message.publishedAt ?? "");
    })
    .map(({ message, localization }) => ({
      id: message.id,
      title: localization.title,
      body: localization.body,
      deepLink: localization.deepLink,
      category: message.category,
      lifecycleState: message.lifecycleState,
      priority: message.priority,
      readAt: input.readAtByMessageId[message.id] ?? null,
    }));
}

/** Client intents may carry only a canonical message ID; the server owns the read receipt. */
export function parseTouchlineCentralReadIntent(body: unknown): { messageId: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).messageId;
  const messageId = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(messageId) ? { messageId } : null;
}
