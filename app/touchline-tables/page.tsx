import { cookies } from "next/headers";
import { buildDemoClubOwnerStandings, rankClubOwnerCards } from "@/lib/touchlineArena/demo-data";
import { arenaPersistenceKeys } from "@/lib/touchlineArena/arena-persistence-namespace";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { resolveTouchlineServerPageRoster } from "@/lib/touchlineArena/server-page-roster";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { formatTouchlineCommercialCardTotal } from "@/lib/touchlineArena/commercial-card-pricing";
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
  const ownerRows = buildDemoClubOwnerStandings(rosterCards);
  const totalCardPoints = rosterCards.reduce(
    (total, card) => total + card.touchlinePoints,
    0,
  );

  const cardClubOwnerRank = [...ownerRows]
    .sort((first, second) => {
      const valueDifference = second.squadValueTc - first.squadValueTc;
      if (valueDifference) return valueDifference;
      const pointsDifference = second.touchlinePoints - first.touchlinePoints;
      if (pointsDifference) return pointsDifference;
      return first.name.localeCompare(second.name);
    })
    .slice(0, 20);

  const touchLineEnglandTable = [...ownerRows]
    .sort((first, second) => {
      const pointsDifference = second.touchlinePoints - first.touchlinePoints;
      if (pointsDifference) return pointsDifference;
      const valueDifference = second.squadValueTc - first.squadValueTc;
      if (valueDifference) return valueDifference;
      return first.name.localeCompare(second.name);
    })
    .slice(0, 20);

  const cardPlayerRank = [...rosterCards].sort(rankClubOwnerCards).slice(0, 20);
  const copy = getTouchLineRankingsCopy(locale);
  const totalOwnerValue = ownerRows.reduce(
    (total, owner) => total + owner.squadValueTc,
    0,
  );

  return (
    <TouchLineTablesClient
      cardClubOwnerRank={cardClubOwnerRank}
      cardPlayerRank={cardPlayerRank}
      copy={copy}
      locale={locale}
      rankMode={totalCardPoints > 0 ? copy.pointsMode : copy.marketMode}
      rankingSnapshot={null}
      rosterCards={rosterCards}
      totalCards={rosterCards.length}
      totalOwnerValue={formatTouchlineCommercialCardTotal({
        numericPrice: totalOwnerValue,
        competition: "england",
      })}
      touchLineEnglandTable={touchLineEnglandTable}
    />
  );
}
