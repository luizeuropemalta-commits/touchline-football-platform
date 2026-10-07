-- Explicit game-language choice only. No inferred default or legacy backfill.
alter table public.notification_preferences
  add column game_locale text
  constraint notification_preferences_game_locale_check
  check (game_locale in ('en-GB', 'pt-BR', 'es-ES', 'it-IT', 'fr-FR', 'ar-SA', 'tr-TR', 'de-DE'));

create function public.touchline_set_game_locale(p_locale text)
returns table(game_locale text, updated_at timestamptz)
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

  -- One atomic statement, protected by the existing own-user RLS policies.
  -- First insertion keeps push/email disabled and explicit consent null.
  -- Existing rows update only presentation, never consent/settings/channels.
  return query
    insert into public.notification_preferences as preferences (user_id, game_locale)
    values (v_owner, p_locale)
    on conflict (user_id) do update set game_locale = excluded.game_locale
    returning preferences.game_locale, preferences.updated_at;
end;
$$;

revoke all on function public.touchline_set_game_locale(text) from public, anon;
grant execute on function public.touchline_set_game_locale(text) to authenticated;
