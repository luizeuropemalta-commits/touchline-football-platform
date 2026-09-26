import { touchlineArenaHref } from "./arena-navigation.ts";

/** Only competitions backed by the current public runtime may be offered.
 * Adding a label here alone must never be used to launch another league. */
export const TOUCHLINE_AVAILABLE_LEAGUES = [
  { key: "touchline-england", name: "TouchLine England" },
] as const;

export function touchlineLeagueEntryHref(key: string, locale: string): string | null {
  return key === "touchline-england" ? touchlineArenaHref(locale) : null;
}
