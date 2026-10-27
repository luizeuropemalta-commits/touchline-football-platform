import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("coach and Exchange preserve least privilege under actual Supabase default table grants", async () => {
  const db = await clubRoundDatabase();
  try {
    await db.exec(`alter table users add full_name text;
      alter table football_seasons add starts_at date; alter table football_seasons add ends_at date;
      alter table football_seasons add competition_id uuid; alter table football_seasons add name text;
      alter table football_players add display_name text;
      alter table touchline_card_publications add calculated_price_tc bigint;
      alter table touchline_card_publications add competition_id uuid;
      alter table touchline_card_publications add effective_season text;`);
    await db.exec(sql("20261017195405_club_collection_remove_real_club_cap"));
    await db.exec(sql("20261018073030_club_collection_primary_position_contract"));
    // QA postgres pg_default_acl grants ALL to all three API roles. RLS alone
    // cannot protect audit receipts from service_role because it bypasses RLS.
    await db.exec("alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role");
    await db.exec(sql("20261025193152_club_collection_atomic_coach_lifecycle"));
    await db.exec(sql("20261025204101_club_exchange_atomic_ledger"));
    const allowed: Record<string, string[]> = {
      touchline_club_coach_operations: ["SELECT", "INSERT"],
      touchline_club_exchange_receipts: ["SELECT", "INSERT"],
      touchline_club_exchange_listings: ["SELECT", "INSERT", "DELETE"],
      touchline_club_exchange_proposals: ["SELECT", "INSERT", "UPDATE"],
    };
    for (const [table, privileges] of Object.entries(allowed)) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
          const actual = (await db.query<{ allowed: boolean }>("select has_table_privilege($1,$2,$3) allowed", [role, table, privilege])).rows[0].allowed;
          assert.equal(actual, role === "service_role" && privileges.includes(privilege), `${role} ${table} ${privilege}`);
        }
      }
    }
    await db.exec("set role service_role");
    for (const table of ["touchline_club_coach_operations", "touchline_club_exchange_receipts"]) {
      await assert.rejects(db.exec(`delete from public.${table}`), /permission denied/);
      await assert.rejects(db.exec(`update public.${table} set created_at=clock_timestamp()`), /permission denied/);
      await assert.rejects(db.exec(`truncate public.${table}`), /permission denied/);
      await db.query(`select * from public.${table}`);
    }
  } finally { await db.close(); }
});
