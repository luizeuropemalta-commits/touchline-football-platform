import Image from "next/image";
import { ArrowUpRight, ShoppingBag, Ticket, UsersRound } from "lucide-react";

import type { TouchlineClubOfficialChannels } from "@/lib/touchlineArena/club-official-channels";
import { getTouchlineClubOfficialChannelsCopy } from "@/lib/touchlineArena/club-official-channels-i18n";

import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubHubOfficialChannel.module.css";

type ChannelKind = "store" | "tickets" | "membership" | "playerCollection" | "playerShirt";

type ClubHubOfficialChannelProps = {
  channels: TouchlineClubOfficialChannels;
  kind: ChannelKind;
  locale: string;
  draftLocalesEnabled?: boolean;
  className?: string;
  variant?: "default" | "hero" | "cover";
  clubIdentity?: { name: string; crestUrl?: string };
};

/** A safe, first-party ClubHub exit. Omitted destinations render nothing. */
export default function ClubHubOfficialChannel({
  channels,
  kind,
  locale,
  draftLocalesEnabled = false,
  className,
  variant = "default",
  clubIdentity,
}: ClubHubOfficialChannelProps) {
  const copy = getTouchlineClubOfficialChannelsCopy(locale, draftLocalesEnabled);
  const destination = kind === "playerShirt"
    ? undefined
    : kind === "playerCollection"
      ? channels.playerCollection
      : channels[kind];
  if (!destination) return null;

  const presentation = kind === "store" || kind === "playerCollection"
    ? { title: copy.storeTitle, action: kind === "store" ? copy.exploreCollection : copy.playerCollection, Icon: ShoppingBag, compact: kind === "playerCollection" }
    : kind === "tickets"
      ? { title: copy.ticketsTitle, action: copy.viewTickets, Icon: Ticket, compact: false }
      : { title: copy.membershipTitle, action: copy.learnMembership, Icon: UsersRound, compact: false };
  const Icon = presentation.Icon;
  const isMembershipHero = variant === "hero" && kind === "membership";
  const isCoverChannel = variant === "cover" && (kind === "membership" || kind === "store");

  return (
    <section dir={isCoverChannel ? "auto" : undefined} className={[styles.channel, presentation.compact ? styles.compact : "", isMembershipHero ? styles.hero : "", isCoverChannel ? styles.cover : "", className].filter(Boolean).join(" ")} data-clubhub-official-channel={kind}>
      {isMembershipHero && channels.membershipHeroImage ? (
        <Image
          alt=""
          aria-hidden="true"
          className={styles.heroImage}
          fill
          // Preserve the original local PNG, including its transparency.
          unoptimized
          sizes="(max-width: 980px) 100vw, 350px"
          src={channels.membershipHeroImage}
        />
      ) : null}
      {isMembershipHero && !channels.membershipHeroImage && clubIdentity?.crestUrl ? (
        <Image alt="" aria-hidden="true" className={styles.heroCrest} width={128} height={128} src={clubIdentity.crestUrl} unoptimized />
      ) : null}
      {isMembershipHero ? <div className={styles.heroScrim} aria-hidden="true" /> : null}
      <div className={styles.copy}>
        <span className={[styles.icon, kind === "membership" ? styles.membershipIcon : ""].filter(Boolean).join(" ")}>
          {kind === "membership" ? (
            <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 2.5 29 8v8.5c0 6-6.2 10.7-13 13-6.8-2.3-13-7-13-13V8Z" />
              <circle cx="16" cy="11" r="3" />
              <path d="M10.5 23v-2a5.5 5.5 0 0 1 11 0v2M8.5 10.5a2.5 2.5 0 0 0 0 5M23.5 10.5a2.5 2.5 0 0 1 0 5M6.5 21v-1a3.5 3.5 0 0 1 2-3M25.5 21v-1a3.5 3.5 0 0 0-2-3" />
            </svg>
          ) : <Icon aria-hidden="true" strokeWidth={1.8} />}
        </span>
        <div>
          <h2>{presentation.title}</h2>
          {kind === "membership" ? <p>{copy.membershipDescription}</p> : null}
        </div>
      </div>
      <a className={controls.link} href={destination.url} target="_blank" rel="noopener noreferrer" aria-label={`${presentation.action}. ${copy.externalSite}`}>
        <span>{presentation.action}</span>
        <ArrowUpRight aria-hidden="true" strokeWidth={2.1} />
      </a>
    </section>
  );
}
