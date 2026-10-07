"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { formatTouchlineLocalKickoff } from "@/lib/touchlineArena/local-kickoff";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { clubHubFixtureRailRefreshMs, resolveClubHubFixtureRail } from "@/lib/touchlineArena/club-hub-fixture-rail";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchlineClubHubFixtureCopy } from "@/lib/touchlineArena/club-hub-fixture-i18n";

import styles from "./ClubHubPremiumPrototype.module.css";

type FixtureTeam = Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  logoUrl: string;
}>;

type Props = Readonly<{
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
  const router = useRouter();
  const timeZone = useSyncExternalStore(
    subscribeToBrowserTimeZone,
    readBrowserTimeZone,
    () => initialTimeZone,
  );

  const localKickoff = useMemo(
    () => formatTouchlineLocalKickoff(startsAt, timeZone, locale, draftLocalesEnabled),
    [locale, startsAt, timeZone, draftLocalesEnabled],
  );
  const rail = useMemo(
    () => resolveClubHubFixtureRail({ startsAt, status, homeScore, awayScore, liveMinute }, locale, undefined, draftLocalesEnabled),
    [awayScore, homeScore, liveMinute, locale, startsAt, status, draftLocalesEnabled],
  );
  const refreshMs = clubHubFixtureRailRefreshMs(rail, startsAt);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const refresh = window.setTimeout(() => router.refresh(), refreshMs);
    return () => window.clearTimeout(refresh);
  }, [refreshMs, router]);

  if (!localKickoff) return null;

  return (
    <article className={`${styles.nextFixtureCard} ${variant === "hero" ? styles.heroCompact : ""} ${className}`} data-state={rail.state}>
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
          <time dateTime={startsAt}>{rail.liveMinute ?? `${localKickoff.date} · ${localKickoff.time}`}</time>
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
