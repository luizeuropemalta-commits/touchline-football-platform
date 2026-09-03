import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import type { TouchlineCoach } from "@/lib/football-data/types";
import type { TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import type { TouchlineClubSocialFeedPage } from "@/lib/touchlineArena/club-social-feed-server";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import type { TouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import TouchlineSocialMatchPreviewDraftView from "@/components/touchline/social/TouchlineSocialMatchPreviewDraft";
import TouchlineSocialFinalScoreDraftView, {
  type TouchlineSocialFinalScoreArtworkDraft,
} from "@/components/touchline/social/TouchlineSocialFinalScoreDraft";

import styles from "./ClubHubPremiumPrototype.module.css";
import ClubHubNextFixtureCard from "./ClubHubNextFixtureCard";
import ClubHubLikeButton from "./ClubHubLikeButton";
import ClubHubShareButton from "./ClubHubShareButton";

const navigation = [
  ["timeline", "Feed"],
  ["matchday", "Matchday"],
  ["rankings", "Rankings"],
  ["squad", "Squad"],
] as const;

const fixedTableRows = Array.from({ length: 20 }, (_, index) =>
  index + 1,
);

const squadGroups = [
  ["Goalkeepers", "GK"],
  ["Defenders", "DEF"],
  ["Midfielders", "MID"],
  ["Forwards", "FWD"],
] as const;

type ClubHubPremiumPrototypeProps = Readonly<{
  club: Readonly<{
    teamId: string;
    name: string;
    shortCode: string;
    logoUrl: string;
    accent: string;
    heroImageUrl: string;
  }>;
  clubCoach: Readonly<{
    state: string;
    name: string;
    nationality: string;
    capturedAt: string;
    card: Readonly<{
      coach: TouchlineCoach;
      countryCode3: string;
      slot: TouchlineArenaCoachSlot;
    }> | null;
  }>;
  clubLeader: Readonly<{
    canonicalPlayerId: string;
    name: string;
    totalRating: number;
    overallRank: number;
    positionRank: number;
    card: ClubOwnerSquadCard;
  }> | null;
  feed: TouchlineClubSocialFeedPage;
  fullTimePost: Readonly<{
    caption: string;
    draft: TouchlineSocialFinalScoreArtworkDraft;
  }> | null;
  featuredPost: Readonly<{
    caption: string;
    draft: TouchlineSocialMatchPreviewDraft;
  }> | null;
  initialTimeZone: string;
  nextFixture: Readonly<{
    state: string;
    startsAt: string;
    status: string;
    competition: string;
    roundName: string;
    homePosition: number | null;
    awayPosition: number | null;
    homeTeam: Readonly<{ teamId: string; name: string; shortCode: string; logoUrl: string }>;
    awayTeam: Readonly<{ teamId: string; name: string; shortCode: string; logoUrl: string }>;
  }>;
  snapshotMode: boolean;
  squad: Readonly<{
    state: string;
    capturedAt: string | null;
    degraded: boolean;
    players: readonly Readonly<{
      canonicalPlayerId: string;
      name: string;
      role: string;
      position: string | null;
      shirtNumber: number | null;
    }>[];
  }>;
  table: Readonly<{
    state: string;
    asOf: string | null;
    rows: readonly Readonly<{
      displayPosition: number | null;
      team: Readonly<{ teamId: string; name: string; logoUrl: string | null }>;
      played: number;
      goalDifference: number;
      points: number;
    }>[];
  }>;
}>;

function feedLabel(contentType: string) {
  return contentType.toLowerCase().replaceAll("_", " ");
}

function publicProfileSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ClubHubPremiumPrototype({ club, clubCoach, clubLeader, feed, fullTimePost, featuredPost, initialTimeZone, nextFixture, snapshotMode, squad, table }: ClubHubPremiumPrototypeProps) {
  const verifiedSquad = squad.players;
  const currentClubTableRow = table.rows.find((row) => row.team.teamId === club.teamId) ?? null;
  const clubDisplayName = club.name.replace(/ FC$/i, "");
  const squadCapturedAt = squad.capturedAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/Malta" }).format(new Date(squad.capturedAt))
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <Image alt="" className={styles.heroImage} fill priority sizes="100vw" src={club.heroImageUrl} />
          <div className={styles.heroShade} />
          <div className={styles.heroTopline}>
            <span>CLUBHUB · {snapshotMode ? "QA READ-ONLY SNAPSHOT" : "LOCAL CANONICAL READ"}</span>
            <span className={styles.verified}><ShieldCheck aria-hidden="true" /> TouchLine Verified</span>
          </div>
          <div className={styles.identity}>
            <div className={styles.crestVisual}>
              <Image alt={`${club.name} crest`} height={132} priority src={club.logoUrl} width={132} />
            </div>
            <div>
              <span className={styles.eyebrow}>Official club home</span>
              <h1>{club.name}</h1>
              <p>One club. One verified timeline. Every TouchLine moment in the same place.</p>
            </div>
          </div>
          <nav aria-label="ClubHub sections" className={styles.navigation}>
            {navigation.map(([target, label], index) => (
              <Link className={index === 0 ? styles.activeNav : undefined} href={`#${target}`} key={target}>
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <section className={styles.statusRail} aria-label="ClubHub status">
          <ClubHubNextFixtureCard
            awayTeam={nextFixture.awayTeam}
            currentClubTeamId={club.teamId}
            homeTeam={nextFixture.homeTeam}
            homePosition={nextFixture.homePosition}
            initialTimeZone={initialTimeZone}
            leagueTable={table}
            roundName={nextFixture.roundName}
            startsAt={nextFixture.startsAt}
            awayPosition={nextFixture.awayPosition}
          />
          <article className={styles.spotlightCard} data-clubhub-card-spotlight="coach">
            <header>
              <span>Current verified coach</span>
              <strong>{clubCoach.state === "ready" ? clubCoach.name : "Awaiting verified coach"}</strong>
            </header>
            {clubCoach.card ? (
              <div className={styles.coachCardVisual}>
                <TouchlineCoachCardZoom
                  coach={clubCoach.card.coach}
                  slot={clubCoach.card.slot}
                  clubName={club.name}
                  clubLogoUrl={club.logoUrl}
                  clubAccent={club.accent}
                  countryCode3={clubCoach.card.countryCode3}
                  locale="en-GB"
                  contract={null}
                  competition={null}
                  profileHref={`/touchline-coaches/${publicProfileSlug(clubCoach.card.coach.displayName)}?lang=en-GB`}
                  assetLoading="eager"
                />
              </div>
            ) : <p>No replacement is inferred.</p>}
            <small>{clubCoach.card ? `${clubCoach.nationality} · ${clubDisplayName} technical area` : "Canonical coach card unavailable"}</small>
          </article>
          <article className={styles.spotlightCard} data-clubhub-card-spotlight="club-leader">
            <header>
              <span>Club-leading TouchLine card</span>
              <strong>{clubLeader?.name ?? "Awaiting verified ranking"}</strong>
            </header>
            {clubLeader ? (
              <div className={styles.playerCardVisual}>
                <TouchlineGameweekCard card={clubLeader.card} locale="en-GB" displayWidth={164} />
              </div>
            ) : <p>No provisional score is shown.</p>}
            <small>{clubLeader ? `${clubLeader.totalRating.toFixed(2)} Total Rating · #${clubLeader.overallRank} overall` : "Canonical ranking card unavailable"}</small>
          </article>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.timeline} id="timeline" aria-labelledby="timeline-title">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Official club channel</span>
                <h2 id="timeline-title">The {clubDisplayName} feed</h2>
              </div>
              <span className={styles.livePill}><span /> Central TouchLine</span>
            </header>

            <div className={styles.feedModeBar} aria-label="ClubHub feed behaviour">
              <div>
                <span className={styles.feedSignal} aria-hidden="true" />
                <span><strong>Newest verified publication first</strong><small>One canonical revision for artwork, copy and destinations</small></span>
              </div>
              <div className={styles.feedRoute}>
                <b>Internal surfaces first</b>
                <span>Instagram and Facebook follow only after their separate gate</span>
              </div>
            </div>

            {fullTimePost ? (
              <article
                className={styles.featuredDraftPost}
                data-clubhub-preview="full-time"
                data-fanout-targets={[fullTimePost.draft.home.teamId, fullTimePost.draft.away.teamId].sort().join(",")}
                data-source-checksum={fullTimePost.draft.sourceChecksum}
              >
                <div className={styles.featuredDraftArt} aria-label="ClubHub full-time artwork">
                  <div className={styles.featuredDraftArtScale}>
                    <TouchlineSocialFinalScoreDraftView draft={fullTimePost.draft} />
                  </div>
                </div>
                <div className={styles.featuredDraftBody}>
                  <span>LOCAL FAN-OUT PROOF · SAME CANONICAL POST</span>
                  <h3>{fullTimePost.draft.home.name} {fullTimePost.draft.score.home}-{fullTimePost.draft.score.away} {fullTimePost.draft.away.name}</h3>
                  <p>{fullTimePost.caption}</p>
                  <time dateTime={fullTimePost.draft.sourceSnapshotAt}>One source revision · {fullTimePost.draft.sourceChecksum.slice(0, 20)}…</time>
                  <div className={styles.secondaryAudience}>
                    <b>{fullTimePost.draft.home.name} ClubHub</b>
                    <b>{fullTimePost.draft.away.name} ClubHub</b>
                    <b>TouchLine Social · separately gated</b>
                  </div>
                  <div className={styles.feedActions} aria-label="Post actions">
                    <ClubHubLikeButton />
                    <ClubHubShareButton title={`${fullTimePost.draft.home.name} ${fullTimePost.draft.score.home}-${fullTimePost.draft.score.away} ${fullTimePost.draft.away.name} · Full Time`} text={fullTimePost.caption} />
                  </div>
                </div>
              </article>
            ) : null}

            {featuredPost ? (
              <article
                className={styles.featuredDraftPost}
                data-clubhub-preview="match-preview"
                data-source-checksum={featuredPost.draft.sourceChecksum}
              >
                <div className={styles.featuredDraftArt} aria-label="ClubHub match preview artwork">
                  <div className={styles.featuredDraftArtScale}>
                    <TouchlineSocialMatchPreviewDraftView draft={featuredPost.draft} />
                  </div>
                </div>
                <div className={styles.featuredDraftBody}>
                  <span>LOCAL DRAFT · NOT PUBLISHED</span>
                  <h3>Arsenal v Chelsea</h3>
                  <p>{featuredPost.caption}</p>
                  <time dateTime={featuredPost.draft.sourceSnapshotAt}>Canonical revision · {featuredPost.draft.sourceChecksum.slice(0, 20)}…</time>
                  <div className={styles.secondaryAudience}><b>{clubDisplayName} ClubHub</b><b>All ClubOwners</b><b>TouchLine Social</b></div>
                  <div className={styles.feedActions} aria-label="Post actions">
                    <ClubHubLikeButton />
                    <ClubHubShareButton title={`${featuredPost.draft.home.club.name} v ${featuredPost.draft.away.club.name} · Match preview`} text={featuredPost.caption} />
                  </div>
                </div>
              </article>
            ) : null}

            {feed.state === "ready" ? (
              <div className={styles.canonicalFeed} id="matchday">
                {feed.items.map((item) => (
                  <article className={styles.feedPost} key={item.id}>
                    <div className={styles.feedMedia}>
                      <Image alt={`${feedLabel(item.contentType)} · ${club.name}`} fill sizes="(max-width: 780px) 90vw, 42vw" src={item.imageUrl} unoptimized />
                    </div>
                    <div className={styles.feedPostBody}>
                      <span>{feedLabel(item.contentType)}</span>
                      <p>{item.copy}</p>
                      <time dateTime={item.publishedAt}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Malta" }).format(new Date(item.publishedAt))}</time>
                      <div className={styles.secondaryAudience}><b>{clubDisplayName} ClubHub</b><b>All ClubOwners</b><b>TouchLine Social</b></div>
                      <div className={styles.feedActions} aria-label="Post actions">
                        <ClubHubLikeButton />
                        <ClubHubShareButton title={`${clubDisplayName} · ${feedLabel(item.contentType)}`} text={item.copy} />
                      </div>
                    </div>
                  </article>
                ))}
                {feed.nextCursor ? (
                  <Link className={styles.olderFeedLink} href={`/visual-qa/clubhub-premium-redesign?feedCursor=${encodeURIComponent(feed.nextCursor)}`}>
                    View earlier verified posts <ArrowUpRight aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className={styles.feedUnavailable} id="matchday" role="status">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>{feed.state === "empty" ? "No verified publication this week." : "The verified feed is temporarily unavailable."}</strong>
                  <p>No draft, simulated result or unverified message is substituted.</p>
                </div>
              </div>
            )}

            <footer className={styles.feedRetention} aria-label="ClubHub feed retention">
              <Clock3 aria-hidden="true" />
              <div>
                <span>Bounded active feed</span>
                <strong>Fourteen-day active window</strong>
                <p>The page loads at most twelve verified posts at a time. Older active posts load only when requested; expired Timeline content is removed while checksum, timestamps and retention reason remain in the audit tombstone.</p>
              </div>
            </footer>

            <section className={styles.standardModule} id="rankings" aria-labelledby="club-table-title">
              <header className={styles.moduleHeader}>
                <div>
                  <span className={styles.eyebrow}>Permanent TouchLine module</span>
                  <h2 id="club-table-title">League table</h2>
                </div>
                <span className={styles.moduleState}>{table.state === "ready" || table.state === "pending_no_final" ? "TouchLine Verified" : "Awaiting verified table"}</span>
              </header>
              <p className={styles.moduleIntro}>
                The league table keeps the same structure in every ClubHub. Positions and points appear only after canonical reconciliation.
              </p>
              <div className={styles.fullTable} role="table" aria-label="Verified league table">
                <div className={styles.fullTableHead} role="row">
                  <span role="columnheader">Pos</span><span role="columnheader">Club</span><span role="columnheader">P</span><span role="columnheader">GD</span><span role="columnheader">Pts</span>
                </div>
                {fixedTableRows.map((slot) => {
                  const row = table.rows.find((candidate) => candidate.displayPosition === slot) ?? null;
                  return (
                    <div className={row === currentClubTableRow ? `${styles.fullTableRow} ${styles.currentTableRow}` : styles.fullTableRow} role="row" key={slot}>
                      <span role="cell">{row?.displayPosition ? String(row.displayPosition).padStart(2, "0") : "—"}</span>
                      <span role="cell">{row?.team.logoUrl ? <Image alt="" height={22} src={row.team.logoUrl} width={22} /> : <i />} {row?.team.name ?? "Awaiting canonical club"}</span>
                      <span role="cell">{row?.played ?? "—"}</span><span role="cell">{row?.goalDifference ?? "—"}</span><span role="cell">{row?.points ?? "—"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.standardModule} id="squad" aria-labelledby="club-squad-title">
              <header className={styles.moduleHeader}>
                <div>
                  <span className={styles.eyebrow}>Permanent TouchLine module</span>
                  <h2 id="club-squad-title">Official squad</h2>
                </div>
                <span className={styles.moduleState}>{verifiedSquad.length ? (squad.degraded ? `Last verified · ${squadCapturedAt ?? "date unavailable"}` : "TouchLine Verified") : "Awaiting canonical squad"}</span>
              </header>
              <p className={styles.moduleIntro}>
                Every club uses this same TouchLine squad structure. Player cards and profiles appear only when identity, current club and squad status agree in the canonical revision.
              </p>
              <div className={styles.squadGrid}>
                {squadGroups.map(([label, code]) => {
                  const role = code === "GK" ? "goalkeeper" : code === "DEF" ? "defender" : code === "MID" ? "midfielder" : "forward";
                  const members = verifiedSquad.filter((player) => player.role === role);
                  return (
                    <section className={styles.squadGroup} aria-label={label} key={code}>
                      <header><span>{code}</span><strong>{label}</strong><small>{members.length || "—"}</small></header>
                      {members.length ? (
                        <div className={styles.squadMembers}>
                          {members.map((player) => <span key={player.canonicalPlayerId}><b>{player.shirtNumber ?? "—"}</b>{player.name}</span>)}
                        </div>
                      ) : (
                        <div className={styles.squadPlaceholder}><Users aria-hidden="true" /><span>Verified players will appear here</span></div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          </section>

          <aside className={styles.sidebar} aria-label={`${club.name} ClubHub overview`}>
            <section className={styles.clubPulse}>
              <span className={styles.eyebrow}>Club pulse</span>
              <h2>Inside {clubDisplayName}</h2>
              <div className={styles.pulseGrid}>
                <div><strong>—</strong><span>TouchLine rank</span></div>
                <div><strong>—</strong><span>Gameweek points</span></div>
                <div><strong>—</strong><span>Season points</span></div>
              </div>
              <p>Values remain closed until the current canonical snapshot is complete.</p>
            </section>

            <section className={styles.quickLinks}>
              <span className={styles.eyebrow}>Explore the club</span>
              <Link href="#squad"><Users aria-hidden="true" /><span><strong>Official squad</strong><small>Players, cards and profiles</small></span><ArrowUpRight aria-hidden="true" /></Link>
              <Link href="#matchday"><ShieldCheck aria-hidden="true" /><span><strong>Coach and technical area</strong><small>Current verified club coach</small></span><ArrowUpRight aria-hidden="true" /></Link>
              <Link href="#rankings"><Trophy aria-hidden="true" /><span><strong>Table and rankings</strong><small>League and TouchLine performance</small></span><ArrowUpRight aria-hidden="true" /></Link>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
