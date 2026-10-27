-- Receipt for the QA atomic deployment wrapper recorded by Supabase MCP.
-- Version/name were returned by the actual QA migration journal, not invented.
-- The nine original migrations were applied and journaled atomically inside
-- the wrapper; replay schemas execute those original files before this no-op.
-- Bundle SHA-256: 2e8c546414236375e3276a377cf2ab0d25e531163a0025477f036c6d26164487
-- No extra schema or user-data change belongs to this wrapper receipt.
select 1;
