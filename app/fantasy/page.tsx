import { redirect } from "next/navigation";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import FantasyGameweekClient from "./FantasyGameweekClient";

export const dynamic = "force-dynamic";

export default async function FantasyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedLanguage = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const locale = normalizeTouchLineLocale(requestedLanguage);
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/fantasy?lang=${locale}`)}`);
  const snapshot = await loadTouchlineFantasySnapshot(user);

  return (
    <main>
      <TouchlineGlobalNavigation
        locale={locale}
        currentRoute="fantasy"
        surface={resolveTouchlineGlobalNavigationSurface({ isAuthenticated: true, isAdmin: isOwnerEmail(user.email) })}
      />
      <FantasyGameweekClient initialSnapshot={snapshot} locale={locale} />
    </main>
  );
}
