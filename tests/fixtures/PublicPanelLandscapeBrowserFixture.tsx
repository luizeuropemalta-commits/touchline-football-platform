import type { CSSProperties } from "react";
import { Shield } from "lucide-react";
import TouchlineMatchCentre from "../../components/touchline/match-centre/TouchlineMatchCentre";
import TouchlineDecorationMotion from "../../components/touchline/TouchlineDecorationMotion";
import TouchlineBrandHeader from "../../components/touchline/TouchlineBrandHeader";
import TouchlineGlobalNavigation from "../../components/touchline/TouchlineGlobalNavigation";
import TouchlinePlayerSocialActions from "../../components/touchline/social/TouchlinePlayerSocialActions";
import TouchlineEliteExactCard from "../../components/touchline/cards/TouchlineEliteExactCard";
import { TouchlineCardLeadershipProvider } from "../../components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "../../lib/touchlineArena/card-leadership-authority";
import { buildTouchlineRankingSnapshot } from "../../lib/touchlineArena/card-ranking";
import { parseTouchlineActiveRankingState } from "../../lib/touchlineArena/card-ranking-live";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../../lib/touchlineArena/card-rules";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
import liveStyles from "../../components/touchline/match-centre/touchline-match-centre.module.css";
import profileStyles from "../../app/touchline-players/[player]/player-profile.module.css";

// Synthetic identities/publication only. All visual components, CSS and requested
// files are production originals. No customer, provider or hosted service is used.
// Live is the complete client component. Profile reproduces its identity section's
// markup hierarchy with real card/header/social components; it is NOT the complete
// server page, its data loading, season feed or route-level authorization.
const now = "2026-11-03T12:00:00.000Z";
const playerId = "30000000-0000-4000-8000-000000000001";
const card: ClubOwnerSquadCard = {
  id: playerId, canonicalPlayerId: playerId, providerPlayerId: "990001",
  name: "Synthetic Landscape Player", shortName: "Landscape Player", role: "forward", position: "Centre Forward",
  clubName: "Arsenal", countryCode3: "ENG", shirtNumber: 9, touchlinePoints: 0, seasonTotalRating: 9,
  marketValue: "€1m", marketValueState: "verified",
  editorialCard: { tierKey: "sapphire-blue", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: now },
};
const snapshot = buildTouchlineRankingSnapshot({ snapshotId: "synthetic-public-panel", roundId: "synthetic-round", generatedAt: now,
  source: "simulation", status: "published", players: [{ playerId, providerPlayerId: "990001", name: card.name,
    clubName: "Arsenal", position: "ST", totalRating: 9, minutesPlayed: 90, appearances: 1 },
    ...["GK", "CB", "RB", "CM", "RW"].map((position, index) => ({
      playerId: `30000000-0000-4000-8000-00000000000${index + 2}`, providerPlayerId: String(990010 + index),
      name: `Synthetic ranking peer ${index}`, clubName: "Arsenal", position, totalRating: 7, minutesPlayed: 90, appearances: 1,
    }))] });
const ranking = parseTouchlineActiveRankingState({ phase: "ranked", leagueKey: "touchline-england", snapshotId: snapshot.snapshotId,
  roundId: snapshot.roundId, publishedAt: now, priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION, scoringVersion: "player_scoring_v4",
  coverageStatus: "complete", seasonId: "30000000-0000-4000-8000-000000000050", fixtureIds: ["990090"], expectedFixtureIds: ["990090"],
  totalScorePoints: 0, players: snapshot.players,
  leadershipDecision: { status: "unique-leader", scope: { rankingId: "touchline-player-overall", snapshotId: snapshot.snapshotId },
    leader: { subjectType: "player", subjectId: playerId } }, cardGoals: null });
if (!ranking) throw Error("Synthetic profile crown authority rejected");
const crest = "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png";
const awayCrest = "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-city.png";
const fixtures: TouchlinePublicFixture[] = Array.from({ length: 9 }, (_, index) => ({
  id: String(19700001 + index), providerId: String(19700001 + index), status: "NS",
  name: "Synthetic fixture with original stadium and crests", startsAt: `2026-11-${String(3 + index).padStart(2, "0")}T16:00:00Z`,
  roundName: "10", homeScore: 0, awayScore: 0,
  homeTeam: { id: "19", providerId: "19", name: "Synthetic Home Club", logoUrl: crest },
  awayTeam: { id: "9", providerId: "9", name: "Synthetic Away Club", logoUrl: awayCrest },
  venue: { id: "synthetic-venue", name: "Synthetic venue", homeClubName: "Synthetic Home Club", capacity: 60000,
    imageUrl: "/touchlineArena/stadiums/aerial/01-arsenal-emirates-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp" },
}));

