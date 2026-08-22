-- QA repair marker for an already-applied pre-correction publish function.
-- Fresh environments receive the canonical 2026-07-premier-v1 definition from
-- migration 20260818101708. QA reapplies that corrected definition through the
-- migration runner under this forward-only release name.
begin;
select 'touchline_card_engine_publish_policy_version_repaired'::text;
commit;
