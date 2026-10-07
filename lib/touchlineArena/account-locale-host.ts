import { createAccountLocaleSelection } from "./account-locale-selection.ts";
import { isTouchLineLocaleApproved, type TouchLineLocale } from "./i18n.ts";

type Context = { mode: "account"; accountId: string } | { mode: "guest" | "demo" | "unavailable" };
type State = "loading" | "ready" | "saving" | "blocked";
type Options = {
  context: Context;
  request: (input: string, init: RequestInit) => Promise<Response>;
  apply: (locale: TouchLineLocale) => void;
  restore?: (locale: TouchLineLocale) => void;
  draftLocalesEnabled?: boolean;
  onChange: (state: State) => void;
};
const locales = new Set(["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function writableRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775806");
}

/** One host per mounted surface, shared by all its controls. The caller supplies
 * trusted context and must invalidate on identity change and dispose on cleanup.
 * Construction never applies a locale. A validated account read may restore
 * an existing complete preference through the optional restoration callback;
 * this does not write the account or substitute for explicit selection. Blocking
 * fences UI effects, not an already committed server write. Recovery needs a new
 * trusted context and host, never a retry with the old revision.
 */
export function createAccountLocaleHost({ context, request, apply, restore, onChange, draftLocalesEnabled = false }: Options) {
  const mode = context.mode;
  const accountId = context.mode === "account" ? context.accountId : undefined;
  let state: State = mode === "account" ? "loading" : mode === "guest" || mode === "demo" ? "ready" : "blocked";
  let ended = false;
  let loadStarted = false;
  let controller: ReturnType<typeof createAccountLocaleSelection> | undefined;
  const applyIfCurrent = (locale: TouchLineLocale) => { if (!ended) apply(locale); };
  if (mode === "guest" || mode === "demo") {
    controller = createAccountLocaleSelection({ mode, request, apply: applyIfCurrent, draftLocalesEnabled });
  }
  function change(next: State) {
    if (state === next) return;
    state = next;
    onChange(next);
  }
  function block() {
    ended = true;
    controller?.dispose();
    change("blocked");
  }
  return {
    getState: () => state,
    invalidate: block,
    dispose: block,
    async load(): Promise<void> {
      if (ended || mode !== "account" || loadStarted) return;
      loadStarted = true;
      if (typeof accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
        block(); return;
      }
      try {
        const response = await request("/api/notifications/preferences", {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        if (ended) return;
        if (!response.ok) { block(); return; }
        const receipt: unknown = await response.json();
        if (ended) return;
        if (!record(receipt) || receipt.ok !== true || !record(receipt.data)) { block(); return; }
        const data = receipt.data;
        if (!Object.hasOwn(data, "accountId") || data.accountId !== accountId
          || !Object.hasOwn(data, "gameLocale")
          || !(data.gameLocale === null || typeof data.gameLocale === "string" && locales.has(data.gameLocale))
          || !Object.hasOwn(data, "gameLocaleRevision") || !writableRevision(data.gameLocaleRevision)) {
          block(); return;
        }
        controller = createAccountLocaleSelection({ mode: "account", accountId,
          initialRevision: data.gameLocaleRevision, request, apply: applyIfCurrent, draftLocalesEnabled });
        if (!ended && typeof data.gameLocale === "string" && isTouchLineLocaleApproved(data.gameLocale)
          && (draftLocalesEnabled || data.gameLocale === "en-GB" || data.gameLocale === "pt-BR")) {
          restore?.(data.gameLocale);
        }
        if (ended) return;
        change("ready");
      } catch {
        if (!ended) block();
      }
    },
    async select(locale: unknown) {
      if (ended || state === "blocked") return "unconfirmed" as const;
      if (state === "loading" || state === "saving") return "busy" as const;
      if (typeof locale !== "string" || !isTouchLineLocaleApproved(locale)
        || (!draftLocalesEnabled && locale !== "en-GB" && locale !== "pt-BR")) return "invalid" as const;
      if (!controller) { block(); return "unconfirmed" as const; }
      change("saving");
      // onChange may synchronously invalidate this host.
      if (ended) return "unconfirmed" as const;
      const result = await controller.select(locale);
      if (ended) return "unconfirmed" as const;
      if (result === "saved" || result === "local") change("ready");
      else block();
      return result;
    },
  };
}
