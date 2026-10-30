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
    tickets: destination("https://tickets.avfc.co.uk/", "https://www.avfc.co.uk/villa-park/first-time"),
    store: destination("https://shop.avfc.co.uk/en/", "https://www.avfc.co.uk/"),
    membership: destination("https://membership.avfc.co.uk/", "https://membership.avfc.co.uk/"),
  }),
  bournemouth: Object.freeze({
    tickets: destination("https://www.afcb.co.uk/tickets/", "https://www.afcb.co.uk/tickets/ticket-office-opening-hours"),
    store: destination("https://superstore.afcb.co.uk/", "https://superstore.afcb.co.uk/pages/faqs"),
    membership: destination("https://www.afcb.co.uk/tickets/memberships", "https://www.afcb.co.uk/tickets/memberships"),
  }),
  brighton: Object.freeze({
    tickets: destination("https://tickets.brightonandhovealbion.com/", "https://tickets.brightonandhovealbion.com/screenloader.aspx?page=usercontent%2Fdocuments%2Fhtml%2Ftickethelp.html&type=include"),
    store: destination("https://shop.brightonandhovealbion.com/", "https://www.brightonandhovealbion.com/home"),
    membership: destination("https://www.brightonandhovealbion.com/myalbion-plus", "https://www.brightonandhovealbion.com/myalbion-plus"),
  }),
  brentford: Object.freeze({
    tickets: destination("https://www.brentfordfc.com/en/ticket-information", "https://www.brentfordfc.com/en/ticket-information"),
    store: destination("https://shop.brentfordfc.com/", "https://www.brentfordfc.com/en"),
    membership: destination("https://www.brentfordfc.com/en/memberships-2026-27", "https://www.brentfordfc.com/en/memberships-2026-27"),
  }),
  chelsea: Object.freeze({
    tickets: destination("https://www.chelseafc.com/en/tickets/mens-tickets", "https://www.chelseafc.com/en/tickets/mens-tickets"),
    store: destination("https://store.chelseafc.com/en/", "https://www.chelseafc.com/en"),
    membership: destination("https://memberships.chelseafc.com/en", "https://memberships.chelseafc.com/en"),
  }),
  "coventry-city": Object.freeze({
    tickets: destination("https://www.ccfc.co.uk/tickets", "https://www.ccfc.co.uk/tickets"),
    store: destination("https://www.ccfcstore.com/", "https://www.ccfc.co.uk/"),
    membership: destination("https://www.ccfc.co.uk/memberships", "https://www.ccfc.co.uk/"),
  }),
  "crystal-palace": Object.freeze({
    tickets: destination("https://www.cpfc.co.uk/tickets/", "https://www.cpfc.co.uk/tickets/"),
    store: destination("https://shop.cpfc.co.uk/", "https://www.cpfc.co.uk/"),
    membership: destination("https://www.cpfc.co.uk/memberships/", "https://www.cpfc.co.uk/supporters/palace-tv-plus/"),
  }),
  everton: Object.freeze({
    tickets: destination("https://www.evertonfc.com/tickets", "https://www.evertonfc.com/tickets"),
    store: destination("https://store.evertonfc.com/en/", "https://www.evertonfc.com/"),
    membership: destination("https://www.evertonfc.com/ForeverBlue", "https://www.evertonfc.com/ForeverBlue"),
  }),
  fulham: Object.freeze({
    tickets: destination("https://www.fulhamfc.com/tickets", "https://www.fulhamfc.com/more/frequently-asked-questions/booking-tickets-faq"),
    store: destination("https://shop.fulhamfc.com/", "https://www.fulhamfc.com/"),
    membership: destination("https://www.fulhamfc.com/news/2026/july/09/2026-27-memberships-now-on-sale/", "https://www.fulhamfc.com/news/2026/july/09/2026-27-memberships-now-on-sale/"),
  }),
  "hull-city": Object.freeze({
    store: destination("https://www.tigerleisure.com/", "https://www.wearehullcity.co.uk/"),
    tickets: destination("https://www.wearehullcity.co.uk/tickets/", "https://www.wearehullcity.co.uk/tickets/"),
    membership: destination("https://www.wearehullcity.co.uk/tickets/memberships", "https://www.wearehullcity.co.uk/tickets/"),
  }),
  "ipswich-town": Object.freeze({
    tickets: destination("https://tickets.itfc.co.uk/", "https://www.itfc.co.uk/news/2026/january/08/ticket-details---derby-county--a-/"),
    store: destination("https://shop.itfc.co.uk/", "https://www.itfc.co.uk/"),
    membership: destination("https://www.itfc.co.uk/news/2026/july/10/memberships-launched-for-26-27/", "https://www.itfc.co.uk/news/2026/july/10/memberships-launched-for-26-27/"),
  }),
  "leeds-united": Object.freeze({
    tickets: destination("https://tickets.leedsunited.com/", "https://www.leedsunited.com/en/visitor-information/tickets-visitor-information"),
    store: destination("https://shop.leedsunited.com/en/", "https://www.leedsunited.com/en"),
    membership: destination("https://www.leedsunited.com/en/news/my-leeds-membership-update", "https://www.leedsunited.com/en/news/my-leeds-membership-update"),
  }),
  liverpool: Object.freeze({
    tickets: destination("https://www.liverpoolfc.com/tickets", "https://www.liverpoolfc.com/tickets"),
    store: destination("https://store.liverpoolfc.com/", "https://www.liverpoolfc.com/"),
    membership: destination("https://www.liverpoolfc.com/allred", "https://www.liverpoolfc.com/news/all-red-lfc-launches-new-membership-experience-ultimate-access"),
  }),
  "manchester-united": Object.freeze({
    tickets: destination("https://tickets.manutd.com/", "https://www.manutd.com/en/help/faqs/ticketing"),
    store: destination("https://store.manutd.com/en", "https://www.manutd.com/en"),
    membership: destination("https://tickets.manutd.com/memberships", "https://www.manutd.com/en/help/faqs/official-membership"),
  }),
  "newcastle-united": Object.freeze({
    tickets: destination("https://book.newcastleunited.com/", "https://support.newcastleunited.com/hc/en-gb/articles/14311048217244-Can-I-buy-match-tickets-from-other-websites"),
    store: destination("https://shop.newcastleunited.com/", "https://www.newcastleunited.com/en"),
    membership: destination("https://www.newcastleunited.com/en/tickets/membership", "https://www.newcastleunited.com/en/tickets/membership"),
  }),
  "nottingham-forest": Object.freeze({
    tickets: destination("https://tickets.nottinghamforest.co.uk/", "https://s3.eu-west-1.amazonaws.com/gc-media-assets.gc.nffcservices.co.uk/7d808730-86e6-11ef-a324-850121fe2985.pdf"),
    store: destination("https://shop.nottinghamforest.co.uk/", "https://www.nottinghamforest.co.uk/"),
    membership: destination("https://www.nottinghamforest.co.uk/memberships/", "https://www.nottinghamforest.co.uk/memberships/"),
  }),
  sunderland: Object.freeze({
    tickets: destination("https://www.safc.com/tickets/", "https://www.safc.com/tickets/"),
    store: destination("https://www.safcstore.com/en/", "https://www.safc.com/"),
    membership: destination("https://www.safc.com/memberships/membership-hub", "https://www.safc.com/memberships/membership-hub"),
  }),
  "tottenham-hotspur": Object.freeze({
    tickets: destination("https://www.tottenhamhotspur.com/tickets", "https://www.tottenhamhotspur.com/tickets"),
    store: destination("https://shop.tottenhamhotspur.com/", "https://www.tottenhamhotspur.com/"),
    membership: destination("https://www.tottenhamhotspur.com/membership", "https://www.tottenhamhotspur.com/membership"),
  }),
  "manchester-city": Object.freeze({
    store: destination("https://shop.mancity.com/gb/en/home/", "https://www.mancity.com/tickets"),
    playerCollection: destination("https://shop.mancity.com/gb/en/home/", "https://www.mancity.com/tickets"),
    tickets: destination("https://www.mancity.com/tickets", "https://www.mancity.com/tickets"),
    membership: destination("https://www.mancity.com/memberships", "https://www.mancity.com/memberships"),
  }),
});

export function getTouchlineOfficialClubChannels(slug: string): TouchlineClubOfficialChannels {
  return TOUCHLINE_OFFICIAL_CLUB_CHANNELS[slug] ?? EMPTY_CHANNELS;
}
