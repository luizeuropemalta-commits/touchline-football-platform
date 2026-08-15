-- Close the legacy function ACL gap left by migration 020. Supabase may
-- materialize grants for anon/authenticated separately from PUBLIC, so a
-- PUBLIC-only revoke is not a complete boundary for SECURITY DEFINER calls.

revoke all on function public.reject_published_touchline_ranking_mutation()
  from public, anon, authenticated;

revoke all on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz)
  from public, anon, authenticated;

-- Publishing remains a server-owned operation.
grant execute on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz)
  to service_role;
