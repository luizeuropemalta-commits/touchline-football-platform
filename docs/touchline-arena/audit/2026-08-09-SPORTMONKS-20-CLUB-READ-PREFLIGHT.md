# Sportmonks 20-club roster read — preflight

**Recorded:** 2026-08-09  
**Status:** `BLOCKED — SERVER-SIDE CREDENTIAL UNAVAILABLE IN THIS EXECUTION ENVIRONMENT`

## Authorized scope

Luiz authorized a direct, read-only Sportmonks roster audit for the 20
declared provider team IDs. The operation may use only an existing
server-side `SPORTMONKS_API_TOKEN`; it must not create or alter a credential,
write to TouchLine's database, sync, migrate, deploy, or alter card/value
data.

## Local credential and integration check

The following non-secret checks were completed:

- the current process has no `SPORTMONKS_API_TOKEN`, `SPORTMONKS_BASE_URL`,
  `SPORTMONKS_ROOT_BASE_URL`, `SPORTMONKS_STARTER_LEAGUE_ID`, or
  `SPORTMONKS_STARTER_CLUB_ID` variable;
- this worktree contains only `.env.example`, with no `.env` or `.env.local`;
- no local Vercel link/CLI or running Next/Node application provides a safe
  server-side handoff; and
- no Keychain, Vercel secret, browser storage, or network source was queried.

The existing server-only integration reads exactly
`process.env.SPORTMONKS_API_TOKEN` in
`lib/football-data/providers/sportmonks.ts`. It returns `not_configured` when
that value is absent. No value was printed, copied, stored, or requested.

## Direct provider path assessed

`SportmonksFootballProvider.getSquad(teamId)` issues only provider `GET`
requests for each team:

- `/squads/teams/{teamId}` with player/position includes; and
- `/squads/teams/{teamId}/extended` with identity/position includes.

It does not write TouchLine data; its cache is process-memory only. It is not
sufficient by itself for the required full audit because the squad request is
not paginated. A future one-shot extractor must fail closed on
`pagination.has_more`, malformed/empty squad data, timeout/403/429, and any
duplicate provider player ID within or across the 20 teams. It must project
only provider player/team IDs, display name, position, fetch timestamp and
hash—never raw payloads or request URLs containing the token.

## Result

No Sportmonks request or local roster manifest was generated. No two extras
can be named or classified from provider evidence; they remain
`PRESERVED_UNIDENTIFIED_PENDING` with no value or roster mutation.

## Exact unblocker

Provide the already-existing `SPORTMONKS_API_TOKEN` to a controlled,
server-side-only process for this one read operation without persisting or
printing it. The resulting extractor must produce a new UTC archive with
`wx`, validate the 20-team coverage and provider-ID uniqueness, then stop
without any DB/sync action on partiality or duplicates.
