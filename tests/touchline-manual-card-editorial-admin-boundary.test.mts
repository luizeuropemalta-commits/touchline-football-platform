import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/admin/manual-card-editorial/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(app)/admin/manual-card-editorial/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../components/admin-manual-card-editorial-actions.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/051_touchline_manual_card_editorial_profiles.sql", import.meta.url), "utf8");

test("manual editorial administration is owner-only and validates canonical PL identity before its atomic command", () => {
  assert.match(route, /isOwnerEmail/);
  assert.match(route, /hasTouchLineArenaAccess/);
  assert.match(route, /football_players/);
  assert.match(route, /football_squad_members/);
  assert.match(route, /football_clubs/);
  assert.match(route, /football_competitions/);
  assert.match(route, /provider_competition_id !== "8"/);
  assert.match(route, /memberships\.length !== 1/);
  assert.match(route, /touchline_apply_manual_card_publication/);
  assert.match(route, /atomicPublicationRpc/);
  assert.doesNotMatch(route, /\.from\("football_player_market_values"\)[\s\S]{0,180}\.upsert\(/);
  assert.doesNotMatch(route, /\.from\("football_player_market_value_history"\)[\s\S]{0,180}\.(?:insert|upsert|update)\(/);
  assert.doesNotMatch(route, /\.from\("touchline_card_publications"\)[\s\S]{0,180}\.upsert\(/);
  assert.doesNotMatch(route, /\.from\("touchline_card_publication_history"\)[\s\S]{0,180}\.(?:insert|upsert|update)\(/);
  assert.doesNotMatch(route, /fetch\s*\(/);
  assert.doesNotMatch(route, /sportmonks\.com|market-value-import-server|stripe/i);
  assert.doesNotMatch(route, /revalidateTouchlineCardPublicationCache|revalidateTag/);
});

test("the private schema stores values canonically and keeps game-card publication separate", () => {
  assert.match(migration, /touchline_card_publications/);
  assert.match(migration, /market_value_id uuid references public\.football_player_market_values/);
  assert.match(migration, /calculated_tier text check/);
  assert.match(migration, /calculated_price_tc integer/);
  assert.match(migration, /publication_status text not null default 'detected'/);
  assert.match(migration, /market_value_required/);
  assert.match(migration, /ready_to_publish/);
  assert.match(migration, /last_reviewed_at timestamptz/);
  assert.match(migration, /internal_note text/);
  assert.match(migration, /TL_CARD_PUBLICATION_HISTORY_IMMUTABLE/);
  assert.match(migration, /touchline_card_publication_batches/);
  assert.match(migration, /batch_id uuid references public\.touchline_card_publication_batches/);
  assert.match(migration, /'reverted'/);
  assert.match(migration, /revoke all on public\.touchline_card_publications from public, anon, authenticated/);
});

test("the owner page is a protected one-player editor and clearly reports an unapplied migration", () => {
  assert.match(page, /ManualCardEditorialEditor/);
  assert.match(page, /ManualCardEditorialBulkPreview/);
  assert.match(page, /isOwnerEmail/);
  assert.match(page, /migrationPending/);
  assert.match(page, /Card publication control/);
  assert.match(page, /Card publication control/);
  assert.match(page, /051_touchline_manual_card_editorial_profiles\.sql/);
  assert.match(page, /provider_player_id,display_name,name,position,source_updated_at/);
  assert.match(page, /playerId=\$\{encodeURIComponent\(alert\.playerId\)\}/);
  assert.match(page, /Detected/);
  assert.match(actions, /initialPlayerId/);
});

test("the protected editorial workflow preserves the explicit EN/PT locale boundary", () => {
  assert.match(page, /locale=\{locale\}/);
  assert.match(page, /Controle de publicação de cards/);
  assert.match(actions, /type ManualEditorialLocale = "en-GB" \| "pt-BR"/);
  assert.match(actions, /Valor de mercado manual → publicar card/);
  assert.match(actions, /Validar até 50 linhas/);
  assert.match(actions, /Histórico imutável/);
  assert.match(actions, /never public/);
  assert.match(actions, /nunca pública/);
});

test("bulk preview remains read-only and validates the selected canonical club before returning rows", () => {
  assert.match(route, /action"\) === "bulk-preview"/);
  assert.match(route, /previewTouchlineManualMarketValueBulk/);
  assert.match(route, /Selected club is outside the canonical Premier League scope/);
  assert.doesNotMatch(route, /bulk-preview[\s\S]{0,1200}\.upsert\(/);
});

test("revert is delegated to the same protected atomic migration boundary", () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /action !== "revert"/);
  assert.match(route, /touchline_revert_manual_card_publication/);
  assert.match(route, /The atomic card-publication migration is not applied yet/);
  assert.doesNotMatch(route, /\.delete\(\)/);
});
