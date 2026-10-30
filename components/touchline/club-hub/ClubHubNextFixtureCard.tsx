"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { useTouchlinePublishedLive } from "@/lib/touchlineArena/sports-publication-client";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";

import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { clubHubFixtureRailRefreshMs, resolveClubHubFixtureRail } from "@/lib/touchlineArena/club-hub-fixture-rail";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { selectClubHubNextFixture } from "@/lib/touchlineArena/club-hub-next-fixture";
import { getTouchlineClubHubProfileCopy } from "@/lib/touchlineArena/club-hub-profile-i18n";
import { getTouchlineClubHubFixtureCopy } from "@/lib/touchlineArena/club-hub-fixture-i18n";

import styles from "./ClubHubPremiumPrototype.module.css";

type FixtureTeam = Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  logoUrl: string;
}>;

type Props = Readonly<{
  initialFixture?: TouchlinePublicFixture | null;
  liveUpdates?: boolean;
  /** The tickets rail never becomes a past-result card. */
  nextOnly?: boolean;
  awayTeam: FixtureTeam;
  awayPosition: number | null;
  homeTeam: FixtureTeam;
  homePosition: number | null;
  initialTimeZone: string;
  roundName: string;
  startsAt: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  liveMinute?: number;
  locale?: TouchLineLocale;
  draftLocalesEnabled?: boolean;
  previewHref?: string | null;
  className?: string;
  venueName?: string | null;
  venueImageUrl?: string | null;
  variant?: "rail" | "hero";
  showPositions?: boolean;
}>;

const subscribeToBrowserTimeZone = () => () => undefined;

function readBrowserTimeZone() {
  return normalizeTouchlineMatchCentreTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

export default function ClubHubNextFixtureCard({
  initialFixture = null,
  liveUpdates = false,
  nextOnly = false,
  awayTeam,
  awayPosition,
  homeTeam,
  homePosition,
  initialTimeZone,
  locale = "en-GB",
  draftLocalesEnabled = false,
  previewHref = "/visual-qa/clubhub-next-fixture-post",
  className = "",
  roundName,
  startsAt,
  status,
  homeScore,
  awayScore,
  liveMinute,
  venueName = null,
  venueImageUrl = null,
  variant = "rail",
  // The rail has one job: make the verified fixture readable at a glance.
  // League positions belong in the table immediately below it.
  showPositions = false,
}: Props) {
  const copy = getTouchlineClubHubFixtureCopy(locale, draftLocalesEnabled);
  const timeZone = useSyncExternalStore(
    subscribeToBrowserTimeZone,
    readBrowserTimeZone,
    () => initialTimeZone,
  );

  const [mountedAt] = useState(() => Date.now());
  const enabled = liveUpdates && Boolean(initialFixture?.providerId && initialFixture.homeTeam?.providerId
    && initialFixture.awayTeam?.providerId && initialFixture.startsAt === startsAt);
  const { fixtures, receivedAt } = useTouchlinePublishedLive(initialFixture ? [initialFixture] : [], null, mountedAt, enabled, null, null, nextOnly);
  const now = receivedAt ?? mountedAt;
  const facts = enabled ? fixtures[0] : null;
  const displayedStartsAt = nextOnly ? facts?.startsAt ?? startsAt : startsAt;
  const localKickoff = useMemo(
    () => formatTouchlineLocalKickoff(displayedStartsAt, timeZone, locale, draftLocalesEnabled),
    [locale, displayedStartsAt, timeZone, draftLocalesEnabled],
  );
  const rail = resolveClubHubFixtureRail(facts
    ? { startsAt: displayedStartsAt, status: facts.status, homeScore: facts.homeScore, awayScore: facts.awayScore, liveMinute: facts.liveMinute }
    : { startsAt, status, homeScore, awayScore, liveMinute }, locale, now, draftLocalesEnabled);
  const refreshMs = clubHubFixtureRailRefreshMs(rail, displayedStartsAt, now);
  const contextWake = rail.state === "upcoming" && Date.parse(displayedStartsAt) - now > 60 * 60 * 1_000;

  if (nextOnly && !selectClubHubNextFixture([
    facts ?? { id: initialFixture?.id ?? "scheduled", startsAt, status },
  ], () => true, now)) {
    return <article className={`${styles.nextFixtureCard} ${className}`} data-state="awaiting" role="status">
      {enabled ? <TouchlineLivePresentationRefresh serverRefreshScope={`${initialFixture?.providerId}:${startsAt}`} /> : null}
      <div className={styles.nextFixtureHeading}><CalendarDays aria-hidden="true" /><span>{copy.nextMatch}</span></div>
      <p>{getTouchlineClubHubProfileCopy(locale, draftLocalesEnabled).nextMatchChecking}</p>
    </article>;
  }
  if (!localKickoff) return null;

  return (
    <article className={`${styles.nextFixtureCard} ${variant === "hero" ? styles.heroCompact : ""} ${className}`} data-state={rail.state}>
      {enabled ? <TouchlineLivePresentationRefresh
        serverRefreshScope={`${initialFixture?.providerId}:${startsAt}`}
        serverRefreshAfterMs={contextWake ? null : refreshMs}
        serverRefreshAt={contextWake && refreshMs !== null ? now + refreshMs : null}
      /> : null}
      <div className={styles.nextFixtureHeading}>
        <CalendarDays aria-hidden="true" />
        <span>{rail.heading} · {roundName}</span>
      </div>
      <div className={styles.nextFixtureTeams}>
        <span className={styles.nextFixtureClub}>
          <Image alt={copy.crestAlt.replace("{name}", () => homeTeam.name)} height={64} src={homeTeam.logoUrl} width={64} />
          <b>{homeTeam.name}</b>
          {showPositions ? <small>{homePosition}</small> : null}
        </span>
        <em data-score={rail.score ? "verified" : undefined}>{rail.score ?? "VS"}</em>
        <span className={styles.nextFixtureClub}>
          <Image alt={copy.crestAlt.replace("{name}", () => awayTeam.name)} height={64} src={awayTeam.logoUrl} width={64} />
          <b>{awayTeam.name}</b>
          {showPositions ? <small>{awayPosition}</small> : null}
        </span>
      </div>
      {rail.state !== "finished" ? (
        <div className={styles.nextFixtureKickoff}>
          <time dateTime={displayedStartsAt}>{rail.liveMinute ?? `${localKickoff.date} · ${localKickoff.time}`}</time>
          <small>{rail.state === "upcoming"
            ? `${copy.localTime} · ${localKickoff.zoneName}`
            : copy.verifiedScore}</small>
        </div>
      ) : null}
      <div className={styles.nextFixtureVenue} data-state={venueName ? "verified" : "pending"}>
        {venueImageUrl ? (
          <Image
            alt=""
            aria-hidden="true"
            className={styles.nextFixtureVenueImage}
            height={variant === "hero" ? 112 : 96}
            sizes={variant === "hero" ? "96px" : "80px"}
            src={venueImageUrl}
            width={variant === "hero" ? 112 : 96}
          />
        ) : null}
        <span className={styles.nextFixtureVenueCopy}>
          <MapPin aria-hidden="true" />
          {variant === "hero" ? <small>{copy.stadium}</small> : null}
          <span>{venueName ?? copy.venuePending}</span>
        </span>
      </div>
      {previewHref ? (
        <Link className={styles.nextFixturePreviewLink} href={previewHref}>
          {copy.previewLink}
        </Link>
      ) : null}
    </article>
  );
}
