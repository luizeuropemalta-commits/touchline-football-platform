-- ACL correction for the protected effective-value view.
begin;
revoke all on public.touchline_card_editorial_effective_values from public, anon, authenticated;
grant select on public.touchline_card_editorial_effective_values to service_role;
commit;
