/**
 * Official club destinations shown on public ClubHub pages.
 *
 * This is deliberately an allow-list rather than a generic `shopUrl` fallback:
 * a channel is rendered only after its public destination has been checked on
 * the club's own site. It does not represent a commercial partnership.
 */
export type TouchlineOfficialClubDestination = Readonly<{
  url: string;
  /** Source page used to verify that this is an official destination. */
  verifiedFrom: string;
}>;

export type TouchlineClubOfficialChannels = Readonly<{
  store?: TouchlineOfficialClubDestination;
  /** A player-specific product may replace this only after individual verification. */
  playerCollection?: TouchlineOfficialClubDestination;
  tickets?: TouchlineOfficialClubDestination;
  membership?: TouchlineOfficialClubDestination;
  /** Optional TouchLine-owned presentation artwork; never a club product card. */
  membershipHeroImage?: string;
}>;

const destination = (url: string, verifiedFrom: string): TouchlineOfficialClubDestination => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Official club destinations must use HTTPS.");
  return Object.freeze({ url: parsed.toString(), verifiedFrom });
};

const EMPTY_CHANNELS: TouchlineClubOfficialChannels = Object.freeze({});

/**
 * Each entry below has a separately verified, first-party public destination.
 * Keep unverified clubs absent: an empty channel is safer than a plausible URL.
 */
export const TOUCHLINE_OFFICIAL_CLUB_CHANNELS: Readonly<Record<string, TouchlineClubOfficialChannels>> = Object.freeze({
  arsenal: Object.freeze({
    store: destination("https://arsenaldirect.arsenal.com/", "https://arsenaldirect.arsenal.com/"),
    playerCollection: destination("https://arsenaldirect.arsenal.com/", "https://arsenaldirect.arsenal.com/"),
    tickets: destination("https://www.arsenal.com/tickets?field_arsenal_team_target_id=1&home_away=home", "https://www.arsenal.com/tickets?field_arsenal_team_target_id=1&home_away=home"),
    membership: destination("https://www.arsenal.com/membership", "https://www.arsenal.com/membership"),
  }),
  "hull-city": Object.freeze({
    tickets: destination("https://www.wearehullcity.co.uk/tickets/", "https://www.wearehullcity.co.uk/tickets/"),
  }),
  "manchester-city": Object.freeze({
    store: destination("https://shop.mancity.com/gb/en/home/", "https://www.mancity.com/tickets"),
    playerCollection: destination("https://shop.mancity.com/gb/en/home/", "https://www.mancity.com/tickets"),
    tickets: destination("https://www.mancity.com/tickets", "https://www.mancity.com/tickets"),
    membership: destination("https://www.mancity.com/memberships", "https://www.mancity.com/memberships"),
    membershipHeroImage: "/touchline/club-channels/manchester-city-membership-cutout-v3.png",
  }),
});

export function getTouchlineOfficialClubChannels(slug: string): TouchlineClubOfficialChannels {
  return TOUCHLINE_OFFICIAL_CLUB_CHANNELS[slug] ?? EMPTY_CHANNELS;
}
