import { readFileSync } from "node:fs";
import type { ClubRoundDatabase } from "./club-round-database.mts";

export const clubSeasonCalendarMigration = readFileSync(new URL(
  "../../supabase/migrations/20261030115520_club_collection_season_calendar_guard.sql", import.meta.url,
), "utf8");

/** Extend the reduced test schema with explicit, synthetic calendar authority. */
export async function installTestClubSeasonCalendar(db: ClubRoundDatabase, seasonId: string, competitionId: string) {
  await db.exec("alter table football_seasons add column if not exists starts_at date, add column if not exists ends_at date, add column if not exists competition_id uuid");
  await db.query(`update football_seasons set competition_id=$2,
    starts_at=(clock_timestamp() at time zone 'UTC')::date-1,
    ends_at=(clock_timestamp() at time zone 'UTC')::date+1 where id=$1`, [seasonId, competitionId]);
  await db.exec(clubSeasonCalendarMigration);
}
