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

## Second local slice: persisted fixture feed — proposed

`GET /api/football-data/fantasy/fixture` currently calls the provider directly
and `POST` can persist the response. The client route also carries an internal
transport shape whose fields can reveal provider-labelled metadata.

The local-only change is to:

1. Read one exact, structurally coherent stored fixture feed by its neutral
   TouchLine fixture reference; return a named unavailable response if it is
   absent or invalid.
2. Convert it through an explicit public allowlist: neutral IDs, verified
   timestamp, match/team names, schedule/status/scores, and bounded lineup,
   formation, sidelined and event fields only. No `provider`, `providerId`,
   `source`, `externalUrl`, raw payload, media URL or media-policy field may
   cross this endpoint.
3. Make `POST` fail closed with `405`. Future ingestion stays a separate,
   protected server job after the remote-data freeze and audit gates close.
4. Update the Arena caller only to consume this public transport shape and
   remove its obsolete `persist=0` request hint. This does not make the Arena
   a canonical match-state authority or clear its separate persistence gate.

### Risks and acceptance

- The stored feed does not include a canonical matchweek pointer, complete
  coverage proof or immutable run/version. It can power an honest exact
  persisted feed, not the owner-required ten-fixture canonical rail.
- A server admin reader remains a least-privilege production gate; isolated
  Preview continues to block this route before it can read anything.
- Tests must prove there is no provider factory/fetch/persistence path, no
  provider-labelled/raw/media field in the serialized public DTO, and no POST
  write. Missing snapshot must be explicit rather than fetched or fabricated.

### Local implementation evidence — 2026-08-09

- Added `readPersistedFantasyFixtureFeed(fixtureId)`, an exact read-only
  stored-feed lookup that rejects invalid IDs, incoherent rows and invalid
  capture timestamps.
- `GET /api/football-data/fantasy/fixture` now requires its existing access
  boundary, reads only that stored feed and returns
  `503 canonical-fixture-feed-unavailable` when absent. It has no provider,
  fetch, persistence or background branch. `POST` is a `405` with `Allow: GET`.
- Added `toPublicFantasyFixtureFeed`, an explicit DTO allowlist. Its serialised
  transport contains no provider-labelled fields, raw payload, external URL,
  remote media URL or media-policy record. Arena's fixture-feed consumer now
  uses that DTO and no longer sends the obsolete `persist=0` hint.
- Focused local validation passed: 27/27 Node tests; `pnpm typecheck`; focused
  ESLint (with only the pre-existing large-Arena Babel advisory); and
  `git diff --check`. No browser/server, database, provider, deployment,
  Preview, sync, import or payment action was performed.
- This does not clear the separate public Club Hub stored-feed transport,
  livescores/schedule/rumours/player-profile routes, canonical-round model,
  durable Arena match state, or release gates.

## Third local slice: live scores and fixture schedule — proposed

The normal livescore GET currently authenticates, calls the provider, merges a
process-memory delta and writes both memory and durable state. Fixture-schedule
POST can run a provider sync, while schedule GET currently labels a request
time as if it were source freshness.

This local-only slice will make every livescore GET a read of either one
already-persisted coherent live snapshot or an honest partial persisted
schedule. It will not merge snapshots at request time, write memory or a
database, fetch a provider, or use a request-time timestamp as source
freshness. Schedule POST will fail closed with `405`.

### Explicit limits

- Existing fixture tables have no immutable matchweek projection, coverage
  proof, finalisation pointer or shared version. A partial persisted schedule
  must not be called a canonical ten-fixture round or drive the required rail.
- Existing generic public fixture transport still requires a separate global
  crest/identifier DTO hardening before a production claim of fully
  provider-neutral public transport. This slice removes the remote ingress and
  write behavior only.
- Arena local storage remains a presentation cache, not canonical shared state;
  client and shared-projection work remain separate release gates.

### Local implementation evidence — 2026-08-09

- `GET /api/football-data/fantasy/livescores` now reads exactly one durable
  `readPersistedLiveScoreSnapshot` result. It returns that snapshot with its
  stored timestamp, or an explicitly degraded partial persisted schedule when
  no durable live snapshot exists. It no longer imports or calls the provider,
  process-memory snapshot reader, delta merger, or any persistence helper.