export const selectors = {
  live: { panels: [`.${liveStyles.fixtureRail}`, `.${liveStyles.matchPanel}`],
    hero: `.${liveStyles.hero}`, rail: `.${liveStyles.fixtureScroller}`, decoration: `.${liveStyles.heroPerimeterTrace}` },
  profile: { panel: `.${profileStyles.identityBand}`, card: `.${profileStyles.cardFrame}`,
    crest: `.${profileStyles.identityCrest} img`, name: `.${profileStyles.identity} h1` },
};

function ProfileIdentity() {
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(ranking, null)}>
    <main className={profileStyles.page} dir="ltr" style={{ "--player-accent": "#5cc8ff", "--player-accent-secondary": "#b8ff46" } as CSSProperties}>
      <TouchlineBrandHeader href="/touchline-players/synthetic?lang=en-GB" locale="en-GB" accountLocaleContext={{ mode: "guest" }}
        navigation={<TouchlineGlobalNavigation locale="en-GB" currentRoute="playerProfile" surface="public" showAudioControl={false} />} />
      <div className={profileStyles.backgroundGlow} aria-hidden="true" />
      <div className={profileStyles.shell}>
        <section className={profileStyles.identityBand}>
          <div className={profileStyles.cardColumn}><div className={profileStyles.cardFrame}>
            <TouchlineEliteExactCard player={squadCardToExactPlayer(card)} runtimeLocaleOverride="en-GB"
              rankingMode="live" staticRenderScale={372 / 430} subscribeToRanking={false}
              hideMarketValuePanel={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} />
          </div></div>
          <div className={profileStyles.identity}>
            <p className={profileStyles.eyebrow}>ISOLATED SYNTHETIC PROFILE</p>
            <div className={profileStyles.identityHeading}>
              <div><h1>{card.name}</h1></div>
              <div className={profileStyles.currentClub}><span>Current club</span>
                <a className={profileStyles.identityCrest} href="/touchline-clubs/arsenal?lang=en-GB" aria-label="Open Arsenal">
                  <span className={profileStyles.identityCrestLogo}><img src={crest} alt="Arsenal" /></span><small>Open club</small>
                </a>
              </div>
            </div>
            <p className={profileStyles.roleLine}>Centre Forward · Arsenal · #9</p>
            <div className={profileStyles.socialActions}><TouchlinePlayerSocialActions providerId={card.id} playerName={card.name} accent="#5cc8ff" locale="en-GB" /></div>
            <p className={profileStyles.biography}>Synthetic layout inputs; no real player facts or account.</p>
            <div className={profileStyles.sourceLegend}><span><i className={profileStyles.realDot} />Official data</span><span><i className={profileStyles.touchlineDot} />TouchLine game</span></div>
            <div className={profileStyles.factGrid}>
              {["Position", "Born", "Height", "Weight", "Preferred foot", "Nationality", "Contract"].map(label => <div key={label} className={profileStyles.fact}>
                <span className={profileStyles.factIcon}><Shield aria-hidden="true" size={19} /></span><span><small>{label}</small><strong>Synthetic value</strong></span>
              </div>)}
            </div>
          </div>
        </section>
      </div>
    </main>
  </TouchlineCardLeadershipProvider>;
}

export default function PublicPanelLandscapeBrowserFixture({ surface }: { surface: "live" | "profile" }) {
  return <><TouchlineDecorationMotion />{surface === "live"
    ? <TouchlineMatchCentre initialFixtures={fixtures} initialFixtureId="19700001" initialLocale="en-GB"
      liveUpdates={false} canReadMatchDetail={false} initialNow={Date.parse(now)} initialTimeZone="UTC"
      accountLocaleContext={{ mode: "guest" }} initialSeasonName="Synthetic season" />
    : <ProfileIdentity />}</>;
}
