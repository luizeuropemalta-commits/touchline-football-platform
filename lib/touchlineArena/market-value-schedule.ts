export type TouchlineMarketValueJobKey =
  | "annual_full_refresh"
  | "final_delta_refresh"
  | "transfer_window_roster_detection"
  | "manual_emergency_player_import";

export type TouchlineMarketValueSchedule = Readonly<{
  key: TouchlineMarketValueJobKey;
  cadence: "season_offset" | "daily_during_transfer_window" | "manual";
  leadDays: number | null;
  description: string;
}>;

/**
 * These definitions are deliberately inert. A scheduler can enqueue them,
 * but no definition authorises a third-party request or an automatic value
 * change. Every value still crosses the licensed import/Admin review boundary.
 */
export const TOUCHLINE_MARKET_VALUE_SCHEDULES: readonly TouchlineMarketValueSchedule[] = [
  {
    key: "annual_full_refresh",
    cadence: "season_offset",
    leadDays: 30,
    description: "Full competition audit and licensed import 30 days before matchweek one.",
  },
  {
    key: "final_delta_refresh",
    cadence: "season_offset",
    leadDays: 7,
    description: "Final roster and pending-value validation seven days before matchweek one.",
  },
  {
    key: "transfer_window_roster_detection",
    cadence: "daily_during_transfer_window",
    leadDays: null,
    description: "Daily entrant and roster-change detection only; it never reprices cards.",
  },
  {
    key: "manual_emergency_player_import",
    cadence: "manual",
    leadDays: null,
    description: "One-player owner import requiring validation and audit evidence.",
  },
];

export function touchlineMarketValueRunDate(
  firstMatchweekAt: Date,
  job: TouchlineMarketValueSchedule & { cadence: "season_offset" },
) {
  if (Number.isNaN(firstMatchweekAt.getTime())) throw new Error("A valid first-matchweek date is required.");
  const result = new Date(firstMatchweekAt);
  result.setUTCDate(result.getUTCDate() - (job.leadDays ?? 0));
  return result;
}
