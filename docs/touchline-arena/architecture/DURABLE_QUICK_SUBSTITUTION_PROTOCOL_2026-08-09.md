# Durable Arena Quick Substitution Protocol

Status: local protocol contract only. It is not wired to the Arena UI, an API,
browser storage, a database, or a remote match.

## Why this exists

The existing Arena bench action changes the saved club lineup. It is not a
match event and cannot retain a no-re-entry guarantee after reload. A real
match substitution needs a server-owned projection rather than a client swap.

## Immutable matchday snapshot

The future protected server command must start from one validated snapshot:

- `matchId`, owner ID, and roster revision;
- exactly 11 unique active contract/inventory IDs;
- exactly 9 unique matchday-bench contract/inventory IDs;
- no overlap between the XI and bench.

Display names, tier, price, wallet, provider identity, and card art are not
part of the command authority. The match snapshot uses only canonical
inventory/contract IDs.

## Command and outcome

Each request has a unique command ID and command hash, expected match/roster
revision, expected state revision, actor ID, incoming/outgoing IDs, and an
explicit timestamp. A successful event:

1. replaces the outgoing active ID with the incoming bench ID;
2. removes the incoming ID from the available nine-player bench;
3. appends the outgoing ID to `substituted_out` permanently for that match;
4. appends an immutable event and increments state revision.

Replaying the exact command returns the same event without a second change.
A conflicting reuse of the command ID, stale revision, wrong actor/match,
unknown player, or an attempt to re-enter after substitution is rejected.

The protocol does **not** impose a substitution-count cap. The only gameplay
rule encoded here is the owner-approved no-re-entry rule. Any future cap,
injury exception, correction/retraction, or abandoned-match policy requires an
explicit product decision.

## Required server integration before any real match use

- server-owned match/matchweek identity and an immutable initial snapshot;
- protected transactional command endpoint with ownership and revision checks;
- append-only event/audit storage with command hash, actor, before/after
  summary, run/release linkage, and idempotency constraint;
- correction/retraction/rollback policy approved by Luiz;
- atomic projection publication for every connected shared match surface;
- controlled authenticated-session QA across reload, reconnect, Safari/WebKit,
  keyboard, touch, and concurrent-command scenarios.

These require schema/API work and remain blocked by the open SQL-editor
incident. The local pure reducer is intentionally insufficient to unlock an
account action or production feature.
