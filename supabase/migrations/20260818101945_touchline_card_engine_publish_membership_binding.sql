-- QA repair marker for the forward-only reapplication of migration 017.
-- Fresh environments receive the corrected full definition in migration 017.
begin;
select 'touchline_card_engine_publish_membership_binding_repaired'::text;
commit;
