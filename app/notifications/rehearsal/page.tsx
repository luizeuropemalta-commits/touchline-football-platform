import { headers } from "next/headers";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { notFound } from "next/navigation";
import TouchlinePushRehearsal from "@/components/touchline/notifications/TouchlinePushRehearsal";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlinePushRehearsalCopy } from "@/lib/touchlineArena/push-rehearsal-i18n";

export const dynamic = "force-dynamic";

const QA = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const qaUrl = (value: string | undefined) => value === QA || value === `${QA}/`;

/** Read-only admission. This page never registers, grants consent or sends.
 * Missing installation permits explicit preparation only; the client cannot
 * send until its acknowledged installation equals the configured one, and the
 * POST boundary independently repeats all authoritative delivery checks.
 */
type RehearsalPageProps = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata(props: RehearsalPageProps) {
  return rehearsalMetadata(props, isTouchLineSiteLocalesEnabled("/notifications/rehearsal"));
}

async function rehearsalMetadata({ searchParams }: RehearsalPageProps, draftLocalesEnabled = false) {
  if (!draftLocalesEnabled) return { title: "TouchLine · Notification test", robots: { index: false, follow: false } };
  const requestedLocale = (await searchParams).lang;
  const copy = getTouchlinePushRehearsalCopy(Array.isArray(requestedLocale) ? requestedLocale[0] : requestedLocale, true);
  return { title: `TouchLine · ${copy.pageTitle}`, robots: { index: false, follow: false } };
}

export default async function PushRehearsalPage(props: RehearsalPageProps) {
  return renderPushRehearsalPage(props, isTouchLineSiteLocalesEnabled("/notifications/rehearsal"));
}

async function renderPushRehearsalPage({ searchParams }: {
  searchParams: Promise<{ lang?: string | string[] }>;
}, draftLocalesEnabled = false) {
  const env = process.env;
  const actor = env.TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID;
  const installation = env.TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID;
  const origin = env.TOUCHLINE_PUSH_REHEARSAL_ORIGIN;
  let configuredHost = "";
  try {
    if (origin?.startsWith("https://") && new URL(origin).origin === origin) configuredHost = new URL(origin).host;
  } catch { /* Invalid configuration stays closed. */ }
  if (env.TOUCHLINE_PUSH_REHEARSAL_ENABLED !== "true" || env.VERCEL_ENV === "production"
    || env.TOUCHLINE_DEPLOYMENT_MODE === "isolated-preview" || env.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === "isolated-preview"
    || !qaUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) || !qaUrl(env.NEXT_PUBLIC_SUPABASE_URL)
    || !actor || !UUID.test(actor) || !configuredHost
    || (installation !== undefined && !UUID.test(installation))) notFound();
  const requestHeaders = await headers();
  if (requestHeaders.get("host")?.toLowerCase() !== configuredHost) notFound();
  const context = await loadAccountLocaleContext();
  if (context.mode !== "account" || context.accountId.toLowerCase() !== actor.toLowerCase()) notFound();
  const requestedLocale = (await searchParams).lang;
  const locale = resolveTouchlineCatalogueLocale(Array.isArray(requestedLocale) ? requestedLocale[0] : requestedLocale, draftLocalesEnabled);
  const copy = getTouchlinePushRehearsalCopy(locale, draftLocalesEnabled);
  return <main dir="ltr" className="mx-auto max-w-2xl px-5 py-10 text-white">
    <h1>{copy.pageTitle}</h1>
    <p>{copy.pageDescription}</p>
    <TouchlinePushRehearsal accountId={context.accountId.toLowerCase()} configuredInstallationId={installation?.toLowerCase() ?? null} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
  </main>;
}
