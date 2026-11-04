-- Support the admin's global latest-eight history query without changing its data.
-- The migration runner owns the transaction; fail fast if live sync is writing.
SET LOCAL lock_timeout = '250ms';
SET LOCAL statement_timeout = '2s';

CREATE INDEX football_data_sync_runs_started_at_idx
  ON public.football_data_sync_runs USING btree (started_at DESC);
