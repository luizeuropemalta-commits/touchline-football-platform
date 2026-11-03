-- Restore the schema permission required by the existing avatar identity guard.
-- This grants no table access and does not expose auth to API customer roles.
grant usage on schema auth to touchline_avatar_writer;
