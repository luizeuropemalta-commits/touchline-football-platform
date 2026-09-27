-- Execute through a transaction-owning migration runner, including history.
-- Private binding only: never an endpoint/credential or permission to deliver.
-- Legacy entries remain NULL: do not manufacture historical subscription facts.
-- Producer must store a validated server-derived fingerprint; final delivery
-- policy rejects NULL or changed bindings. This migration enables no sender.
alter table public.touchline_match_push_outbox
  add column subscription_fingerprint text
    check (subscription_fingerprint is null
      or subscription_fingerprint ~ '^sha256:[a-f0-9]{64}$');
