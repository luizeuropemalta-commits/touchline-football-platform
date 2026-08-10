# Quick Substitution no-reentry session projection — 2026-08-10

## Purpose

Correct the standalone Quick Substitution screen so a player who leaves the
pitch cannot return to the available bench or be selected again during the
same match session.

## Local implementation

- Added the pure `quick-substitution-session` projection over the existing
  durable Quick Substitution reducer.
- It opens only from one complete identity-backed sheet: exactly 11 fixed
  pitch slots and 9 distinct bench inventory IDs.
- A confirmed substitution keeps the incoming player at the outgoing slot,
  removes that incoming inventory ID from the active bench and puts the
  outgoing player in a dim, non-interactive **Substituted out / Saiu da
  partida** rail.
- The Quick Substitution route does not call `setPlayers`, `setBenchPlayers`
  or `persistArenaRoster` for the match substitution path. Contract-release
  actions are also hidden from this standalone match screen.
- The local projection is saved only in browser session storage, scoped by
  match/owner/roster revision. It is not a database event, an official match
  record or a roster mutation.

## Safety and known boundary

The reducer rejects incomplete sheets, unknown slots, stale revisions,
non-bench incoming players and players listed as substituted out. The user
sees no fabricated cards when the owned roster has fewer than 11 starters and
9 bench players.

Server-owned match-event persistence remains a separate future gate. This
change prevents re-entry in the local Quick Substitution experience without
claiming that a reload-safe official match event was written remotely.

## Validation

Local-only checks passed with no database, provider, sync, migration, value,
contract or deployment action:

```text
node --test --experimental-strip-types \
  tests/touchline-durable-quick-substitution.test.mts \
  tests/touchline-quick-substitution-readiness.test.mts \
  tests/touchline-quick-substitution-session.test.mts \
  tests/touchline-quick-substitution-session-ui.test.mts
# 23 passed, 0 failed

pnpm typecheck
pnpm lint
git diff --check
```

The tests cover two sequential substitutions, a complete 11 + 7 + 2 player
partition after two changes, fixed pitch-slot replacement, both a starting
player and an already-used substitute becoming permanently unavailable after
leaving the pitch, replay rejection, browser-session validation, the separate
locked outgoing rail, and the absence of saved-roster/contract calls in the
standalone substitution path.

## Local visual observation

The static `visual-qa/quick-substitution-readiness?lang=pt-BR` fixture was
opened only on localhost. A compatible substitution placed Haaland in Isak's
fixed pitch slot, removed Haaland from the active bench and showed Isak in the
locked outgoing rail. After a browser reload in the same session, that state
remained: Haaland stayed on the pitch, Isak had no selectable bench card, and
the rail remained visible. At 390, 768 and 1280 CSS pixels,
`scrollWidth === clientWidth`; no console errors were observed. This was local
fixture evidence only, not a production roster or match result.

## Files

- `lib/touchlineArena/quick-substitution-session.ts`
- `app/arena/ArenaClient.tsx`
- `tests/touchline-quick-substitution-session.test.mts`
- `tests/touchline-quick-substitution-session-ui.test.mts`
- `tests/touchline-durable-quick-substitution.test.mts`
- `tests/touchline-quick-substitution-readiness.test.mts`
