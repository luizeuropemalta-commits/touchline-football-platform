-- Remove the retired AI document and generated-identity subsystems.
-- TouchLine now uses official static card artwork, SportMonks data and
-- user-supplied ClubOwner profile photos only.

drop table if exists public.ai_generated_documents cascade;
drop table if exists public.tdie_player_identities cascade;
drop function if exists public.tdie_player_identities_touch_updated_at();
