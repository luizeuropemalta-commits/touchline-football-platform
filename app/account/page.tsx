import { redirect } from "next/navigation";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

/** Navigation only: role comes from verified Auth, never query parameters.
 * Destination routes retain their own authorization and customer boundaries. */
export default async function AccountEntry({ searchParams }: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const draftLocalesEnabled = isTouchLineSiteLocalesEnabled("/account");
  const locale = resolveTouchlineCatalogueLocale(lang, draftLocalesEnabled);
  const destination = `/account?lang=${encodeURIComponent(locale)}`;
  const login = touchLineAuthEntryHref("/login", locale, destination, draftLocalesEnabled);
  const authentication = await (async () => {
    try {
      const client = await createClient();
      return client ? await resolveServerReadWithin(client.auth.getUser(), null, 8_000) : null;
    } catch {
      return null;
    }
  })();
  if (!authentication) redirect(`${login}&error=auth_unavailable`);
  if (authentication.error instanceof AuthSessionMissingError) redirect(login);
  if (authentication.error !== null) {
    redirect(`${login}&error=auth_unavailable`);
  }
  const user = authentication.data?.user;
  if (!user) redirect(login);
  // An authenticated admin must never initialize a customer's team.
  redirect(isOwnerEmail(user.email)
    ? touchLineAuthHref("/admin", locale)
    : touchLineAuthHref("/clubowner", locale, draftLocalesEnabled));
}
