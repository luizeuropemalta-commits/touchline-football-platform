# TouchLine Current State

Verified: 2026-08-16
Canonical repository: `/Users/luizlopez/Developer/touchline-football-platform`
Active QA worktree: `/Users/luizlopez/Developer/touchline-football-platform-qa`
Active branch: `qa`
Active validated QA SHA: `ff9fdb6` (`fix(security): restrict provider sync metadata to server`).

## QA and release

- Stable QA URL: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Current QA deployment: `dpl_Hv1HnSpApbpN9qkYG7Seti6XAXgc`, commit `ff9fdb6`, status READY. Its stable QA alias is `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Market P0 patch removed a redundant client auth precheck and bounds the Arena-state request to 8 seconds. Full Vercel release build passed: TypeScript, ESLint with 0 errors/4 pre-existing warnings, 948/948 tests, and 133/133 generated pages.
- Native Safari Market now passes a cache-bypass reload and a subsequent ordinary reload. The page renders the authenticated 35-player QA scenario and current card catalogue.
- Production, `touchline.com.br`, DNS, payments, Production database and card-publication gate were not changed by the QA mission.

## QA database

- Isolated QA project: `xgxbwqxjssxxuihuwmgy`.
- Representative run `bf476289-c6df-47a6-878e-7dc8c40f3f91` contains 20 clubs, 588 canonical players/memberships, 562 published cards, 35 active contracts, coach `455907`, 11 starters, 9 substitutes, 15 outside the matchday squad and 20 reversible QA fixtures.
- The package is deterministic, reversible and replay-idempotent. Production data and credentials were not copied or changed.
- New authenticated QA work must pass the canonical-persona preflight: QA project `xgxbwqxjssxxuihuwmgy`, owner `jl_nenelopes10@hotmail.com`, UUID `072900f3-27fc-41a5-9881-6913a486754e`, and the stable `qa` branch alias. The former technical account is a **HISTORICAL QA ACTOR** only and is blocked from new test selection.

## Security correction in validation

- QA migration `058_football_provider_metadata_server_boundary.sql` has been applied only to project `xgxbwqxjssxxuihuwmgy`. It removes browser-role access to `football_provider_mappings` and `football_data_sync_runs`; the latter can contain raw provider payloads. Only `service_role` retains table privileges.
- `/api/football-data/foundation` continues to expose only its explicit sanitized sync-run projection, now read through the server admin client after request authentication. No football, card, contract, auth or Production data changed.
- Focused boundary tests `4/4`, full suite `996/996`, TypeScript, scoped ESLint and production build (133 routes) passed. The QA database privilege query confirmed only `postgres` and `service_role` retain access.

## Active P0/P1 gates

- **Safari stale-deployment incident: CLOSED.** An already-open tab retained assets from deployment `dpl_AMVH4DELGqeVQ3vdg67SQwEj493u` (commit `1130455`) while the stable alias pointed to deployment `dpl_5GCTMjjJnanBgFjWdrkqukuwrkf6` (commit `486e790`). A cache-bypass reload loaded the current asset graph; a following ordinary reload also passed. Server evidence was HTTP 200, `Age: 0`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and `x-vercel-cache: MISS`.
- **P1 responsive Market QA:** complete native/automated observation at 1440, 1280, 768 and 390, including keyboard, touch/scroll, zoom modal and selection persistence.
- **P1 authenticated surface QA:** Arena, ClubOwner, Training Centre, Quick Sub, Live and logout/login persistence still require page-by-page evidence against the representative QA package.
- **P1 security backlog:** checkout quota race, mutating starter-sync GET/CSRF boundary, tenant-pivot/RLS and SECURITY DEFINER grants remain separately gated findings; none is being silently changed during visual QA.

## Next executable action

Resume the remaining authenticated visual matrix against deployment `dpl_Hv1HnSpApbpN9qkYG7Seti6XAXgc`. The Live fixture rail work recorded below has already been completed today and must not be repeated. Production remains forbidden until the complete release manifest and explicit promotion gate pass.

The permanent Codex environment is ready for product work. Do not continue environment optimization unless a new material environment blocker appears.

For detailed immutable evidence, use `CURRENT_EXECUTION_LEDGER.md`.
