-- Cooperative application writes compare a dedicated revision. Existing owner
-- table grants remain unchanged: this is ordering, not a new privilege boundary.
-- Deploy only together with revision-aware API consumers; the old RPC is removed.
alter table public.notification_preferences
  add column game_locale_revision bigint not null default 0
  constraint notification_preferences_game_locale_revision_check
  check (game_locale_revision >= 0);

drop function public.touchline_set_game_locale(text);

create function public.touchline_set_game_locale(p_locale text, p_expected_revision bigint)
-- Return decimal text before JSON encoding to avoid JavaScript bigint rounding.
returns table(game_locale text, game_locale_revision text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_locale is null or p_locale not in
    ('en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE') then
    raise exception 'Invalid game language' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid game language revision' using errcode = '22023';
  end if;
  if p_expected_revision = 9223372036854775807 then
    raise exception 'Game language revision overflow' using errcode = '22003';
  end if;

  if p_expected_revision = 0 then
    -- A missing row starts unconsented with the table's existing defaults.
    -- Conflicting first writers cannot both succeed, including revision-zero rows.
    return query
      insert into public.notification_preferences as preferences
        (user_id, game_locale, game_locale_revision)
      values (v_owner, p_locale, 1)
      on conflict (user_id) do update
        set game_locale = excluded.game_locale, game_locale_revision = 1
        where preferences.game_locale_revision = 0
      returning preferences.game_locale, preferences.game_locale_revision::text, preferences.updated_at;
  else
    return query
      update public.notification_preferences as preferences
      set game_locale = p_locale, game_locale_revision = p_expected_revision + 1
      where preferences.user_id = v_owner
        and preferences.game_locale_revision = p_expected_revision
      returning preferences.game_locale, preferences.game_locale_revision::text, preferences.updated_at;
  end if;
  -- Zero rows means stale revision; callers must reread, never silently retry.
end;
$$;

revoke all on function public.touchline_set_game_locale(text, bigint) from public, anon;
grant execute on function public.touchline_set_game_locale(text, bigint) to authenticated;
