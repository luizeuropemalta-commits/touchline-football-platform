-- QA rollback for 20260819150000_touchline_card_review_engine.sql.
-- Run only after preserving the protected audit export if one has been made.
begin;
drop table if exists public.touchline_card_editorial_override_audit;
alter table public.touchline_card_editorial_overrides
  drop constraint if exists touchline_card_editorial_overrides_field_key_check;
alter table public.touchline_card_editorial_overrides
  add constraint touchline_card_editorial_overrides_field_key_check check (field_key = any (array[
    'displayName', 'shirtNumber', 'marketValueEur', 'cardTemplateKey'
  ]));
drop function if exists public.touchline_card_editorial_override_audit_immutable();
commit;
