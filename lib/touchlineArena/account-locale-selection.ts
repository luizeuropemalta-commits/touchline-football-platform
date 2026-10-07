import { isTouchLineLocaleApproved, type TouchLineLocale } from "./i18n.ts";

type PublicLocale = TouchLineLocale;
type SelectionResult = "saved" | "local" | "busy" | "unconfirmed" | "invalid";
type Options = {
  mode: "account" | "guest" | "demo";
  initialRevision?: unknown;
  accountId?: unknown;
  draftLocalesEnabled?: boolean;
  request: (input: string, init: RequestInit) => Promise<Response>;
  apply: (locale: PublicLocale) => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writableRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775806");
}

function timestamp(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const wall = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(wall)
    && new Date(wall).toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Explicit selections only. Creating a controller never reads or writes an
 * account. All controls on one surface must share the same instance; a pending
 * write is not superseded by aborting it, since the server may still commit it.
 * Guest/demo mode must be decided by the host surface, not by cookie presence.
 * Account mode requires a revision from an authenticated read. After uncertainty,
 * a new instance requires another authenticated read; never infer revision zero.
 * The host must dispose on unmount/account change, then read the new account.
 * Disposal fences UI effects; it cannot cancel a server write already in flight.
 */
export function createAccountLocaleSelection({ mode, initialRevision, accountId, request, apply, draftLocalesEnabled = false }: Options) {
  let pending = false;
  let uncertain = false;
  let disposed = false;
  let revision = initialRevision;
  return {
    dispose() { disposed = true; },
    async select(locale: unknown): Promise<SelectionResult> {
      if (typeof locale !== "string" || !isTouchLineLocaleApproved(locale)
        || (!draftLocalesEnabled && locale !== "en-GB" && locale !== "pt-BR")) return "invalid";
      if (disposed) return "unconfirmed";
      if (pending) return "busy";
      if (uncertain) return "unconfirmed";
      if (mode !== "account" && mode !== "guest" && mode !== "demo") return "invalid";
      pending = true;
      try {
        if (mode !== "account") {
          apply(locale);
          return "local";
        }
        if (!writableRevision(revision)) return "unconfirmed";
        if (typeof accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) return "unconfirmed";
        const nextRevision = (BigInt(revision) + BigInt(1)).toString();
        uncertain = true;
        const response = await request("/api/notifications/preferences", {
          method: "PUT", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json", "X-Touchline-Expected-Account": accountId },
          body: JSON.stringify({ action: "set_game_locale", locale, expectedRevision: revision }),
        });
        if (!response.ok) return "unconfirmed";
        const receipt: unknown = await response.json();
        if (disposed || !record(receipt) || receipt.ok !== true || !record(receipt.data)
          || !Object.hasOwn(receipt.data, "gameLocaleRevision") || receipt.data.gameLocaleRevision !== nextRevision
          || receipt.data.gameLocale !== locale || !timestamp(receipt.data.updatedAt)) return "unconfirmed";
        revision = nextRevision;
        apply(locale);
        uncertain = false;
        return "saved";
      } catch {
        // Failure does not prove the server did not commit. No automatic retry
        // or guest fallback may claim an unconfirmed account write succeeded.
        return "unconfirmed";
      } finally {
        pending = false;
      }
    },
  };
}
