import { cookies } from "next/headers";
import { arenaPersistenceKeys } from "@/lib/touchlineArena/arena-persistence-namespace";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { resolveTouchlineServerPageRoster } from "@/lib/touchlineArena/server-page-roster";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchLinePublishedTopEleven } from "@/lib/touchlineArena/card-ranking-server";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { formatTouchlineCommercialCardTotal } from "@/lib/touchlineArena/commercial-card-pricing";
import type { TouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import TouchLineTablesClient from "./touchline-tables-client";

export const metadata = { title: "TouchLine Tables" };

export default async function TouchLineTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let authoritativeRoster: Awaited<ReturnType<typeof readAuthoritativeTouchlineRoster>> | null = null;
  if (user && admin) {
    try {
      authoritativeRoster = await readAuthoritativeTouchlineRoster(admin, user.id);
    } catch {
      authoritativeRoster = null;
    }
  }
  const publicRosterCookieValue = user
    ? null
    : (await cookies()).get(arenaPersistenceKeys(
        { kind: "demo", demoId: "public-touchline-tables" },
        "club-owner-roster",
      ).cookieName)?.value;
  const rosterResolution = resolveTouchlineServerPageRoster({
    authenticatedUserId: user?.id,
    authoritativeRoster,
    publicCookieValue: publicRosterCookieValue,
  });
  if (rosterResolution.state === "unavailable") {
    console.error("[TouchLine] Tables roster unavailable", rosterResolution.error);
  }
  const rosterCards = rosterResolution.cards;
  const publishedTopEleven = await loadTouchLinePublishedTopEleven();
  // No fabricated owner or player leaderboard may be presented as a published
  // competition ranking. These remain empty until the audited ranking snapshot
  // is loaded through the server-owned publication path.
  const cardClubOwnerRank: never[] = [];
  const touchLineEnglandTable: never[] = [];
  const cardPlayerRank: never[] = [];
  const totalOwnerValue = 0;
  const copy = getTouchLineRankingsCopy(locale);

  return (
    <TouchLineTablesClient
      cardClubOwnerRank={cardClubOwnerRank}
      cardPlayerRank={cardPlayerRank}
      copy={copy}
      locale={locale}
      rankMode={copy.marketMode}
      publishedTopEleven={publishedTopEleven}
      navigationSurface={(user ? "authenticated" : "public") satisfies TouchlineGlobalNavigationSurface}
      rosterCards={rosterCards}
      totalCards={0}
      totalOwnerValue={formatTouchlineCommercialCardTotal({
        numericPrice: totalOwnerValue,
        competition: "england",
      })}
      touchLineEnglandTable={touchLineEnglandTable}
    />
  );
}
