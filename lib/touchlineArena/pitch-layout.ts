export type TouchlinePitchSlot = Readonly<{ x: number; y: number }>;

const GOALKEEPER: TouchlinePitchSlot = { x: 8, y: 50 };
const DEFENDERS: readonly TouchlinePitchSlot[] = [
  { x: 28, y: 17 }, { x: 28, y: 39 }, { x: 28, y: 61 }, { x: 28, y: 83 },
];
const MIDFIELDERS: readonly TouchlinePitchSlot[] = [
  { x: 54, y: 24 }, { x: 54, y: 50 }, { x: 54, y: 76 },
];
const FORWARDS: readonly TouchlinePitchSlot[] = [
  { x: 82, y: 20 }, { x: 82, y: 50 }, { x: 82, y: 80 },
];

/** The ClubOwner XI order is goalkeeper, defenders, midfielders and forwards. */
export const TOUCHLINE_CLUB_OWNER_XI_SLOTS = [
  GOALKEEPER,
  ...DEFENDERS,
  ...MIDFIELDERS,
  ...FORWARDS,
] as const;

/** The ClubHub builder selects forwards, midfielders, defenders then goalkeeper. */
export const TOUCHLINE_STANDARD_433_SLOTS = [
  ...FORWARDS.map((slot) => ({ role: "forward" as const, ...slot })),
  ...MIDFIELDERS.map((slot) => ({ role: "midfielder" as const, ...slot })),
  ...DEFENDERS.map((slot) => ({ role: "defender" as const, ...slot })),
  { role: "goalkeeper" as const, ...GOALKEEPER },
] as const;