- `GET /api/football-data/fixture-schedule` now reads only
  `readPublicCompetitionFixtures`. It reports an honest partial persisted
  schedule with no fabricated capture timestamp; an absent schedule returns
  `503 persisted-fixture-schedule-unavailable`.
- Both route mutations are fail-closed: schedule `POST` returns `405` with
  `Allow: GET`; no browser-visible route remains an ingestion/sync path in
  this slice.
- Arena's polling names and request paths were narrowed to persisted snapshot
  reads. The removed `refresh`/`preferSnapshot` query hints can no longer
  upgrade a public squad read into a provider refresh.
- Focused boundary, latency, fixture, schedule, squad and Live regressions
  passed `32/32`; TypeScript, focused ESLint and `git diff --check` passed.

This is a local code checkpoint only. It does not create a matchweek pointer,
durable Quick Sub state, remote data run, Preview, or production release.

## Fourth local slice: Arena signals/news — proposed

`GET /api/touchline-arena/rumours` currently uses provider news, fixture-feed
and live-event calls directly from a browser-reachable route. There is no
persisted, versioned public signal projection that can safely replace those
calls today.

The safe local change is deliberately fail-closed: return a stable empty,
explicitly unavailable response; remove all provider, cache, HTTP and
environment-token code; and stop the Arena news client from passing fixture
identifiers to the route. This does not deny that future signal data can exist:
it requires a separately approved server-owned, versioned persisted projection
before anything can be published.

### Risks and acceptance

- The news panel will show an honest unavailable state rather than live news,
  lineup, injury or event claims. That is preferable to fetching, writing or
  fabricating data during a public request.
- The replacement must contain no provider factory, provider HTTP helper,
  provider token, cache wrapper, dynamic timestamp or source branding.
- The Arena caller must not derive or send raw fixture identifiers solely for
  this unavailable route.
- Focused tests must prove the route and caller boundary; no remote provider,
  database, browser, Preview or deployment operation is part of acceptance.

### Local implementation evidence — 2026-08-09

- The route now returns a stable empty `state: "unavailable"` response with
  `private, no-store`; it has no request argument, provider/cache/HTTP imports,
  environment access, synthetic timestamp or source label.
- Arena News now calls the fixed route literal and no longer derives or sends
  fixture identifiers to it.
- The dedicated signals boundary test passed `2/2` (and the combined persisted
  reader subset passed `9/9`) before a later local filesystem read timeout
  affected unrelated legacy files. That I/O condition is an environment gate,
  not a pass claim for the remaining type/build suite.

## Fifth local slice: ClubHub profile fixture surface — proposed

The public ClubHub profile currently combines a process-memory live snapshot
with persisted feeds and schedule rows. It also permits a persisted fixture
team logo URL to become a rendered image fallback. Neither is valid as a
shared, durable public source.

This local slice will use only the existing persisted feed and schedule
readers, preserve the current empty/unavailable fallback, remove provider
hints from the page call site, and map a fixture team only to an existing local
club crest. It will not create an immutable fixture projection, canonical
matchweek, new data source, or remote data operation.

### Risks and acceptance

- A process-local live update may cease appearing before the durable reader has
  it; the page must show the persisted result or its existing honest fallback,
  never merge visitor-specific state.
- Unknown fixture teams deliberately fall back to the selected canonical club
  crest rather than rendering a remote logo URL.
- Tests must prove the public page has no memory snapshot/provider call hint or
  raw team-logo fallback, while keeping both persisted readers and its empty
  state.

### Local implementation evidence — 2026-08-09

- The ClubHub profile now reads only `readPublicFantasyFixtureSnapshots()` and
  `readPublicCompetitionFixtures()`; the process-memory live snapshot and
  provider-specific page arguments are gone.
- Fixture previews use the matched canonical club asset only; no raw fixture
  team logo URL can become a public image fallback.
- The existing ClubHub snapshot test and the new persisted-fixture boundary
  test passed `6/6` together with the signals boundary regression.
