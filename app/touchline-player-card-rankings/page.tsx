import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import TouchlinePlayerCardRankingsPublication from "@/components/touchline/TouchlinePlayerCardRankingsPublication";
import { TouchlineCardLeadershipProvider } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "@/lib/touchlineArena/card-leadership-authority";
import { createClient } from "@/lib/supabase/server";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";

export const metadata = {
  title: "TouchLine Player Cards Ranking",
};

// Ranking publication happens independently of application deployments. Keep
// this public read model live so a newly published V3 snapshot is never
// hidden behind a build-time preseason render.
export const dynamic = "force-dynamic";

type PlayerCardRankingsProps = { searchParams: Promise<{ lang?: string }> };

export default async function TouchLinePlayerCardRankingsPage(props: PlayerCardRankingsProps) {
  return renderPlayerCardRankings(props, isTouchLineSiteLocalesEnabled("/touchline-player-card-rankings"));
}

async function renderPlayerCardRankings({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}, draftLocalesEnabled = false) {
  const authentication = (async () => {
    const supabase = await createClient();
    return supabase ? await supabase.auth.getUser() : { data: { user: null } };
  })();
  // This is the league-wide published-card ranking, never the signed-in
  // customer's private roster. Every surface receives the same V3 snapshot.
  // Observe public-read failures immediately, but preserve auth-first failure
  // precedence and never render owner links before identity is resolved.
  const publication = Promise.resolve().then(async () => {
    const activeRanking = await loadTouchLineActiveRanking();
    const rosterCards = await loadTouchLineRankedCardCatalog(activeRanking);
    return { activeRanking, rosterCards };
  }).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );
  const viewer = await authentication;
  const candidate = viewer.data.user;
  const verifiedViewer = "error" in viewer && viewer.error === null;
  const verifiedGuest = candidate === null && "error" in viewer
    && (viewer.error === null || viewer.error instanceof AuthSessionMissingError);
  const user = verifiedViewer && candidate && hasTouchLineArenaAccess(candidate)
    && typeof candidate.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.id)
    ? candidate : null;
  const accountLocaleContext: AccountLocaleContext = user
    ? { mode: "account", accountId: user.id }
    : verifiedGuest ? { mode: "guest" } : { mode: "unavailable" };
  const result = await publication;
  if (!result.ok) throw result.error;
  const { activeRanking, rosterCards } = result.value;
  const locale = resolveTouchlineCatalogueLocale((await searchParams).lang, draftLocalesEnabled);
  const canEditCardEngine = Boolean(user && isOwnerEmail(user.email));

  return (
    <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(activeRanking, null)} livePlayerUpdates>
    <main className="tl-card-rankings" dir="ltr">
      <TouchlineBrandHeader href={`/touchline-player-card-rankings?lang=${encodeURIComponent(locale)}`} locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} navigation={<TouchlineGlobalNavigation showAudioControl={false} locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="rankings" surface={resolveTouchlineGlobalNavigationSurface({ isAuthenticated: Boolean(user), isAdmin: Boolean(user && isOwnerEmail(user.email)) })} />} />
      <div className="tl-card-rankings-content">
      <TouchlineLivePresentationRefresh
        initialPlayerRankingSnapshotId={activeRanking.snapshotId}
      />

      <TouchlinePlayerCardRankingsPublication
        catalogue={rosterCards}
        seedRanking={activeRanking}
        locale={locale}
        draftLocalesEnabled={draftLocalesEnabled}
        canEditCardEngine={canEditCardEngine}
      />
      </div>
      <style>{`
        .tl-card-rankings {
          min-height: 100dvh;
          color: #f8fff5;
          background:
            radial-gradient(circle at 18% 14%, rgba(122,231,255,.16), transparent 28%),
            radial-gradient(circle at 82% 10%, rgba(181,255,75,.14), transparent 24%),
            linear-gradient(135deg, #020707 0%, #06120d 48%, #020403 100%);
          padding: 0;
        }

        .tl-card-rankings-content {
          padding: 42px 5vw 68px;
        }

        .tl-card-rankings-back,
        .tl-card-rankings-content a {
          text-decoration: none;
        }

        .tl-card-rankings-global-navigation {
          width: min(1540px, 100%);
        }

        .tl-card-rankings-back {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 999px;
          padding: 0 22px;
          color: #dfff9b;
                    font-size: 11px;
          font-weight: 950;          background: rgba(8,15,12,.68);
        }

        .tl-card-rankings-shell {
          width: min(1540px, 100%);
          margin: 38px auto 0;
          display: grid;
          gap: 18px;
        }

        .tl-card-rankings-hero,
        .tl-card-rankings-featured article,
        .tl-card-rankings-board {
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(4,12,9,.76), rgba(12,28,18,.58));
          box-shadow: 0 30px 90px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
        }

        .tl-card-rankings-hero {
          min-height: 320px;
          padding: clamp(24px, 4vw, 52px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(360px, .72fr);
          gap: 28px;
          align-items: end;
          overflow: hidden;
          position: relative;
        }

        .tl-card-rankings-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(181,255,75,.16), transparent 44%);
          pointer-events: none;
        }

        .tl-card-rankings-hero > * {
          position: relative;
          z-index: 1;
        }

        .tl-card-rankings-content span,
        .tl-card-rankings-board-head small {
          color: #b6ff4d;
                    font-size: 11px;
          font-weight: 950;        }

        .tl-card-rankings-content h1 {
          max-width: 880px;
          margin: 14px 0;
          font-size: 62px;
          line-height: 1;
        }

        .tl-card-rankings-content p {
          max-width: 720px;
          margin: 0;
          color: rgba(255,255,255,.68);
          font-size: 15px;
          line-height: 1.7;
          font-weight: 800;
        }

        .tl-card-rankings-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }

        .tl-card-rankings-metrics article {
          min-height: 112px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: rgba(0,0,0,.22);
          padding: 18px;
        }

        .tl-card-rankings-metrics strong {
          display: block;
          margin-top: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: clamp(26px, 3vw, 46px);
          line-height: 1;
        }

        .tl-card-rankings-metrics .is-mode strong {
          overflow: visible;
          font-size: clamp(20px, 2.2vw, 34px);
          line-height: 1.08;
          white-space: normal;
        }

        .tl-card-rankings-featured {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

.tl-card-rankings-featured article {
  position: relative;
  min-height: 520px;
  padding: 20px;
  display: grid;
  grid-template-rows: minmax(320px, 1fr) auto;
  justify-items: center;
  /* The ranking crown lives in the card's reserved top envelope. Never crop it. */
  overflow: visible;
}

        .tl-card-rankings-rank {
          position: absolute;
          left: 18px;
          top: 18px;
          z-index: 2;
          border: 1px solid rgba(181,255,75,.28);
          border-radius: 999px;
          background: rgba(0,0,0,.48);
          padding: 8px 11px;
        }

        .tl-card-rankings-card {
          width: min(280px, 82%);
          align-self: center;
        }

        .tl-card-rankings-card > div,
        .tl-card-rankings-row-card > div {
          width: 100% !important;
          height: auto !important;
          transform: none !important;
        }

        .tl-card-rankings-featured-copy {
          width: 100%;
          display: grid;
          gap: 8px;
        }

        .tl-card-rankings-featured-copy strong,
        .tl-card-rankings-board-head strong {
          color: white;
          font-size: 26px;
          line-height: .95;
          font-weight: 1000;
                  }

        .tl-card-rankings-featured-copy small,
        .tl-card-rankings-row-main small {
          color: rgba(255,255,255,.58);
          font-size: 11px;
          font-weight: 850;
                  }

        .tl-card-rankings-featured-copy div,
        .tl-card-rankings-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tl-card-rankings-featured-copy a,
        .tl-card-rankings-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.32);
          border-radius: 999px;
          background: rgba(181,255,75,.12);
          color: #efff9b;
          padding: 0 12px;
                    font-size: 9px;
          font-weight: 1000;        }

        .tl-card-rankings-board {
          padding: 22px;
        }

        .tl-card-rankings-board-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid rgba(255,255,255,.12);
          padding-bottom: 18px;
        }

        .tl-card-rankings-board-head > div > span {
          display: block;
          margin-bottom: 6px;
        }

        .tl-card-rankings-list {
          display: grid;
          gap: 10px;
          margin-top: 18px;
        }

        .tl-card-rankings-row {
          display: grid;
          grid-template-columns: 64px 86px minmax(0, 1fr) 126px auto;
          gap: 14px;
          align-items: center;
          min-height: 120px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: rgba(0,0,0,.18);
          padding: 12px 14px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.03);
        }

        .tl-card-rankings-featured article[data-ranking-tier-frame],
        .tl-card-rankings-row[data-ranking-tier-frame] {
          --touchline-perimeter-radius: 8px;
          position: relative;
          isolation: isolate;
          border-color: color-mix(in srgb, var(--tier-accent) 45%, rgba(255,255,255,.16));
          background:
            radial-gradient(circle at 50% 4%, color-mix(in srgb, var(--tier-accent) 18%, transparent), transparent 42%),
            linear-gradient(160deg, rgba(7,16,13,.96), rgba(1,4,4,.9));
        }

        .tl-card-rankings-row-rank {
          color: rgba(122,231,255,.82);
        }

        .tl-card-rankings-row-card {
          width: 74px;
        }

        .tl-card-rankings-row-main {
          min-width: 0;
        }

        .tl-card-rankings-row-main strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 22px;
          line-height: 1;
          font-weight: 1000;
                  }

        .tl-card-rankings-club {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .tl-card-rankings-club img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,.42));
        }

        .tl-card-rankings-club span {
          color: rgba(255,255,255,.78);
        }

        .tl-card-rankings-row b,
        .tl-card-rankings-row em {
          border-radius: 999px;
          background: rgba(0,0,0,.24);
          padding: 9px 11px;
          color: #efff9b;
          font-size: 12px;
          font-style: normal;
          font-weight: 1000;
                    white-space: nowrap;
        }

        .tl-card-rankings-row em {
          color: white;
        }

        @media (max-width: 1100px) {
          .tl-card-rankings-content h1 {
            font-size: 52px;
          }
        }

        @media (max-width: 980px) {
          .tl-card-rankings-content {
            padding: 26px 16px 42px;
          }

          .tl-card-rankings-hero,
          .tl-card-rankings-featured,
          .tl-card-rankings-row {
            grid-template-columns: 1fr;
          }

          .tl-card-rankings-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tl-card-rankings-featured article {
            min-height: 460px;
          }

          .tl-card-rankings-board-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .tl-card-rankings-row {
            gap: 10px;
          }
        }

        @media (max-width: 760px) {
          .tl-card-rankings-content h1 {
            font-size: 44px;
          }
        }

        @media (max-height: 500px) and (orientation: landscape) {
          .tl-card-rankings-content h1 {
            font-size: 40px;
          }
        }
      `}</style>
    </main>
    </TouchlineCardLeadershipProvider>
  );
}
