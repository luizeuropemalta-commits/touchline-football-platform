import Image from "next/image";
import { ArrowUpRight, ShoppingBag, Ticket, UsersRound } from "lucide-react";

import type { TouchlineClubOfficialChannels } from "@/lib/touchlineArena/club-official-channels";
import { getTouchlineClubOfficialChannelsCopy } from "@/lib/touchlineArena/club-official-channels-i18n";

import styles from "./ClubHubOfficialChannel.module.css";

type ChannelKind = "store" | "tickets" | "membership" | "playerCollection" | "playerShirt";

type ClubHubOfficialChannelProps = {
  channels: TouchlineClubOfficialChannels;
  kind: ChannelKind;
  locale: string;
  draftLocalesEnabled?: boolean;
  className?: string;
  variant?: "default" | "hero";
};

/** A safe, first-party ClubHub exit. Omitted destinations render nothing. */
export default function ClubHubOfficialChannel({
  channels,
  kind,
  locale,
  draftLocalesEnabled = false,
  className,
  variant = "default",
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

  return (
    <section className={[styles.channel, presentation.compact ? styles.compact : "", isMembershipHero ? styles.hero : "", className].filter(Boolean).join(" ")} data-clubhub-official-channel={kind}>
      {isMembershipHero && channels.membershipHeroImage ? (
        <Image alt="" aria-hidden="true" className={styles.heroImage} fill sizes="(max-width: 980px) 100vw, 350px" src={channels.membershipHeroImage} />
      ) : null}
      {isMembershipHero ? <div className={styles.heroScrim} aria-hidden="true" /> : null}
      <div className={styles.copy}>
        <span className={styles.icon}><Icon aria-hidden="true" strokeWidth={1.8} /></span>
        <div>
          <h2>{presentation.title}</h2>
          {kind === "membership" ? <p>{copy.membershipDescription}</p> : null}
        </div>
      </div>
      <a href={destination.url} target="_blank" rel="noopener noreferrer" aria-label={`${presentation.action}. ${copy.externalSite}`}>
        <span>{presentation.action}</span>
        <ArrowUpRight aria-hidden="true" strokeWidth={2.1} />
      </a>
    </section>
  );
}
