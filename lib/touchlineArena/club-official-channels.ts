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
  "aston-villa": Object.freeze({
    membership: destination("https://membership.avfc.co.uk/", "https://membership.avfc.co.uk/"),
  }),
  bournemouth: Object.freeze({
    membership: destination("https://www.afcb.co.uk/tickets/memberships", "https://www.afcb.co.uk/tickets/memberships"),
  }),
  brighton: Object.freeze({
    membership: destination("https://www.brightonandhovealbion.com/myalbion-plus", "https://www.brightonandhovealbion.com/myalbion-plus"),
  }),
  brentford: Object.freeze({
    membership: destination("https://www.brentfordfc.com/en/memberships-2026-27", "https://www.brentfordfc.com/en/memberships-2026-27"),
  }),
  chelsea: Object.freeze({
    membership: destination("https://memberships.chelseafc.com/en", "https://memberships.chelseafc.com/en"),
  }),
  "coventry-city": Object.freeze({
    membership: destination("https://www.ccfc.co.uk/memberships", "https://www.ccfc.co.uk/"),
  }),
  "crystal-palace": Object.freeze({
    membership: destination("https://www.cpfc.co.uk/memberships/", "https://www.cpfc.co.uk/supporters/palace-tv-plus/"),
  }),
  everton: Object.freeze({
    membership: destination("https://www.evertonfc.com/ForeverBlue", "https://www.evertonfc.com/ForeverBlue"),
  }),
  fulham: Object.freeze({
    membership: destination("https://www.fulhamfc.com/news/2026/july/09/2026-27-memberships-now-on-sale/", "https://www.fulhamfc.com/news/2026/july/09/2026-27-memberships-now-on-sale/"),
  }),
  "hull-city": Object.freeze({
    tickets: destination("https://www.wearehullcity.co.uk/tickets/", "https://www.wearehullcity.co.uk/tickets/"),
    membership: destination("https://www.wearehullcity.co.uk/tickets/memberships", "https://www.wearehullcity.co.uk/tickets/"),
  }),
  "ipswich-town": Object.freeze({
    membership: destination("https://www.itfc.co.uk/news/2026/july/10/memberships-launched-for-26-27/", "https://www.itfc.co.uk/news/2026/july/10/memberships-launched-for-26-27/"),
  }),
  "leeds-united": Object.freeze({
    membership: destination("https://www.leedsunited.com/en/news/my-leeds-membership-update", "https://www.leedsunited.com/en/news/my-leeds-membership-update"),
  }),
  liverpool: Object.freeze({
    membership: destination("https://www.liverpoolfc.com/allred", "https://www.liverpoolfc.com/news/all-red-lfc-launches-new-membership-experience-ultimate-access"),
  }),
  "manchester-united": Object.freeze({
    membership: destination("https://tickets.manutd.com/memberships", "https://www.manutd.com/en/help/faqs/official-membership"),
  }),
  "newcastle-united": Object.freeze({
    membership: destination("https://www.newcastleunited.com/en/tickets/membership", "https://www.newcastleunited.com/en/tickets/membership"),
  }),
  "nottingham-forest": Object.freeze({
    membership: destination("https://www.nottinghamforest.co.uk/memberships/", "https://www.nottinghamforest.co.uk/memberships/"),
  }),
  sunderland: Object.freeze({
    membership: destination("https://www.safc.com/memberships/membership-hub", "https://www.safc.com/memberships/membership-hub"),
  }),
  "tottenham-hotspur": Object.freeze({
    membership: destination("https://www.tottenhamhotspur.com/membership", "https://www.tottenhamhotspur.com/membership"),
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
