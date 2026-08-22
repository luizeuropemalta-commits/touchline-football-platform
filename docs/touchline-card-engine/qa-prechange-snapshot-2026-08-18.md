# TouchLine Card Engine — QA pre-change snapshot

Captured before applying `20260818100529_touchline_card_engine_editorial_control_plane.sql` to project `xgxbwqxjssxxuihuwmgy`.

| Protected relation | Count |
|---|---:|
| `football_players` | 588 |
| `football_player_market_values` | 562 |
| `touchline_card_publications` | 562 |
| `touchline_card_publication_history` | 1,124 |
| `touchline_card_inventory` | 562 |

The highest pre-existing publication version was `2`; the latest pre-existing publication-history timestamp was `2026-08-15 14:15:09.206989+00`.

## Rollback boundary

The migration is additive and does not alter a provider fact. Card Engine batches have an explicit protected `touchline_card_engine_revert_batch` command. Reverting changes only the engine-owned override status to `reverted` and writes immutable audit evidence; no chat, rollout, TouchLine source history, or Production data is deleted.

This snapshot is a logical pre-change checkpoint, not a replacement for the platform-managed Supabase physical backup policy.
