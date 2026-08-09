# Public persisted-read boundary — phased local proposal

**Status: LOCAL IMPLEMENTATION — SQUAD SLICE ONLY / NO REMOTE EXECUTION**

## Diagnosis

The current browser/public football surface is not read-only. In particular,
`GET /api/football-data/premier-squad` falls back from a stored squad to the
football provider and then persists the response. Arena and Club Hub call that
route. Related fixture, livescore, rumours and player-profile paths have
similar provider or persistence behavior.

This violates the current data freeze and makes normal rendered QA unsafe.

## First local slice: public squad reader

1. Make `premier-squad` a coherent persisted-snapshot reader. A later slice
   may extract its bounded mapping/projection to a shared server-only module
   once the route contract is stable.
2. The GET path must not
   import a provider, schedule background work, use a refresh query to fetch,
   or call any persistence function.
3. Preserve only verified public projection data. A missing/incoherent
   snapshot or projection failure returns a named `503` unavailable response;
   a coherent stale snapshot is labelled degraded/LKG, not refreshed.
4. Keep a future protected ingestion job outside this public route. No change
   to database schema, provider configuration or live data occurs here.

## Risks and boundaries

- The current route contains provider-only raw-field mapping. The extraction
  must not reintroduce raw market value, provider payload, inventory, offer or
  user data into the public DTO.
- Existing Arena callers may request `refresh=1`; the new route intentionally
  ignores that request rather than treating it as permission to write.
- A server admin client remains a production least-privilege architecture
  gate. The isolated Preview envelope still blocks the route before it can
  reach any server reader.
- This slice does not fix fixture/livescore/rumours/player profile paths. Each
  needs its own committed read-only slice before release.

## Acceptance

- The route and its public reader contain no provider factory, provider fetch,
  `after`, snapshot persistence or write call.
- Valid persisted snapshot plus verified projection returns the same bounded
  public schema; stale coherent snapshot is explicit LKG/degraded; no snapshot
  is an honest unavailable response.
- Tests prove `refresh=1` and `preferSnapshot=1` cannot enter provider/write
  code, and source scans reject future public provider/persistence imports.
- Focused no-network tests and `git diff --check` pass. The logical slice is
  committed locally before moving to fixtures/livescores.

## Local implementation evidence — 2026-08-09

- `GET /api/football-data/premier-squad` now calls only
  `readPersistedSquadSnapshot(teamId)`. A missing, incoherent, or unavailable
  snapshot returns `503 canonical-squad-unavailable`; it does not attempt a
  provider request or a compensating write.
- A coherent stale snapshot remains an explicit `outage-fallback` with
  `degraded: true`. A fresh snapshot is labelled `fresh-snapshot`. Request
  query flags cannot upgrade either branch into a provider or persistence path.
- The public DTO still projects only verified canonical player information and
  keeps the raw snapshot valuation out of JSON.
- Focused local validation passed: 37/37 Node tests covering the new boundary,
  public projection, latency/static contracts, live-card integration source
  contracts, public errors, and Club Hub resilience; `pnpm typecheck`; focused
  ESLint; and `git diff --check`. No server, browser, database, provider,
  deployment, Preview, sync, import, or payment action was performed.
- This is one committed boundary slice, not a release clearance. Fixture,
  livescore, schedule, rumours, player-profile, caller cleanup, least-
  privilege reader, immutable shared-projection, six human locale, durable
  Quick Sub, Preview, and visual-QA gates remain open.
