# TouchLine Final Product Completion — Current State

This is the sole authoritative continuation ledger. It supersedes the former
Full Product Recovery ledger without deleting its historical evidence.

## Resume protocol

At the beginning of every execution:

1. Inspect `git status --short`.
2. Read `git rev-parse HEAD` and the latest commit.
3. Read this ledger and `touchline-final-product-state.json`.
4. Resolve the newest safe checkpoint from the current branch; never use a
   hardcoded historical checkpoint.
5. Continue the first incomplete executable item below.

Safety boundaries remain unchanged: no Stripe Live, real payments, legal/tax
configuration, destructive production operation, unapproved commercial rule
change, or production promotion.

## Current execution items

| # | Item | Status | Current evidence | Next executable action |
|---:|---|---|---|---|
| 1 | Market Value Engine | EXTERNAL_HARD_GATE | Canonical server-owned import/read architecture, admin workflow, CSV template and safety report exist locally. Football Benchmark is subscriber/download data and FootballTransfers bulk-reuse rights are not confirmed. A Football Benchmark demonstration/quotation is requested as a Football agent / representative for Player Valuation only, to support licensed agents consulting player values through TouchLine. England, Spain, France, Brazil, Germany and Malta first divisions are requested, with Malta coverage to be confirmed. No subscription, paid trial or charge is active. | Review Football Benchmark's written proposal for price, coverage per league, agent-user access limits, storage/public-display rights and delivery method; retain `Market Value Pending` until reviewed values are imported. |
| 2 | Unified Card Engine and Market Transfer journey | PRODUCTION_VALIDATED | The mandatory sequence is coach → formation → 3 GK → 6 CB → 2 RB → 2 LB → 5 CDM → 6 MID → 6 ATT → 5 ST. The balanced limits total exactly 35. Future steps stay locked during first build; full positions enter the existing no-refund replacement flow. Production DOM, desktop and 390×844 mobile were validated without horizontal page overflow. | Validate one real funded purchase/replacement journey with a controlled ClubOwner; do not alter pricing or activate real payments. |
| 3 | Canonical tiers and borders | COMPLETE | One versioned 0/1/2/4/7/10/15 policy and seven visual tiers; no ranking-derived pricing. | Regression-only. |
| 4 | Active-season stability | COMPLETE | Stored active-contract tier is propagated and browser roster V5 retains its authority marker. | Regression-only. |
| 5 | New-player classification | CODE_COMPLETE | Canonical Card Engine classifies an approved new player without a live gameplay dependency; missing value remains pending. | Validate after an approved import sample exists. |
| 6 | Bench organisation | COMPLETE | Selection follows availability; presentation is GK → DEF → MID → ATA, never value or price. | Regression-only. |
| 7 | Responsive card layout | CODE_COMPLETE | The Arena no longer blocks portrait phones: the field can still enter immersive landscape, while portrait renders the real ClubOwner journey. The guided Market Transfer sequence uses a touch-scrollable step rail on narrow screens. Local 390×844 evidence is stored under the official audit evidence folder. Controlled authenticated phone/tablet and remote WebKit remain unvalidated. | Publish a Preview from the current safe checkpoint, then run the controlled device/browser matrix. |
| 8 | Public provider-brand removal | COMPLETE | Public product wording is TouchLine-branded; provider identities remain internal/Admin metadata. | Regression-only. |
| 9 | Preview validation | IN_PROGRESS | Preview `dpl_HKg7j1uNo6XNChb6kCn7MTjZrKB6` for application checkpoint `0c8e3f99` is Ready at `touchline-arena-official-h8a48q82g-fifa-agent-plataform.vercel.app`. TypeScript, ESLint, 668 tests and production build pass. The position journey was validated locally on desktop/mobile and through production DOM after Luiz explicitly authorised this scoped production publication. | Continue the controlled authenticated ClubOwner journey and remaining browser/device matrix. |
| 10 | Final Zero-Defect Audit | IN_PROGRESS | Historical completed recovery blocks are preserved; external controlled-persona, historical-data and device gates are separately tracked. | Continue only non-external audit items after current Preview validation. |
| 11 | Training Centre → Arena XI preview journey | NOT_STARTED | Owner-approved presentation flow recorded on 2026-08-06: Market Transfer builds the full club; Training Centre owns the XI, nine-match bench and remaining squad; an explicit “Ver meu time na Arena” action presents only the saved XI; substitutions return to Training Centre and the next Arena view reads the newly saved XI. Normal Arena visits remain empty. | Implement only after the current idle-Arena correction and active audit sequence; bind any official matchday eligibility to the server-owned TouchLine competition engine. |

The future “send the selected XI into Arena only for an official game round” rule
must remain attached to the server-owned TouchLine competition engine. It must
not be inferred from a Premier League date, a browser clock, or a public fixture
feed. No client-only game-day gate is claimed until that engine state is exposed
and validated end-to-end.

## 2026-08-09 persistent recovery checkpoint

### Incident and preservation rule

- The macOS restart removed uncommitted candidate worktrees under `/private/tmp`.
  No production, database, import, sync, payment, or deployment action was made
  from those worktrees. The committed baseline and the user’s original dirty
  worktree remained intact, but the uncommitted candidate overlays are not
  recoverable as Git commits.
- All newly validated local work must now live in a persistent workspace worktree
  and receive an explicit local Git commit before another independent block
  begins. Generated `.next`, `next-env.d.ts`, and `tsconfig.tsbuildinfo` output is
  never part of that checkpoint.

### Reconstructed public-only checkpoint

- Candidate: `work/public-immutable-recovery-20260809`, based on
  `a2dce1a9a18ee084c7201ac9f80aa6e275b99aa7`.
- Scope: an exact approved-locale registry for `en-GB`, `pt-BR`, `es-ES`,
  `it-IT`, `fr-FR`, `ar-SA`, `tr-TR`, and `de-DE`; fail-closed rendering for the
  two complete human catalogues only (`en-GB`, `pt-BR`); pre-SSR canonicalisation
  of incomplete/invalid locale requests to English; a human-translation review
  contract; an honest 20-club pre-season official-table state; and a static,
  non-personal seven-category coach-card framework in Club Hub.
- Evidence: focused tests passed (18/18), direct TypeScript checking passed, and
  `git diff --check` passed. Local no-credential visual checks covered Club Hub
  at desktop, 390px mobile, and 768px tablet for EN/PT and the intentional
  incomplete-locale fallback; the table correctly showed `unavailable` with no
  configured data source.

### Release gates retained

- This checkpoint is **not production-ready**. Six approved locales have no
  complete human catalogue or route-by-route/RTL review. Arabic remains
  render-disabled until its catalogue and RTL QA are complete.
- Shared public data still needs immutable server-owned projection/version
  contracts; a five-minute mutable table cache is not a completed global
  canonical projection.
- Arena fixture-round selection and real Quick Substitution require a durable
  server-owned match context, revision, idempotent event/audit design, and a
  remote-approved persistence integration. They must not be promoted from a
  local presentation state.
- Isolated Preview requires a dedicated, independently verified Vercel project,
  strict credential allowlist, project binding, and no-auth/no-data route
  envelope. No Preview or production deployment is authorised by this local
  checkpoint alone.

## 2026-08-09 Arena Quick Substitution — durable-state proposal (LOCAL_ONLY)

### Diagnosis

- The current `confirmBenchSwap` implementation is a Training Centre roster
  swap: it replaces an XI card with a bench card, returns the outgoing card to
  the bench, and persists the edited lineup. Its selection is React-only.
- `/api/touchline-arena/state` persists formation and a canonical XI only. It
  has no match identifier, frozen nine-player matchday bench, revision, event
  ledger, or `substituted_out` state. Browser storage cannot provide audit or
  reload-safe authority.

### Safe local implementation

- Add a pure, server-agnostic protocol/reducer only. It must accept an
  immutable match snapshot with exactly 11 active inventory IDs and exactly 9
  bench inventory IDs, and apply an idempotent command containing a command ID,
  expected revision, actor, incoming/outgoing IDs and timestamp.
- It must reject stale revisions, unknown IDs, inactive outgoing players,
  active/non-bench incoming players, duplicate command conflicts, and any
  attempt to re-enter after an outgoing player is substituted out. It must not
  infer or enforce a maximum number of substitutions.
- This local protocol has no browser, fetch, database, Supabase, storage, API,
  or UI wiring. It is a testable contract, not a deployed game feature.

### Risks and acceptance

- A real feature requires a server-owned per-match snapshot/event projection,
  protected transactional command endpoint, ownership/revision checks,
  correction/retraction policy, immutable audit records and controlled-session
  QA. Those require remote schema/API work and remain blocked by the SQL
  incident.
- Acceptance for this local block: exact 11+9 validation; successful
  substitution records the outgoing ID as `substituted_out`; replay of the same
  command is idempotent; a reconstructed state still rejects re-entry; invalid
  IDs/revisions are rejected; no maximum-substitution limit is encoded; tests
  prove the module has no I/O boundary.
- Local evidence: the pure protocol and its seven focused tests pass; direct
  strict TypeScript checking of the module and `git diff --check` pass. No
  full-app typecheck is claimed from this worktree because its dependencies are
  intentionally not installed there.

## 2026-08-09 release static audit — NO-GO

- Audited candidate: `work/arena-durable-protocol-recovery-20260809` at
  `ba71e48c9f0960c0e62488f137fc1c237732372b`; its Git worktree is clean and
  persisted locally. It is a protocol checkpoint, not a release candidate.
- `app/arena/ArenaClient.tsx` is unchanged from the `a2dce1a9` baseline. The
  current UI still returns outgoing players to the bench and saves lineup state;
  it does not consume the durable protocol, hide the rail in Quick Sub mode, or
  guarantee reload-safe no-reentry.
- The current fixture rail can show partial selections and retains text/status
  presentation; it is not the required canonical, persisted, exact-ten-fixture
  matchweek projection.
- Six approved human locales remain incomplete and fail closed to English.
- Arena/Live browser paths can still reach internal football endpoints that
  fetch provider data and can persist a live-score snapshot; this violates the
  current remote-data freeze for Preview or authenticated QA.
- The shared official table remains a mutable five-minute server cache, not an
  immutable versioned public projection. Admin is not part of this candidate.
- No isolated Vercel project/environment/callback envelope is proven, and no
  fresh full-suite/lint/typecheck/build/device QA is claimed for this commit.

**Decision:** Preview and production are blocked. The next release-oriented
candidate must include the durable server integration after the SQL incident is
closed, the persisted-only public data boundary, complete reviewed locales, and
the full validation matrix; it must not use this protocol checkpoint as a
substitute for those requirements.

## 2026-08-09 Arena Quick Sub UI integration audit — REMOTE GATED

### Rendered local evidence

- Candidate: `work/arena-durable-protocol-recovery-20260809` at
  `df0ec7a2933873adba8f88170da973fdb45e5d26`, launched locally without an
  `.env.local` or authenticated session. `?demoLineup=1` rendered an Arena XI
  and the Arena Menu.
- The rendered `Quick substitution` control is a link to
  `/club-owner/me/substitution`, not an in-Arena Quick Sub mode. The legacy
  ClubOwner route redirects the unauthenticated local session to login. This
  confirms the requested no-route-change/no-flicker experience does not exist.
- Local dev logs show only GET requests during this reproduction; no POST or
  PUT was issued. Some existing Arena effects nevertheless requested fixture,
  squad and ranking endpoints. Their responses were unavailable/read-only in
  the observed local run, but those route families can reach persisted/provider
  readers when credentials exist. The local server was stopped immediately and
  no further browser QA is permitted until the fail-closed Preview/data boundary
  is implemented and proven.
- Source boundary: `confirmBenchSwap` changes `players` and `benchPlayers`,
  puts the outgoing player back on the bench, and calls browser roster
  persistence. The generic state effect subsequently PUTs the XI to
  `/api/touchline-arena/state`. The state route stores no match ID, frozen
  nine-player bench, event log, revision or `substituted_out` state.
- The current fixture rail is independent of the bench route, has team/status
  controls, and may render any non-empty fixture selection. It is not a
  server-published exact-ten-fixture canonical round.

### Integration proposal and risk

- The pure protocol in `durable-quick-substitution.ts` is the future reducer,
  not a client-side replacement for server authority. A future Arena UI must
  render a server-published match snapshot, dispatch protected idempotent
  commands, and derive field/bench state from the published projection.
- It must not mutate saved roster/XI state, return an outgoing player to the
  bench, open a separate ClubOwner route, or infer a maximum substitution cap.
- It also needs a server-owned canonical matchweek/fixture pointer before the
  rail can be hidden/restored truthfully around a substitution.

### Minimal external gate and acceptance

- Required before UI/API wiring: approved schema and transaction for match
  snapshot + event ledger; protected command endpoint with owner/match/revision
  validation; correction/retraction policy; persisted canonical round pointer;
  and controlled authenticated-session QA. These are remote/schema changes and
  remain prohibited while the SQL incident is open.
- After that gate, acceptance is: exactly 11 active + 9 frozen bench IDs;
  entire Quick Sub flow stays within Arena; outgoing is visibly and
  semantically `substituted_out`; reload/reconnect preserves no-reentry;
  carousel hides/restores without changing route; no current roster/XI PUT is
  issued; and controlled desktop/mobile/tablet/TV/WebKit accessibility QA
  passes.

**Decision:** do not integrate the protocol into the current client UI. The
next safe work advances to public-candidate/release-audit preparation while the
remote match-state gate remains open.

## Current external gates

- Controlled non-financial ClubOwner/Admin personas for cross-session and device validation.
- Verified historical player-season coverage before publishing historical totals.
- Approved/licensed market-value source and approved data import before public values can replace pending states.
- Native WebKit/phone accessible validation.
- Deliberate production promotion after all acceptance gates pass.

Historical release evidence above remains historical evidence only. The latest
safe checkpoint must always be resolved from the newest committed HEAD of the
candidate currently under validation; never infer eligibility from an older
Preview, production checkpoint, or a dirty worktree.

## 2026-08-09 recovery release-audit checkpoint — NO-GO

- Candidate: `work/public-release-audit-recovery-20260809` at
  `3eb163da74e43977aecbfbbbb35cdd3b30d27cb1`, based on
  `a2dce1a9a18ee084c7201ac9f80aa6e275b99aa7`. The candidate is a persistent
  local checkpoint for public Club Hub/table/locale work and a pure durable
  Quick Sub protocol; it is not a release implementation of the Arena feature.
- The full provenance, included/excluded file-scope description, binary gate
  matrix and required validation evidence live in
  `docs/touchline/release-audit/RELEASE_GATE_3eb163da_2026-08-09.md`.
- `PREVIEW = NO-GO` and `PRODUCTION = NO-GO`: six approved human locales are
  incomplete; real Arena Quick Sub still navigates to a separate route and
  mutates saved roster state; durable server match authority and an immutable
  shared-public projection model are absent; the browser/data boundary and
  Vercel isolation remain unproven; Admin is separate; and no full validation
  run exists for this exact SHA.
- Static public-data audit confirms the browser/data boundary is a concrete
  blocker rather than a hypothetical one: the public Club Hub squad GET may
  reach a provider and persist; public player profiles and Arena rumours have
  provider paths; Arena live-score/refresh paths may persist; and authenticated
  layouts record telemetry. Public server readers use the admin client, so a
  Preview with inherited credentials cannot be called isolated. The required
  fix is persisted-only public readers plus a proxy-first fail-closed Preview
  envelope and independently verified dedicated-project environment.
- The next safe action is local-only: close the static public-data/Preview
  boundary audit and commit that evidence. Do not treat a historical Preview or
  production deployment as validation of this recovery checkpoint.

## 2026-08-09 isolated Preview boundary proposal — LOCAL_ONLY

- Candidate: `work/preview-isolation-boundary-recovery-20260809` at
  `69273380f88d1f21b85e73d993eb9c6f9b69de79`, created clean from the
  persisted release-audit checkpoint.
- Evidence before code: a generic Preview may inherit real admin/auth/provider
  credentials; public paths currently include provider/persist behaviour; an
  unknown Vercel host can resolve auth callbacks to `touchline.com.br`; and
  page-level analytics can write after an authenticated render. A different
  hostname alone is not isolation.
- Proposal, risks, local acceptance and external Vercel gate are recorded in
  `docs/touchline/architecture/ISOLATED_PREVIEW_BOUNDARY_2026-08-09.md`.
  The local implementation must be a proxy-first, no-store/noindex, no-
  redirect envelope that blocks all dynamic product/API/auth routes in explicit
  `isolated-preview` mode. It intentionally is not a functional product QA
  Preview.
- No deployment, Vercel linking, dashboard access, remote environment change,
  browser validation, database operation, sync or payment action is authorised
  by this proposal.

### Local boundary implementation and validation

- Added a pure strict environment/route contract in
  `lib/touchlinePreview/isolation.ts`. A Preview is active only with exact
  `isolated-preview` server/public markers, Vercel `preview` identity, valid
  generated hostname and matching injected project/team IDs. Recognised app
  credential/integration settings reject by key name without exposing values.
- `next.config.ts` fails a declared Vercel Preview configuration that does not
  satisfy that contract. `proxy.ts` applies the policy before hostname, locale,
  audit, auth or Supabase; only inert `/preview` is allowed, while all other
  dynamic routes (including API/auth/private/product and `/_next/image`) are
  no-store/noindex/CSP-restricted and never redirect.
- The inert Preview shell has no product data/auth/analytics integration, and
  root layout suppresses `TouchlineActivityTracker` plus production canonical
  metadata when it receives the proxy marker.
- Local evidence: 4/4 focused boundary tests passed; direct config import
  accepted a synthetic valid isolated environment and rejected a synthetic
  forbidden-key environment without echoing the value; `git diff --check`
  passed. No full application build, browser, Vercel, database/provider/auth
  call, remote environment or deployment was made.
- This does **not** clear the external Preview gate. The dedicated Vercel
  project/effective name-only environment readback, no-production alias and
  independently observed `/preview` response remain required. It is also not
  a functional product QA Preview while public provider/data paths and the
  six incomplete human locales remain unresolved.

## 2026-08-09 public persisted-read boundary — SQUAD SLICE PROPOSED

- Candidate: `work/public-read-boundary-recovery-20260809` at
  `e6db61d37e05b44fb6b7f0a367e1600f68d47826`, created clean from the
  isolated-Preview checkpoint.
- Static evidence: public/Browser callers can reach `premier-squad`, which
  currently calls the football provider and persists a snapshot when stale or
  missing. Fixture feed/livescore, rumours and player-profile surfaces have
  additional provider/write chains and remain separate slices.
- This first local-only change must turn `premier-squad` into a thin wrapper
  over a server-only coherent persisted snapshot + verified projection reader.
  It must fail closed on a missing snapshot, label a coherent stale snapshot
  as degraded/LKG, and ignore `refresh` rather than treat it as a write grant.
- Proposal, risk and acceptance are recorded in
  `docs/touchline/architecture/PUBLIC_PERSISTED_READ_BOUNDARY_2026-08-09.md`.
  No provider/data call, sync, migration, database operation, server, browser,
  Preview or deployment is authorised by this local code slice.

### SQUAD SLICE IMPLEMENTED AND LOCALLY VALIDATED

- `premier-squad` now reads only the coherent persisted snapshot and verified
  public projection. It has no provider factory, provider fetch, background
  task, snapshot persistence, or refresh/prefer-snapshot upgrade branch.
- Missing/incoherent snapshot: `503 canonical-squad-unavailable`. Coherent
  stale snapshot: explicit `outage-fallback`/`degraded`; it is never refreshed
  from this public request.
- Evidence: 37/37 focused no-network Node tests passed; `pnpm typecheck`,
  focused ESLint and `git diff --check` passed. The typecheck also exposed and
  corrected a strict narrowing defect in the inherited Preview isolation
  helper (`isPresent` is now a TypeScript predicate). No remote action was
  performed.
- This is not a release clearance: the fixture/livescore/schedule/rumours/
  player-profile public boundaries, least-privilege reader, canonical shared
  projections, durable match state, six human locale catalogues, rendered QA,
  and external Preview gates remain blocked.

## 2026-08-09 eight-locale surface contract — LOCAL_ONLY

- Proposal/risk: a locale catalogue alone cannot clear release when metadata,
  PWA, error, auth, owner/Admin, private market and public data pages can still
  render unreviewed copy. The exact approved vocabulary must remain eight and
  the six incomplete catalogues must remain fail-closed.
- Implemented a checked-in release-surface manifest and review template:
  root/navigation; Club Hub/profiles; Live/rankings/tables; market/cards;
  auth/recovery; private owner/Admin/Inbox; metadata/PWA/recovery. Each record
  requires content, metadata, viewport and persistence review; Arabic also
  requires RTL review.
- Acceptance evidence: 12/12 focused locale-contract/public-boundary tests,
  `pnpm typecheck`, focused ESLint and `git diff --check` passed locally. No
  human translation was invented, no incomplete locale was enabled, and no
  remote/browser/deploy action occurred.
- Release remains blocked until the six human catalogues have source/hash,
  named translator/reviewer and route-by-route visual/persistence evidence;
  English/Portuguese also need their remaining whole-site metadata/PWA/auth/
  private-surface audit evidence.

## 2026-08-09 public persisted-read boundary — FIXTURE SLICE PROPOSED

- Evidence: the authenticated fixture GET still instantiates the provider and
  the owner POST persists it. Its client transport inherits provider-labelled
  fields despite raw media removal.
- Local proposal: exact persisted-feed reader + explicit public allowlist;
  named unavailable on absence; no provider/write branch; POST `405`; Arena
  caller consumes neutral fields and drops `persist=0`.
- Risk/gate: this does not create canonical matchweek/version/coverage state,
  does not clear Arena account-state persistence, and retains the separate
  least-privilege DB reader/isolated Preview requirements. No remote work is
  authorised by this proposal.

### FIXTURE SLICE IMPLEMENTED AND LOCALLY VALIDATED

- Added exact persisted-feed lookup and explicit public DTO allowlist. Fixture
  GET is now persisted-read-only and named-unavailable on absence; POST is
  `405`. It no longer imports/uses provider, fetch or persistence functions.
- The public serialised feed excludes provider-labelled metadata, raw payloads,
  external URLs, remote media and media-policy data. Arena consumes neutral
  fixture/team IDs and no longer sends `persist=0`.
- Evidence: 27/27 focused Node tests passed; `pnpm typecheck`, focused ESLint
  and `git diff --check` passed. The linter emitted only its existing large
  `ArenaClient` Babel advisory. No remote action occurred.
- Remaining blockers: stored Club Hub feed transport, livescores/schedule,
  rumours/player profiles, immutable shared projections/canonical round,
  durable match authority, six human locales, Preview and rendered QA.

## 2026-08-09 public persisted-read boundary — LIVE/SCHEDULE SLICE PROPOSED

- Evidence: normal livescores GET can provider-fetch, merge process memory and
  persist; schedule POST can sync/write; schedule GET uses request time as a
  false source freshness marker.
- Local proposal: persisted live snapshot *or* partial persisted schedule only,
  no merge/fetch/write/auth escalation; no fabricated freshness; schedule POST
  `405`.
- Explicit non-goal/gate: no matchweek pointer/version/coverage or permanent
  canonical rail is created. Generic fixture DTO/remote crest hardening and
  Arena browser-cache authority remain separately blocked.

### LIVE/SCHEDULE SLICE IMPLEMENTED AND LOCALLY VALIDATED

- Candidate: `work/public-read-boundary-recovery-20260809`, pending its
  dedicated local Git checkpoint.
- `fantasy/livescores` now returns one persisted durable live snapshot, or an
  honestly degraded partial persisted schedule. It cannot provider-fetch,
  merge process memory, write a live snapshot, or emit request-time freshness.
- `fixture-schedule` GET is a persisted reader only; missing data is an honest
  `503`. Its POST is fail-closed with `405 Allow: GET` and cannot run a sync.
- Arena calls the endpoints as persisted reads and no longer sends
  `refresh`/`preferSnapshot` upgrade hints for squad loading.
- Focused tests: `32/32` passed across persisted squad/fixture/live/schedule,
  latency and Live integration boundaries. `pnpm typecheck`, focused ESLint
  and `git diff --check` passed. No browser, provider, database, sync,
  migration, Preview, deployment or payment action was performed.
- Release remains **NO-GO**: the stored fixture model has no canonical
  matchweek/finalisation pointer or immutable coverage/version; real durable
  Quick Sub requires server match authority; six approved human locales remain
  incomplete; and all Preview/visual/release gates are still open.

## 2026-08-09 public persisted-read boundary — ARENA SIGNALS SLICE PROPOSED

- Evidence: the browser-reachable rumours endpoint directly requests provider
  news, fixture feeds and live events. No versioned persisted public signal
  projection exists today.
- Local proposal: remove that ingress entirely and return an explicit,
  stable unavailable state with no fabricated signal, provider/source branding,
  token, request-time freshness or write. Arena will stop sending fixture IDs
  to this unavailable endpoint.
- Risk/acceptance: News becomes honestly unavailable until a separately
  approved server-owned persisted signal projection exists. Static tests must
  prove no provider/cache/HTTP/environment dependencies or fixture-ID caller
  parameter remain. No remote operation is authorised.

### ARENA SIGNALS SLICE IMPLEMENTED — LOCAL I/O VALIDATION GATE

- The endpoint now returns only an empty unavailable state and `private,
  no-store`; it no longer imports provider news/live/fixture code, environment
  credentials, cache helpers or a request-time timestamp. Arena News no longer
  passes fixture identifiers to the endpoint.
- The focused signals boundary suite passed `2/2`; the combined persisted
  reader subset passed `9/9` before a separate legacy-file read returned local
  `ETIMEDOUT` during a broader test invocation. This is recorded as an
  environment validation gate, not as a release pass.
- Local disk recovery removed only a confirmed old `.next` cache. It increased
  free space from `102 MiB` to `576 MiB`; a temporary three-byte write probe
  succeeded and was removed. No source, Git data, Downloads, assets, database,
  network, sync, Preview or deployment was touched.

## 2026-08-09 public persisted-read boundary — CLUBHUB FIXTURE SLICE PROPOSED

- Evidence: the public ClubHub profile merges a process-memory live snapshot
  with persisted feeds/schedule and can fall back to a fixture-provided remote
  logo URL.
- Local proposal: use only the two persisted readers, retain the honest empty
  fallback, remove provider-specific page hints and permit only canonical local
  club crest assets. No immutable matchweek/version is claimed or created.
- Acceptance: static tests prove no `readLiveScoreSnapshot`, provider literal,
  raw fixture-logo fallback or write ingress remains in that public page.

### CLUBHUB FIXTURE SLICE IMPLEMENTED AND LOCALLY TESTED

- ClubHub now reads only the persisted fantasy-feed and schedule readers. The
  process-memory snapshot and page-level provider hints were removed.
- Fixture team previews use only a canonical local club crest; no raw fixture
  logo URL can enter the rendered fallback.
- Focused ClubHub/signals boundary regressions passed `6/6`. The broader
  type/build suite remains separately blocked by the local filesystem I/O
  condition recorded above; no release pass is implied.

## 2026-08-09 public persisted-read boundary — RETIRED FANTASY ENDPOINTS PROPOSED

- Evidence: authenticated browser `GET` handlers for fantasy events and
  capabilities call the provider; capabilities also persists a response.
- Local proposal: both return a deterministic `410` retired contract with
  `private, no-store`; no auth, provider, parsing, persistence or timestamp
  remains. Future ingestion must be a separately approved server-only job with
  a persisted read model.
- Acceptance: focused static tests prove that both handlers are fail-closed and
  that no consumer is implicitly treated as a release-ready replacement. No
  remote action is authorised.

### RETIRED FANTASY ENDPOINTS IMPLEMENTED AND LOCALLY VALIDATED

- Both handlers now return only `410 TL_FOOTBALL_DATA_RETIRED` with private
  no-store caching. No provider, auth, request parsing, persistence, token or
  dynamic timestamp path remains.
- Focused public-boundary tests passed `14/14`; `pnpm typecheck`, focused
  ESLint and `git diff --check` passed. No database, provider, sync, import,
  migration, Preview, production, payment or deployment action occurred.

## 2026-08-09 owner release-locale decision — CURRENT RELEASE SCOPE

- Luiz explicitly authorises this release target in **`en-GB` and `pt-BR`
  only**. The other approved future locales (`es-ES`, `it-IT`, `fr-FR`,
  `ar-SA`, `tr-TR`, `de-DE`) remain disabled/fail-closed and are deferred to a
  later, separately reviewed update; they must never be represented as
  localized in this release.
- This decision supersedes only the prior requirement that the six deferred
  catalogues block the present release. It does **not** clear the EN/PT
  whole-site copy/metadata/PWA/auth visual checks, Arabic/other-language work,
  public-data boundaries, durable Arena state, isolated Preview or production
  gates.
- No deployment is authorised by this decision. Publication remains contingent
  on a clean immutable candidate, all applicable technical tests, isolated
  Preview evidence, rendered EN/PT page-by-page QA, and the remaining release
  gates below.

## 2026-08-09 Manchester City manual-value import — LOCAL PROPOSAL

- Owner-authorised input is the local staging artifact
  `docs/touchline-arena/audit/2026-08-07/premier-league-market-value-staging/manchester-city-2026-27-staging.csv`
  in the preserved source workspace. It contains 32 TouchLine player UUIDs:
  31 rows with an explicit EUR value and one fully blank-value row. The
  artifact has no player-name or valuation-date column; its path date is
  **artifact provenance only**, not an asserted valuation date.
- Local migration design: seed the exact UUID/external-ID/value rows, require
  every UUID to resolve to one active Manchester City membership and the
  canonical team ID `9`, then fail the whole transaction on any count,
  identity, club or membership mismatch. The seed uses the UUID as the only
  identity key; names and external IDs are not inferred.
- The 31 explicit EUR rows may upsert only the TouchLine-owned
  `football_player_market_values` record, immutable value history and protected
  import/job audit rows. The blank row stays `pending`, creates only a pending
  import-item audit record, and never inserts, clears or fabricates a current
  value.
- Explicit exclusions: no update to `touchline_card_inventory`,
  `touchline_card_contracts`, card tier, card price, price table, wallet,
  order, supply or active-contract state. This artifact is local SQL only and
  is not authorised to run against any database.
- Risks: current remote club membership and previous values are unknown under
  the open SQL-incident freeze; execution must remain fail-closed. The CSV's
  external URL is retained only as protected import provenance and is never
  fetched or exposed as public product copy.
- Acceptance: a static test must prove 32 unique UUID rows, exactly 31
  `verified` and one `pending`, exact club/membership guards, no current-value
  write for the pending UUID, immutable history only for verified rows, and no
  tier/price/inventory/contract mutation. A focused test, typecheck, lint and
  whitespace check are required before any remote application; a bounded local
  validation failure must be recorded rather than hidden and still permits a
  clearly marked source-only checkpoint.

### MANCHESTER CITY LEGACY CHECKPOINT — SUPERSEDED, NOT CURRENT CANDIDATE

- Candidate: `work/touchline-manchester-city-manual-import-20260809`, based on
  `64fd1f2b64f13b09e7c40ff836d557ff1bab6a23` before this local checkpoint.
- Added local migration `051_touchline_manchester_city_manual_market_values_2026_08_09.sql`, an exact source-transparent staging manifest and a static
  guard test. It seeds the 32 supplied UUID rows and requires all of them to
  resolve to one active Manchester City membership with canonical team ID `9`.
  Any database-state mismatch aborts the transaction before a value write.
- Projected import scope: 31 explicit `verified` EUR values totalling
  EUR 1,312,900,000; one `pending` UUID
  `b5d80b41-b77c-4459-9dc3-5d56d35e3e86` with no current-value/history write.
  The pending row is audit-only with `TL_OWNER_VALUE_MISSING`; it preserves any
  pre-existing last-known-good value rather than clearing it.
- Direct local source-transcription comparison passed for all 32 rows. The
  focused static suite passed `5/5`, covering exact data, identity/membership
  fail-closed guards, pending isolation and economy/contract exclusions.
- Full `tsc`/ESLint validation was started but could not complete because the
  local filesystem had pre-existing stuck I/O workers; the owned `tsc` child
  was stopped after the bounded attempt. This is a **local validation gate**,
  not a claimed type/lint pass. No generated source artifact changed.
- No SQL was executed; no database, sync, import, deployment, Preview,
  provider call, card, tier, price, contract or payment state changed.
- Luiz subsequently designated the owner-supplied conversation table as the
  only current City authority. Its old staging manifest, unapplied migration,
  and focused test were removed from this candidate after the replacement
  transcript staging passed. This section is retained solely as historical
  checkpoint evidence and must never be used as a data source or applied.

### REMAINING 18-CLUB DATASET RECOVERY — SOURCE GAP

- Local read-only recovery found no verified owner-approved values, per-club
  CSVs, consolidated manifest or player/club mapping for Arsenal FC, Aston
  Villa, AFC Bournemouth, Brentford FC, Brighton & Hove Albion, Chelsea FC,
  Coventry City, Crystal Palace, Everton FC, Fulham FC, Hull City, Ipswich
  Town, Leeds United, Manchester United, Newcastle United, Nottingham Forest,
  Sunderland AFC or Tottenham Hotspur.
- Liverpool is excluded from this batch by owner direction, but local files do
  not prove whether its historical `052` artifact ever committed remotely; the
  open SQL-incident audit remains the only authority for that question.
- Do not generate a consolidated 19-club import or fill any missing rows until
  the original owner-approved data artifact is recovered. The generic template
  and synthetic test fixtures are not evidence and must not be reused as data.

## 2026-08-09 card-value rendering preflight — REQUIRES_LUIZ_DECISION

- Current source chain is split. A verified current value in
  `football_player_market_values` is exposed to public profile/ClubHub
  projections and their public classification currently derives a tier, border
  colour and nominal tier price from the approved market-value bands. Pending
  values are intentionally displayed as pending/unavailable.
- Active contracts are a separate exception: their stored card tier and price
  table remain authoritative and must not be recoloured or repriced by a value
  import. Migration `051` preserves this by not writing inventory, contracts,
  tiers or price tables.
- Market/Arena currently consume the separate `touchline_card_inventory` read
  model. That model is not updated by `051`; therefore a future City import can
  make a public profile verified while a Market/Arena card remains stale or
  pending. This is a consistency failure, not a valid end-to-end card pass.
- The public projection cache can retain a prior state for up to five minutes;
  a future approved run must publish/invalidate a coherent revision before any
  visual assertion of immediate value freshness.

### Proposed decision and acceptance boundary

- **REQUIRES_LUIZ_DECISION:** for uncontracted cards, should a newly verified
  fixed market value recompute the public tier/border colour and nominal price
  using the existing seven-band policy, or should a season-published
  classification be frozen separately? The current code does the former;
  Admin copy describes an active-season freeze. Do not silently choose between
  them.
- Any approved reconciliation must feed Profile, ClubHub, Market and Arena
  from one server-owned, versioned projection; preserve active contracts;
  keep pending explicit; invalidate/publish atomically; and audit before/after
  tier/colour/nominal-price effects by player.
- Visual acceptance after that gate: controlled verified and pending fixtures
  must show the fixed value only when verified, show no invented value when
  pending, preserve active-contract tier/price, exercise all seven tier border
  bands, and be observed at desktop and mobile. This cannot be claimed from
  the current unapplied City SQL artifact alone.

### Current PENDING card failure — BLOCKER

- The persisted squad API correctly emits `marketValueState` and
  `classificationState` with no `cardTier` for pending players. The ClubHub
  profile mapper currently drops those state fields, which makes the exact-card
  component take its legacy fallback path: a Ruby template and `Total Points`
  `0` rather than the explicit `Market Value Pending` state. Player Profile
  retains the state correctly; ClubHub does not.
- This is a real fail against the owner acceptance criterion, not a visual
  preference. The future local fix must carry both states through the ClubHub
  DTO, render the neutral/pending card path, add a regression test and then
  undergo desktop/mobile visual QA. No tier/price rule change is authorised by
  that fix.

## 2026-08-09 future manual-application authority — GATED

- Luiz has authorised database application of the complete manual-value batch
  without another commercial approval **only after** every club input is
  technically complete, IDs/clubs/counts/rollback plan validate, the SQL
  incident and environment are independently cleared, and the card-projection
  decision above has a coherent implementation path.
- This does not authorise a partial 19-club application, a database query,
  SQL Editor execution, remote sync, deployment, payment or any action while
  those gates remain open.

## 2026-08-09 pending card-state propagation — LOCAL PROPOSAL

- **Evidence:** the persisted public squad response carries
  `marketValueState` and `classificationState`, and the exact-card component
  already renders a neutral, explicit pending state when either is present.
  The ClubHub and Arena adapter DTOs currently discard those fields, which can
  route a pending player into the legacy Ruby/points presentation.
- **Local-only scope:** forward the two server-owned states unchanged through
  ClubHub, Arena lineup/bench/preview and authoritative-roster rebuild DTOs.
  Correct the adapter-only `> 0` checks so a verified EUR 0 value remains a
  valid Ruby value; missing/non-numeric values remain pending. Do not change
  tier thresholds, commercial pricing, active-contract precedence, inventory,
  contracts, database data or API semantics.
- **Risk:** this exposes an existing inconsistency rather than resolving it:
  uncontracted public cards currently derive a classification from a verified
  value, while active contracts preserve their stored tier/price. Market
  inventory is a distinct read model and is not updated by the City artifact.
  The fix must not imply immediate cross-surface consistency or change an
  active card.
- **Acceptance:** a pending state reaches `TouchlineEliteExactCard` on
  ClubHub and Arena and renders `data-card-tier="neutral"`, explicit pending
  copy and no invented price; verified EUR 0 can retain Ruby; an active
  contract retains its stored tier/price. Focused regression tests must pass.
  Controlled desktop/mobile rendered QA remains required later, with a safe
  verified/pending/active-contract fixture; it is not evidence from this
  source-only patch.

## 2026-08-09 owner-approved transcript 19-club recovery/reconciliation — LOCAL STAGED, NOT APPLIED

- **Historical correction:** this supersedes the earlier remaining-18-club
  source-gap conclusion only as to source availability. That earlier
  read-only result remains historical evidence of the then-visible workspace.
- **Source provenance:** exact selected `user_message` records are read from
  `/Users/luizlopez/.codex/sessions/2026/08/08/rollout-2026-08-08T06-46-52-019fdfb2-003a-7fa0-aa05-6b268b203143.jsonl`, under the owner-supplied
  line-to-club mapping. The manifest records each physical JSONL line, UTC
  timestamp, SHA-256 of the message content, and ordered selection hash
  `192692cf3a9cc303df1fd936a84b19e7e41e796f1cb0cf965f399ff08d319f94`.
  A whole-file hash is deliberately not used because the session JSONL
  appends. Raw messages are not copied into the repository or public output.
- **Scope/result:** 19 assigned club blocks; 558 roster rows; 553 explicit
  EUR values; 5 missing-value rows; source total EUR 12,191,600,000. The
  transcript approval timestamp is provenance only, so `valuation_date`
  remains blank. Generated local artifacts are
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/owner-approved-market-values-2026-08-09.csv`
  and its JSON manifest.
- **Parsing and identity:** only explicit owner-supplied EUR M/m/K/k/mil forms
  are converted. Missing/unparseable values remain pending; no EUR 0, Ruby,
  tier, price, or identity is fabricated. Display-name normalization is a
  review candidate only. All 558 rows lack reviewed canonical UUID, provider
  ID, canonical club, team, and active-membership evidence; no row is
  VERIFIED or eligible for a current-value/history write.
- **City source supersession:** Luiz has explicitly designated the
  owner-supplied conversation table as the current Manchester City authority.
  The former FootballTransfers CSV and its local checkpoint are not used,
  combined, compared, or eligible for application. The physical legacy CSV was
  removed after the transcript staging passed; prior derivative checkpoint
  commits are historical only. Every transcript-City row is now
  `REVIEW_PROVIDER_ID_MISSING`, exactly like the other explicit rows, until
  canonical UUID/provider/team/active-membership review completes.
- **Known raw gaps:** transcript values are absent for Denner, Mykhaylo Mudryk,
  Julian Eyestone, Dermot Mee, and Leo Shahar. Mudryk's separate provisional
  owner decision (EUR 41.6m; Emerald only after exact identity review) is not
  inferred from or merged into this name-only transcript batch.
- **Safety boundary:** no tier, colour, price, inventory, contract, wallet,
  offer, database, SQL, sync, provider, Preview, or deployment action was
  performed. A future remote execution remains blocked by SQL-incident
  closure plus complete identity/club/membership review, conflict/duplicate
  report, count/rollback preflight, the card-projection policy decision, and
  independent environment clearance.
- **Local validation:** generator `--check` verified every message hash,
  per-club count, pending count, and total before the local artifacts were
  written. Focused parser/staging tests must verify the no-identity/no-write
  state and City source supersession. Full typecheck/lint/build and rendered desktop/
  mobile QA are separate gates and are not implied by this staging artifact.

## 2026-08-09 transcript-to-canonical-roster reconciliation — LOCAL PROPOSAL

- **Owner direction:** reconcile the owner-approved transcript against the
  canonical Sportmonks roster only by exact normalized player name plus exact
  current club. This creates a review report, not a value write, VERIFIED
  identity, migration seed, or remote call.
- **Local evidence gap:** no committed snapshot exists with the required
  four-way current binding: canonical player UUID, numeric provider player ID,
  canonical current club/team, and active Premier League membership. Runtime
  readers can construct that binding only through a prohibited remote DB read.
  The static club/team registry validates expected team scope but is not player
  identity evidence.
- **Fail-closed design:** the offline reconciler accepts only a separately
  supplied local `touchline-canonical-roster-export-v1` with source run/revision
  provenance and active `provider_competition_id=8` membership. It rejects
  invalid provider IDs, stale/current-club disagreement, inactive membership,
  duplicate candidates, and cross-club names. Without the export it writes a
  blocked report: `LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE`, zero matched,
  no invented unmatched result, and every explicit row remains review-only.
- **Acceptance:** report one count set per assigned club (`matchedCandidates`,
  `review`, `unmatched`, `pendingValues`), source/manifest hashes, roster
  provenance/hash when provided, candidate IDs only on a unique exact match,
  and `applicationEligible:false` on every row. Pure tests must cover missing
  export, unique candidate, ambiguity, inactive/stale membership, other-club
  name, pending value, and absence of provider/DB/write code.
- **Remote gate:** only a later independently authorized read-only canonical
  roster audit/export may supply the missing binding. SQL incident, identity
  review, duplicate handling, guarded migration, rollback preflight, and the
  card-projection decision all remain required before any application.
- **Local report executed:**
  `owner-approved-market-values-2026-08-09.reconciliation-report.json` was
  produced with `--allow-unavailable` and is explicitly `blocked`, not a
  partial success: 558 rows, 553 explicit values in review due to unavailable
  local roster export, 5 pending values, 0 matched candidates, 0 fabricated
  unmatched results, and `applicationEligible:false` for every row. Its
  expected club/team registry covers the exact 19 owner-assigned clubs only.

## 2026-08-09 Luiz permanent file-preservation rule — ACTIVE

- Do not delete, clean, move, rename, overwrite, or otherwise retire files,
  histories, data, migrations, or artifacts without Luiz's explicit
  authorization for the exact target. Do not infer broader authorization from
  a related deletion. If target or scope is ambiguous, stop that action and
  request confirmation.
- The physical legacy City CSV removal was an explicit exception. No future
  cleanup or restoration is implied by that exception.

## 2026-08-09 20-club roster delta / Sportmonks sync diagnosis — READ-ONLY

- **Claim under audit:** owner supplied the current-count observation of 589
  active members over 20 clubs and 560 members over the 19 non-Liverpool
  clubs, versus 558 owner-transcript rows. Local artifacts do not prove those
  counts or identify two player names/IDs. The only local 589/560 occurrence
  is a synthetic test fixture and is not database evidence. No DB query,
  provider call, refresh, sync, deletion, or membership mutation was run.
- **Cause status:** unproven. A numeric difference alone does not establish
  two true extras; it could be stale/duplicate/inactive-scope/current-club
  mismatch, an owner-list omission, or a count-scope difference. Names and IDs
  must remain unknown until a provenance-bearing read-only canonical export is
  available.
- **Required future read-only export:** a versioned
  `touchline-canonical-roster-export-v1` for provider `sportmonks`, Premier
  League provider competition ID `8`, and the exact 19 team IDs. It must carry
  clubs, players, active and exceptional memberships, provider mappings,
  `source_updated_at`, source run/revision/hash/actor, and correlated sync-run
  facts. It must not silently filter invalid rows. The local reconciler already
  consumes the core arrays but remains review-only even for a unique exact
  name/current-club candidate.
- **Current sync risk:** `sync-starter` can call provider and write from GET or
  POST; `starter-sync` writes per player without one club transaction; and
  `persistSquadSnapshot` can auto-inactivate members absent from a payload.
  Those paths do not meet the required no-implicit-exclusion/atomic-audit
  contract and remain blocked.
- **Future safe-sync proposal / acceptance:** immutable per-club source
  snapshot+hash, complete preflight diff, one transaction/RPC per club with a
  revision fence, explicit reviewed add/change/active-to-inactive command,
  append-only per-run/item before-after audit and conditional compensating
  rollback. A retry must be idempotent; incomplete/duplicate/club-mismatch
  inputs must alter nothing; public readers must observe only previous or
  complete next snapshot. Remote gates remain SQL-incident closure, authorized
  read-only export, identity review, environment clearance, and later explicit
  apply authorization.
- **Luiz decision — non-blocking extras:** once a provenance-bearing,
  read-only 20-club export identifies any DB-only records, preserve them in
  the roster and emit `QUARANTINED/PENDING` in the reconciliation report with
  canonical player/provider IDs, club, membership status, source freshness,
  and reason. Do not inactivate, delete, overwrite, assign a manual value, or
  call the roster fully synchronized until the cause is reviewed. This is a
  report classification only; it authorizes no database state change.

## 2026-08-09 canonical card-state propagation and local visual fixture — LOCAL PROPOSAL

- **Evidence before change:** normal ClubHub API cards receive the canonical
  `marketValueState` and `classificationState`, but its persisted fallback
  labels raw legacy player value as verified and loses those states; the V5
  local roster serialization drops both states on round-trip; the Arena bench
  preview drops `cardPriceAuthority`; Arena aggregate/label helpers can
  recompute an active-contract price from current value; and ClubHub card zoom
  can recompute commercial tier/price even where the main card is neutral.
  These are presentation-state propagation defects, not approval to change
  tier bands, colour palette, contracts, offers, inventory, or pricing rules.
- **Local correction scope:** carry canonical states through fallback only when
  they are actually present (otherwise fail closed to pending/unavailable),
  V5 serialization, Arena bench/preview conversions, price label/aggregate
  helpers, and ClubHub zoom details. Preserve an active contract's stored
  authority/tier/price; use EUR 0 only when its state is explicitly verified;
  keep missing or review values neutral and non-commercial.
- **Isolated render fixture:** add an admin-gated `/visual-qa` fixture with
  three clearly labelled synthetic local props only: verified value/classified
  tier, pending/no-tier, and pending current value with an active stored
  contract. It must disable editing, storage persistence, actions, social
  metrics, ranking subscription, interactive neon, network fetches, and all
  provider/DB/account dependencies. It is visual QA only and is not product
  data or a public route.
- **Acceptance:** (1) a pending value never receives a fallback Ruby/tier,
  price, or commercial zoom; (2) an explicitly verified EUR 0 remains Ruby;
  (3) active contract keeps its stored tier/price in main card, bench, zoom,
  label, and aggregate; (4) V5 serialize/parse retains the canonical states;
  (5) focused source/round-trip tests pass and a controlled local desktop and
  mobile render of the isolated fixture has no console/network/hydration error.
  Market inventory reconciliation remains a separate product decision/gate.
- **Safety:** no database, SQL, provider, sync, deployment, Preview, account,
  payment, contract, tier-policy, or inventory mutation is authorized by this
  local presentation block.
- **Checkpoint validation:** local propagation implementation is complete and
  persisted separately from any visual sign-off. Focused card/roster/fixture
  tests passed 50/50; `pnpm typecheck`, `pnpm lint`, and `git diff --check`
  passed (only the pre-existing Babel size note for `ArenaClient`). The static
  fixture remains unrendered by direction: desktop/mobile visual QA is paused
  pending the roster-base audit or an explicit pending result. Generated
  `tsconfig.tsbuildinfo` is intentionally excluded from the logical commit.

## 2026-08-09 EN/PT demonstrable-release audit — NO-GO

- **Audited checkpoint:** `98c2cc0cac55f59eb6b57fb04c5910b0f1b33654`
  on `work/manchester-city-manual-import-20260809`. It is not an immutable
  release candidate: the worktree retains a generated tracked
  `tsconfig.tsbuildinfo` change, deliberately preserved and excluded under the
  file-preservation rule.
- **What passed locally:** 24 static/pure critical-route suites passed
  111/111 under an empty test environment. This covers EN/PT locale boundary,
  navigation, ClubHub/table, persisted Live routes, Market/auth boundaries,
  isolated-preview source boundary, and card state. It is not rendered QA or
  evidence of a deployable environment.
- **Hard safety/product blockers:** public player profile rendering still
  constructs the Sportmonks provider; the root activity tracker can post
  analytics for authenticated visitors; ClubHub/Live/rankings read real
  Supabase state; the strict isolated Preview deliberately exposes only
  `/preview`, not product routes; and Arena's UI Quick Sub still swaps the
  outgoing player to bench/persists roster state rather than using the durable
  frozen 11+9 protocol. The rail also lacks an immutable canonical matchweek
  projection. Any one of these blocks a safe functional demo release.
- **EN/PT quality gates:** only EN/PT are enabled correctly, but whole-route
  rendered locale QA is absent and emitted metadata remains inconsistent
  (for example Live is Portuguese under EN and root metadata is English under
  PT). This blocks a presentation-quality claim.
- **Build evidence:** the local production build stream was interrupted after
  webpack compilation work began; its trace is marked failed and no
  `.next/BUILD_ID` or production manifest was produced. Treat build as
  **inconclusive/failed gate**, not as a pass. A fresh run must be captured
  from a clean pinned candidate after the above safety blockers are resolved.
- **Manual values/extras:** the 19-club transcript remains local review-only.
  No canonical roster export is available, so no value row is matched or
  application-eligible. Future DB-only roster records are report-only
  `QUARANTINED/PENDING`, with no inactivation, deletion, overwrite, or manual
  value; this does not unblock a release or claim a 100% sync.
- **Result:** no Preview, production deployment, database read/write, sync,
  import, provider call, or payment action was performed. The next release
  gate is a clean, isolated EN/PT candidate that removes/fail-closes the
  provider, analytics and real-data paths before rendered QA.

## 2026-08-09 roster / owner-value / card-validation chain — BLOCKED WITH EVIDENCE

- **Scope lock:** this closes only the ordered roster/value chain: (1) a
  read-only 20-club Sportmonks roster audit, (2) preservation of claimed
  extras, (3) identity-and-club reconciliation of owner-approved values,
  (4) a local import artifact, and (5) real-card visual validation. It does
  not begin a new release, Preview, sync, or product scope.
- **Step 1 — roster audit:** blocked under the no-DB rule. No local
  `touchline-canonical-roster-export-v1` exists with canonical player UUID,
  numeric Sportmonks player ID, club/team identity, competition `8`, active
  membership, `source_updated_at`, and provenance/revision. Consequently the
  claimed two DB-only records cannot be named, counted, dated, or assigned a
  sync cause from local evidence; no assertion of `589`, `560`, or a
  100%-synchronised roster is made.
- **Step 2 — extras:** no member was inactivated, deleted, overwritten, or
  given a value. Once an authorised read-only export identifies a valid
  DB-only active member, it is report-only `QUARANTINED/PENDING` with
  `market_value_eur: null` and `application_eligible: false`; this must not
  be written into `football_squad_members.status` or used as a value import.
- **Step 3 — owner-value reconciliation:** source staging integrity passed
  locally: 19 clubs, 558 rows, 553 explicit EUR values, five missing-value
  rows, and EUR 12,191,600,000; ordered source-selection hash
  `192692cf3a9cc303df1fd936a84b19e7e41e796f1cb0cf965f399ff08d319f94`.
  The offline reconciliation and its focused tests passed 9/9 *fail-closed*:
  `LOCAL_CANONICAL_ROSTER_EXPORT_UNAVAILABLE`, zero matched, 553 review,
  five pending, zero unmatched, and 558/558 rows non-application-eligible.
  The missing values remain PENDING, never EUR 0.
- **Step 4 — import artifact:** no migration/import artifact was generated
  from this 19-club batch, correctly. Every candidate ID is blank and a
  name-plus-club result would still require identity review; generating a
  write artifact would misrepresent review data as canonical data.
- **Step 5 — card validation:** the isolated static card-state fixture's
  source test passed 3/3, but it is synthetic only. It proves no real
  owner-approved value, ID mapping, desktop/mobile pixel render, or
  cross-surface product state. Real-card visual QA is blocked until a
  provenance-bearing read-only export, reconciled matched records, and a
  local guarded projection/application path are available.
- **Exact resume gate:** retain a saved, versioned local read-only export with
  the fields above; validate all 20 clubs, active memberships, freshness,
  duplicates, and the DB-only outer diff; then produce the report-only
  quarantine list, reconcile only unique ID/club candidates, and continue
  this same chain. No database, provider, sync, import, Preview, deployment,
  or payment action occurred. The generated `tsconfig.tsbuildinfo` remains
  deliberately preserved outside this logical documentation checkpoint.

## 2026-08-09 SQL Editor incident supersession — HOLD / REQUIRES_LUIZ_DECISION

- **Authority:** the canonical SQL Editor / roster-currency incident gate
  supersedes the earlier read-only-export authorization. No database
  connection, query, SQL Editor action, sync, migration, import, Preview, or
  deployment may resume until that separate incident is independently closed
  with its own evidence and decision.
- **What did not happen:** no DB connection or query was made. The locally
  available process had no configured read-only credential; the one local
  exporter preflight failed before creating a client. No canonical export,
  reconciliation archive, quarantine archive, player ID, club ID, roster
  freshness, or "two extras" result was produced.
- **Preserved local preparation:** the new
  `scripts/export-touchline-canonical-roster-readonly.mjs` accepts only a
  dedicated `authenticated` session plus public anon key, rejects service-role
  semantics, performs select-only two-pass revision fencing, and creates only
  explicitly named new files. It now has a hard
  `TL_SQL_EDITOR_INCIDENT_HOLD_REQUIRES_INDEPENDENT_CLOSURE` stop before any
  configuration/client read; there is intentionally no environment-variable
  bypass. The reconciler now validates all 20 club/team IDs (Liverpool is
  explicitly out of manual-value scope), UUID/provider/current-club/active
  membership/freshness evidence, expected team IDs, and emits report-only
  `QUARANTINED/PENDING` / Liverpool / owner-pending sections only into new,
  non-overwriting dated files.
- **Archive contract:** the staging README documents the future dated archive
  set: canonical export, club/player/value reconciliation,
  quarantined-pending report, validation results, ledger paths, and commit.
  Existing staging and historical blocked reports are never overwritten.
- **Local validation:** 14 focused staging/reconciliation/export tests passed;
  `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed (only the
  pre-existing Babel size note). These tests prove local fail-closed behavior,
  not any DB result.
- **HOLD:** preserve the two alleged extras and every existing artifact. Do
  not name, quarantine, value, inactivate, delete, or otherwise mutate a
  player until the independent incident closure supplies a new explicit
  decision. The next allowable work remains documentary/local only.

## 2026-08-09 Bruno Guimaraes roster placement — PRODUCT DECISION / HOLD

- **Owner decision recorded:** Bruno Guimaraes at **Arsenal FC** is
  intentional/correct. Any TouchLine presentation still assigning him to
  **Newcastle United** is a discrepancy to resolve later; it is not authority
  to move him back to Newcastle or to alter the owner-approved Arsenal row.
  The durable evidence record is
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/PRODUCT_DECISION_BRUNO_GUIMARAES_2026-08-09.md`.
- **No inference:** this decision does not prove a canonical UUID, Sportmonks
  player ID, membership, source timestamp, or sync cause. No database,
  provider, export, sync, or patch was performed to create this record.
- **Authority split:** Sportmonks is the definitive canonical source for
  clubs, players, and roster membership. The owner-approved transcript is
  authoritative only for the supplied market values. The Arsenal result is an
  expected reconciliation outcome, not a one-player override or a reason to
  block preparation of the complete 20-club reconciliation.
- **HOLD preserved:** the SQL Editor / roster-currency incident still blocks
  every DB operation. The future correction must be a full 20-club canonical
  reconciliation with review, atomic delta, audit trail, and rollback plan;
  a one-player manual patch is prohibited.
- **Minimum resume gate:** independent incident closure plus explicit
  read-only-resume authorization; then a fresh immutable 20-club Sportmonks
  export with UUID/provider-ID/current-club/active-membership/freshness
  provenance; integrity/coverage validation; and new non-overwriting
  reconciliation plus `QUARANTINED/PENDING` reports. A write proposal remains
  a separate later decision.

## 2026-08-09 SQL Editor / roster-currency independent audit — HOLD CONTINUES

- **Purpose and status:** an independent read-only audit checked preserved
  local provenance plus visible Supabase control-plane metadata/log views. It
  did not execute SQL, query tables, sync, export, migrate, deploy, or mutate
  any remote data. Result: `INCONCLUSIVE — HOLD CONTINUES`.
- **Evidence:** saved query `f180a411-06e1-4eca-9d22-25b8f89779be` is visible
  in the production SQL Editor, but exposes no actor, execution time, job ID,
  row count, or commit receipt; its current Results panel says “Click Run to
  execute your query.” The two-day Postgres Logs view returned “No data,” and
  the Database Migrations view showed “Run your first migration” rather than
  a recorded migration list. Neither negative observation disproves direct or
  unregistered SQL. Local `052`/`053` Liverpool SQL files are untracked and
  correlate temporally only; they are not execution proof.
- **Risk:** no compensating/manual update is safe. A direct `053` commit could
  have relabelled source/timestamps on eligible Liverpool inventory rows while
  bypassing the API-owned inventory history table. Remote schema/migration
  drift remains unclassified.
- **Evidence record and closure proposal:**
  `docs/touchline-arena/audit/2026-08-09-SQL-EDITOR-ROSTER-CURRENCY-INDEPENDENT-AUDIT.md`.
  The required next evidence is an independent control-plane audit/history
  record for `2026-08-07 21:12–21:40 UTC` with query hash/text, actor,
  start/end, result, commit/rollback and affected rows. If unavailable, HOLD
  remains. A separately authorized, least-privilege read-only schema audit is
  only a later corroboration path; it cannot be replaced by `service_role` or
  SQL Editor access.

## 2026-08-09 owner attestation — Liverpool activity authorized / snapshot gate remains

- **Authorization classification resolved:** Luiz Lopes confirmed that the
  activity in the investigated 2026-08-07 window was the team's authorized
  Liverpool change. It is no longer classified as an unknown or unauthorized
  execution. The prior lack of query receipt/row count remains a provenance
  gap, not a reason to issue a compensating patch or block reconciliation
  preparation.
- **Active HOLD narrowed, not lifted:** no database connection, sync, import,
  migration, export, or write is authorized now. The remaining gate is a
  verifiable remote schema/roster baseline followed by an offline dry-run;
  the owner attestation is not permission to write.
- **Minimum future sequence:** after a separate read-only authorization, use
  a least-privilege identity with enforced `default_transaction_read_only=on`
  to capture a two-pass, revision-fenced 20-club canonical roster snapshot
  plus schema/migration fingerprint. Archive it as a new dated/hash-verified
  artifact, produce report-only `QUARANTINED/PENDING` records for DB-only
  extras, then run the owner-value reconciliation offline. The dry-run must
  validate coverage, UUID/provider/current-club/active-membership identity,
  duplicates, drift, and rollback before any later explicit write decision.
- **Updated evidence/proposal:**
  `docs/touchline-arena/audit/2026-08-09-SQL-EDITOR-ROSTER-CURRENCY-INDEPENDENT-AUDIT.md`.

## 2026-08-09 permanent owner authorization record — Liverpool market values

- **Owner authorization:** Luiz Lopes, TouchLine owner, explicitly confirms
  that the manual activity on **2026-08-07** was authorized by him and was
  limited to **Liverpool market values**. This is the owner authority that
  resolves the former unknown-execution classification; it is not new
  authorization for any current DB/sync/write action.
- **Linked artifacts:** preserved migration `052`
  (`61aae0dcb81c225ba2b0ea5fe3a53cf465a2d831111fad245af2455029c32f30`),
  inventory-source migration `053`
  (`45706497a9f927089faffe650de2bf80ae6413d65589523ccf72a22a88d4a3fd`),
  and the publishing report
  (`674d1a5f12120e28d25e6ac1915b3e5c220c8c32f46522eb31ee54a028e1ffc5`)
  are linked in
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/PRODUCT_DECISION_BRUNO_GUIMARAES_2026-08-09.md`.
  Source baseline commit: `c74eb8f`; related audit/attestation commits:
  `46c7b32e`, `9953bf01`.
- **Provenance limitation:** `052`, `053`, and the publication report remain
  untracked legacy artifacts with no Git commit of their own. Their hashes
  bind the recorded owner authorization to exact files but do not fabricate a
  remote execution receipt.
- **Active gate unchanged:** no data was altered. The mandatory next step is
  still a separately authorized, verifiable read-only 20-club snapshot and
  offline dry-run; any write needs a later explicit decision.

## 2026-08-09 20-club roster reconciliation — LOCAL SERVER-ONLY CANDIDATE

- **Purpose:** a new local dry-run planner now prepares the complete
  Sportmonks Premier League 20-club roster reconciliation from two explicitly
  supplied, versioned canonical snapshot inputs. It is not a sync, importer,
  database reader, or executor. Candidate record:
  `docs/touchline-arena/audit/2026-08-09-20-CLUB-ROSTER-RECONCILIATION-LOCAL-CANDIDATE.md`.
- **Artifacts:** pure planner
  `lib/football-data/twenty-club-roster-reconciliation.ts`; server-only facade
  `lib/football-data/twenty-club-roster-reconciliation-server.ts`; focused
  proof `tests/touchline-twenty-club-roster-reconciliation.test.mts`. The
  facade has `import "server-only"`, accepts only already captured input, and
  returns an invariant `applicationEligible: false` / `execution:
  "dry-run-only"` plan. No route, client, provider, filesystem, environment
  dependency, or apply method was added.
- **Fail-closed behavior:** partial 20-club responses, missing provenance,
  duplicate provider player IDs, duplicate active memberships, and invalid
  provider/current-club/competition/freshness bindings block the entire plan
  with zero operations. Complete transfers, additions and unseen baseline
  players remain only explicit review operations; no absent player is
  implicitly inactivated or deleted.
- **Extras:** after a future complete read-only export, an active manual-scope
  player absent from the owner roster is report-only `QUARANTINED/PENDING`,
  without a market value or membership status write. Liverpool is included in
  the 20-club audit but excluded from the 19-club manual-value scope. The two
  alleged extras remain unidentified/preserved until that export exists; this
  candidate does not invent IDs or alter them.
- **Evidence:** focused planner test passed **6/6**; `pnpm typecheck` and
  targeted ESLint passed locally. These results prove the local planner only,
  not a remote roster state. The generated `tsconfig.tsbuildinfo` remains
  outside the logical candidate commit and is preserved untouched.
- **Persistent implementation checkpoint:**
  `023ac46a18504f8db08db5af0bf7eb6aec3b8424`
  (`feat(roster): add 20-club reconciliation planner`).
- **Separate application gate:** the SQL-editor HOLD is not lifted. A later
  application needs a newly authorised, least-privilege, revision-fenced
  read-only 20-club export; offline plan/review; immutable before/after and
  rollback preflight; and a separate explicit write authorization for a new
  atomic executor. No DB write, sync, migration, import, deployment, Preview,
  or payment action happened in this block.

## 2026-08-09 authenticated 20-club roster export — PRE-FLIGHT BLOCKED

- **Authorization and boundary:** Luiz authorized only a dedicated,
  authenticated, non-mutating read of the 20 canonical Sportmonks rosters.
  The export path was narrowed to an explicit `--check` or `--write-new`
  invocation, accepts an anon key plus issuer-bound `authenticated` bearer
  session only, and continues to reject service-role semantics. No write,
  sync, migration, SQL mutation, deployment, or Preview action is authorized.
- **Credential result:** no dedicated `TOUCHLINE_ROSTER_EXPORT_*` credential
  was configured in the process or current/sibling worktrees. The sanitized
  `--check` therefore exited `1` with
  `TL_ROSTER_EXPORT_READ_ONLY_MODE_REQUIRED` before a client or network was
  created. No secret value was printed.
- **Integrity hardening:** the local exporter now fails its audit state on
  partial 20-club coverage, invalid source timestamps/bindings, exceptional
  memberships, duplicate provider player IDs, duplicate active memberships,
  or duplicate membership IDs. Its two-pass revision fence covers the full
  select payload, not only timestamps. Focused export/planner/reconciliation
  tests passed **17/17** after this change.
- **Evidence:** dated report
  `docs/touchline-arena/audit/2026-08-09-AUTHENTICATED-ROSTER-EXPORT-PREFLIGHT.md`
  and immutable no-connection manifest
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-09T18-27-31Z/read-only-export-preflight.json`, plus its
  `validation-results.txt` test record.
  Every one of the 20 requested club/team IDs is recorded as not read, rather
  than fabricated as complete/partial.
- **Extras and next gate:** the alleged two extras are still
  `PRESERVED_UNIDENTIFIED_PENDING`, with no ID, value or membership mutation.
  A process-only dedicated authenticated read-only credential is the sole
  missing input for the actual two-pass export. Once supplied, a new dated
  export must pass this integrity gate and the local planner before a real
  `QUARANTINED/PENDING` report can name any DB-only player.

## 2026-08-09 dedicated roster read credential — PRE-PLATFORM PROPOSAL

- **Owner authorization:** Luiz authorized evaluation and, only if the
  platform can enforce it without broadening access, provisioning of a
  dedicated non-mutating credential for the 20-club canonical roster export.
  No service-role, grant, RLS, migration, sync, deployment, card/value, or
  roster-data change is authorized.
- **Target and gate:** the proposed principal may only `SELECT` the five
  canonical football tables required by the exporter. Existing migration `013`
  shows authenticated SELECT policies on those tables and service-role-only
  DML, but a generic `authenticated` user may inherit broader project access.
  If exact five-table effective scope cannot be demonstrated without adding or
  broadening RLS/grants, provisioning stops.
- **Evidence / rollback:**
  `docs/touchline-arena/audit/2026-08-09-DEDICATED-ROSTER-READ-CREDENTIAL-PROPOSAL.md`
  records the target, permissions, risks, acceptance criteria and future
  credential-only revocation plan. This entry precedes any platform action.

## 2026-08-09 dedicated roster read credential — NO-GO / STOP CONDITION MET

- **Result:** no generic Supabase Auth credential was created. The current
  platform model cannot prove the strict, five-table, no-write effective scope
  required for the roster exporter without remote RLS/grant/role work.
- **Evidence:** `005_role_grants_and_api_season.sql` gives `authenticated`
  base `SELECT/INSERT/UPDATE/DELETE` grants across public/current and future
  tables. `013_football_data_foundation.sql` grants all `authenticated` JWTs
  `SELECT USING (true)` across seven football tables, not only the five export
  tables or the requested 20 clubs. RLS should reject football DML without
  policies, but the inherited grants still violate the no-write-grant / least
  privilege criteria. A normal Auth user also invokes the
  `on_auth_user_created` trigger that writes `public.users`.
- **Non-actions:** no dashboard/browser credential creation, Auth-user
  creation, RLS/grant change, migration, DB query/write, sync, deployment, or
  secret retrieval occurred after the audit. The two extras remain untouched.
- **Future only:** a separately authorized remote design needs a dedicated
  role/claim, restricted projection for competition `8` + 20 team IDs,
  `SELECT`-only grants, short-lived revocable token issuance and negative
  authorization tests. Do not substitute a generic `authenticated` user or
  service role.
- **Persistent NO-GO checkpoint:**
  `2141ce85252eca0183068047eedbcbea8a5f0565`
  (`docs(roster): record credential provisioning no-go`).
- **Persistent preflight checkpoint:**
  `ed4c510bf6d6ed7502faa03e8c40eed89a62447b`
  (`feat(roster): harden authenticated export preflight`).

## 2026-08-09 remote roster-exporter role validation — NO-GO

- **Owner-authorized scope:** Luiz authorized a dedicated
  `touchline_roster_exporter` role only if it could be constrained to the five
  canonical roster tables, provider `sportmonks`, competition `8`, and the 20
  declared provider-team IDs — with no service role, DML, RPC, public access
  expansion, Auth administration, sync, data change, or deployment.
- **Remote evidence:** authenticated dashboard metadata queries against the
  TouchLine Arena project found no existing exporter role. The target tables
  have `SELECT TO authenticated USING (true)` policies, not an exporter-role
  policy. More importantly, `PUBLIC` currently grants `CONNECT` and
  `TEMPORARY` on the database, `USAGE` on `public`, and `EXECUTE` on a
  non-empty catalogue of `public` functions. Any new PostgreSQL role inherits
  those capabilities; a role-local revoke cannot override a `PUBLIC` grant.
- **Decision:** do not create the role, password, JWT, policy, grant, or
  credential; do not run the export. The no-RPC/no-broad-access acceptance
  gate failed before issuance. The two extras remain
  `PRESERVED_UNIDENTIFIED_PENDING`, with no ID/value/membership change.
- **Evidence artifact:**
  `docs/touchline-arena/audit/2026-08-09-ROSTER-EXPORTER-REMOTE-SCOPE-VALIDATION.md`
  records purpose, sanitized metadata evidence, failed criteria, safe future
  path, and revocation/rollback status. No secret was retrieved or recorded.
- **Separate future decision required:** revoking `EXECUTE` from `PUBLIC` and
  regranting only legitimate application functions would be a project-wide
  authorization change. It needs caller inventory, impact review and a new
  explicit authorization; it must not be folded into the roster-export role.

## 2026-08-09 Sportmonks direct 20-club roster read — PRE-FLIGHT BLOCKED

- **Changed route:** Luiz stopped remote-role provisioning before any DDL and
  authorized a direct, server-side-only Sportmonks read instead. No role,
  token, policy, grant, DB action, sync, migration, deploy, or card/value
  change followed the stop instruction.
- **Credential result:** `SPORTMONKS_API_TOKEN` and related provider
  configuration names are absent from the controlled process; the worktree
  has only `.env.example`, no local credential file, no linked Vercel CLI, and
  no running local application. No Keychain, Vercel secret, browser storage,
  network, or secret value was inspected.
- **Provider boundary:** the existing `getSquad()` integration uses only two
  provider GETs per team and no database write, but it is unpaged. It cannot
  establish an exact complete roster snapshot until a dedicated fail-closed
  read extractor handles pagination/partiality/duplicates and an existing
  server-side token is made available safely.
- **Result:** no API request and no local manifest were produced. The alleged
  extras remain `PRESERVED_UNIDENTIFIED_PENDING`, with no inferred IDs, value,
  or membership action.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-09-SPORTMONKS-20-CLUB-READ-PREFLIGHT.md`.

## 2026-08-09 Sportmonks direct 20-club roster read — COMPLETE / REVIEW HOLD

- **Credential boundary:** Luiz identified the main-worktree `.env.local` as
  an existing server-side Sportmonks source. It was loaded only into one
  `env -i` Node process through `--env-file`; its content was never printed,
  copied, persisted, committed or inspected. The process made direct HTTPS
  GETs only; no TouchLine DB client, sync route, migration, deployment, card
  or value operation ran.
- **Coverage:** the controlling provider-only snapshot is
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json`
  (`sha256 b3d4d672...7ae94d`, source revision
  `c332d196...9b4829`). It records all 20 teams ready, 590 members, zero
  duplicate provider player IDs and no partial result. The preceding
  `19-08-46-265Z` snapshot is retained as historical evidence, not deleted or
  overwritten.
- **Owner-list review only:** provider non-Liverpool roster has 561 members
  versus 558 owner rows: 538 exact normalized name pairs, 23
  `PROVIDER_ONLY_REVIEW_PENDING` with null value, 20
  `OWNER_ONLY_REVIEW_PENDING`, zero ambiguous groups and net `+3`. These are
  not a DB reconciliation and none is application eligible. The two alleged
  DB extras remain unmodified/unidentified in DB terms.
- **Conflict:** Sportmonks returned Bruno Guimarães / provider ID `459145`
  under Newcastle team `20`, contrary to Luiz's Arsenal product decision. It
  remains pending; no manual patch/sync/value action is authorized. Resolve
  this through the later canonical reconciliation decision, not a one-player
  correction.
- **Validation:** new direct reader is GET-only, pagination/partial/duplicate
  fail-closed and omits raw payloads/request URLs/credential. Focused tests
  passed 6/6; `pnpm typecheck`, `pnpm lint` and `git diff --check` passed.
  Full evidence: `docs/touchline-arena/audit/2026-08-09-SPORTMONKS-20-CLUB-READ-RESULT.md`.

## 2026-08-09 owner-approved × Sportmonks market-value application candidate — LOCAL / NOT APPLIED

- **Purpose and evidence:** a new dated local package joins the immutable
  owner-approved 19-club CSV/manifest to the controlling Sportmonks direct-GET
  20-club snapshot, without a database, sync, migration, deployment, or value
  mutation. Package:
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/`.
  Its manifest records owner CSV `55dac15d…299cd3`, owner selection
  `192692cf…19f94`, provider snapshot `b3d4d672…7ae94d`, source revision
  `c332d196…9b4829`, and candidate fingerprint `60c03e78…64b5`.
- **Result:** 538 unique exact owner-name/provider-team pairs were staged,
  with 533 explicit positive EUR values ready only **after** canonical UUID
  binding and five `PENDING_VALUE_MISSING` rows. All 538 records remain
  `application_eligible: false`. The package separately preserves 23
  provider-only `PENDING` / null-value records and 20 owner-only `REVIEW`
  records; neither set is in any future write set. Ambiguous groups and
  duplicate staged provider IDs are zero.
- **Idempotency and safety:** every staged pair has a deterministic row key;
  future execution requires a fresh canonical UUID/current-club/active
  membership snapshot, human identity review, exact-batch lock/fingerprint,
  atomic unchanged replay, rollback preflight, and separate write approval.
  It may target only canonical market-value/audit-run tables. It explicitly
  excludes player, club, membership, inventory, card-contract, price, tier,
  colour, wallet, offer, and roster writes. No generic import server, direct
  provider-ID-to-Transfermarkt mapping, or name-only SQL resolution is used.
- **Presentation gate:** this proves no persistent inventory/contract/tier/
  price/colour mutation in the local candidate. A later verified market value
  can still change a public uncontracted card's derived presentation under the
  current policy; that requires the documented product decision and desktop/
  mobile EN/PT QA, including pending and active-contract cases.
- **Validation and documentation:** focused candidate test **6/6** passed;
  the generator syntax/check and unique archive creation passed. Full scope,
  artifact hashes, application proposal, and visual QA criteria are in
  `docs/touchline-arena/audit/2026-08-09-OWNER-APPROVED-SPORTMONKS-MARKET-VALUE-APPLICATION-CANDIDATE.md`.
  No application was attempted. Persistent candidate checkpoint:
  `a241ce78329f33c8cca9f2362eadcc6f4742ec6c`
  (`feat(market-values): stage owner Sportmonks application candidate`).

## 2026-08-09 official league table initial state — LOCAL COMPLETE

- **Scope:** the real TouchLine England official league table only. No
  TouchLine ranking, card, market-value, roster, sync, database, migration,
  Preview or production deployment changed.
- **Behavior:** before a verified final result, the canonical 20-club scope is
  now visibly retained with neutral J/V/E/D/GF/GA/SG/Pts values, `—` positions
  and one explicit initial-table notice. No leader or ranking is invented.
  A verified final continues through the existing canonical real-standings
  calculation; incomplete club/fixture identity stays fail-closed.
- **Presentation:** the duplicate `pending_no_final` message was removed. EN:
  “Initial table — all 20 clubs are level.” PT-BR: “Tabela inicial — os 20
  clubes estão empatados.”
- **Evidence:** local static QA route
  `app/visual-qa/official-league-table-initial/page.tsx` uses the same pure
  resolver, a fixed 20-club/zero-final fixture and a 390px iframe for mobile
  inspection. It has no database, provider, account, market, card or ranking
  dependency. The dated report is
  `docs/touchline-arena/audit/2026-08-09-OFFICIAL-LEAGUE-TABLE-INITIAL-STATE-QA.md`.
- **Validation:** focused table + fixture tests **9/9 passed**; `pnpm
  typecheck`, `pnpm lint` and `git diff --check` passed. Local browser DOM
  QA confirmed desktop 20 rows/one notice/no page overflow and the 390px
  fixture's 20 rows with Pos/Club/P/GD/Pts columns. The only lint note was
  the existing Babel size note for `ArenaClient.tsx`.
- **Checkpoint:** `d254d129f0af1119688a17e5de132d2ede5b0376`
  (`fix(public): clarify initial official league table`). Generated
  `next-env.d.ts` and `tsconfig.tsbuildinfo` remain intentionally uncommitted
  workspace artifacts.

## 2026-08-09 ClubHub matchday profile redesign — LOCAL COMPLETE / NOT DEPLOYED

- **Approved composition:** Club identity, complete verified club value,
  honours and Next Match now precede the existing XI pitch. The new technical
  area follows the XI; a plain outside-matchday roster follows the technical
  area; the real server-owned Official League Table follows that roster; and
  TouchLine card/ranking content is below the table. The former hero
  TouchLine Cards, TouchLine Points and Squad Source metrics are removed.
- **Matchday safety:** the current public feed has line-up member identity and
  `isStarter`/`isSubstitute`, but no official matchday coach. The pure
  presentation model exposes a coach and exactly nine bench names only for a
  complete, selected-fixture/team-bound XI + coach + nine unique substitutes.
  Present production data therefore remains explicitly awaiting an official
  team sheet; no coach/bench inference, static coach seed or provider call is
  used. XI, bench and outside roster are identity-partitioned, with no
  duplicates.
- **Pitch accessibility:** names use dark plates, two lines, no ellipsis, and
  a compensated safe-top inset. Local 390px QA verified complete stress names,
  zero label overlap and no horizontal page overflow.
- **Value boundary:** the hero emits a club total only if every source card is
  verified; otherwise it uses the existing Updating/Em atualização state. It
  does not change tiers, colours, card prices, contracts, inventory or values.
  The 533 owner-approved EUR values remain a local-only application candidate,
  not Preview or database data.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-09-CLUBHUB-MATCHDAY-PROFILE-REDESIGN-QA.md`;
  static no-data QA route
  `app/visual-qa/clubhub-profile-contract/page.tsx`.
- **Validation:** focused ClubHub/table/card boundary suite **39/39 passed**;
  `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed. Browser QA
  covered a desktop confirmed 11+9 fixture and a 390px pending fixture. No
  database, Sportmonks, sync, migration, Preview or deployment action ran.
  The static fixture disables card-ranking subscription and recorded zero
  `/api/*` browser resources in both states.
- **Checkpoint:** `230909d60c4f18ed4c1784d2a8ed9b6197311018`
  (`feat(clubhub): separate verified matchday profile sections`). Generated
  `next-env.d.ts` and `tsconfig.tsbuildinfo` remain preserved and uncommitted.
- **Isolation follow-up:** `87be02d1cd73c46c6ce8f194c81dd20e0b2ade38`
  (`fix(qa): isolate ClubHub fixture from card ranking`) explicitly prevents
  static QA cards from subscribing to ranking activity; production behaviour
  is unchanged.
- **Remaining gate:** a sanitized, persisted matchday-coach DTO is necessary
  before production may name a coach or nine-player official bench. A later
  data-backed EN/PT pass needs the separately authorized read-only source.

## Next card/crest neon visual proposal — NOT STARTED

- **Requested direction:** replace the clipped neon effect with one continuous
  trace through the centre of the canonical card border, a soft trail and
  ignition, canonical tier-border colour, club-colour crest treatment, no
  cropping, and a `prefers-reduced-motion` static alternative.
- **Boundary:** this is a separate visual-only block. It must not change card
  tiers, values, prices, contracts, inventory or the current ClubHub profile
  scope.

## 2026-08-09 canonical card perimeter trace — LOCAL COMPLETE / NOT DEPLOYED

- **Implementation:** the clipped tier `filter`/`drop-shadow` neon was
  replaced with one shared, stroke-only SVG perimeter geometry outside the
  cropped player/coach artwork containers. Its static base and travelling dash
  follow the same continuous path; it runs once on hover, focus, selected/
  active and zoom surfaces, then retains a soft residual outline. It never
  fills, masks or clips the frame.
- **Canonical colour source:** player cards pass the approved
  `touchlineCardTierPalette(...).accent` token, coach cards pass their existing
  `tierPalette.accent`, and neutral cards use the established neutral public
  accent. Player and coach crests use their canonical club accent and a
  fine-pointer-only lift. No asset, tier, value, price, contract or ranking
  rule changed.
- **Motion and compact safety:** reduced-motion explicitly leaves only a
  brighter static outline and no crest/card transform. The trace is pointer
  inert and preserves `touch-action: manipulation`. Arena Live's 22 moving
  compact cards retain the static outline and deliberately suppress the
  travelling layer to preserve the existing Safari anti-flicker boundary.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-09-CARD-PERIMETER-TRACE-VISUAL-QA.md`;
  local static fixture `app/visual-qa/card-neon-trace/page.tsx`.
- **Validation:** focused visual/card/motion regression suite **78/78
  passed**; `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed.
  Local browser QA at 1280px, 768px and 390px recorded no horizontal overflow
  and trace bounds inside both player and coach cards. Reduced motion is
  covered by explicit CSS and regression assertions; the local browser surface
  does not expose OS media emulation, so no system setting was changed.
- **Boundary:** local only. No DB, sync, migration, Preview, deployment,
  product data or generated workspace artifact is included in this checkpoint.

## 2026-08-09 Club Owner portrait perimeter trace — LOCAL COMPLETE / NOT DEPLOYED

- **Scope:** visual-only replacement of the live Club Owner avatar's clipped
  green frame glow. The portrait image, identity, ownership data, contracts,
  economy, values, cards, tiers, prices, rankings and layout are unchanged.
- **Implementation:** the Club Owner is the only `TouchlineSocialProfileHeader`
  caller opting into the new circular SVG trace. The photo stays in its own
  clipped circular child; the stroke-only SVG is a visible sibling, follows
  the exact card trace timing (1500ms / travelling dash / residual), remains
  fully within the avatar bounds and uses only fixed TouchLine logo green
  `#a3ff12` — never a club or tier token.
- **Interaction and accessibility:** fine-pointer hover lifts the portrait
  lightly; coarse-pointer `:active` gets the same transient lift and trace
  without synthetic hover. The SVG is pointer-inert and no touch-action
  restriction was added, preserving pinch zoom. Reduced motion leaves a
  static illuminated perimeter with no transform or animation. Existing card
  and crest fine/coarse/reduced-motion rules were validated rather than
  duplicated.
- **Evidence:** local static, admin-gated fixture
  `app/visual-qa/club-owner-portrait-neon/page.tsx`; dated report
  `docs/touchline-arena/audit/2026-08-09-CLUB-OWNER-PORTRAIT-PERIMETER-TRACE-QA.md`.
  The fixture has no runtime product-data dependency.
- **Validation:** focused source/fixture/card regression suite **35/35
  passed**. Local browser QA at 390px, 768px and 1280px recorded matching
  portrait/trace bounds and no horizontal overflow. Reduced motion is covered
  by explicit regression assertions; the local browser has no OS
  media-emulation capability. Typecheck, lint and final diff evidence are
  recorded with this checkpoint.
- **Boundary:** local only. No DB, sync, migration, Preview, deployment,
  provider request, card/economy/data change or generated workspace artifact
  is included.
- **Persistent checkpoint:** `e4c957a0`
  (`feat(owner): add circular portrait perimeter trace`).

## 2026-08-09 calm card/crest/Club Owner neon loop — LOCAL COMPLETE / NOT DEPLOYED

- **Implementation:** player-card, coach-card and Club Owner traces are now
  autonomous eight-second cycles: a complete travelling pass, several seconds
  of soft residual illumination, then an invisible reset and repeat. The
  Club Owner remains a fixed TouchLine-green circular trace; card frames retain
  their canonical tier-border colour; new crest circles use their existing
  canonical club accent only.
- **Interaction/accessibility:** fine-pointer hover lifts card/crest/portrait
  subtly; coarse `:active` receives the same temporary lift without synthetic
  hover. Reduced-motion retains a bright static base with no travelling trace
  or transform. The new SVGs are pointer-inert and do not change pinch-zoom
  behaviour.
- **Safari stability exception:** all 22 moving compact Arena Live player
  cards plus the two compact live coach cards explicitly suppress both
  travelling frame and crest paths while retaining their static base. This
  preserves the existing anti-flicker boundary.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-09-CALM-NEON-LOOP-QA.md`; local static
  fixtures `app/visual-qa/card-neon-trace` and
  `app/visual-qa/club-owner-portrait-neon`.
- **Validation:** focused neon/fixture suite **38/38 passed**; `pnpm
  typecheck`, `pnpm lint` and `git diff --check` passed. Local loopback QA at
  390px, 768px and 1280px confirmed no horizontal overflow and trace bounds
  within card, crest and portrait surfaces; pass/residual/restart were observed
  from computed SVG stroke state. No DB, provider, sync, migration, Preview or
  deployment action ran.
- **Boundary:** visual-only local candidate. No card art, tier, price,
  contract, value, ranking, Club Owner data or generated workspace artifact is
  included. Persistent checkpoint: `d5ae9bc3`
  (`feat(visual): loop card and crest perimeter traces`).

## 2026-08-09 owner-approved market-value application preflight — HOLD / NOT APPLIED

- **Result:** the controlling local candidate continues to reproduce the exact
  `538 / 533 / 5 / 23 / 20 / 0` vector: 538 exact owner/provider pairs, 533
  explicit EUR values requiring canonical UUID binding, five matched missing
  values, 23 provider-only `PENDING`, 20 owner-only `REVIEW`, and zero
  ambiguous groups. Every row remains `application_eligible: false`; no
  market value is in Preview or the database.
- **Concrete hold:** no local `touchline-canonical-roster-export-v1` proves
  the canonical player UUID, canonical club UUID, current-club equality,
  active competition-8 membership and freshness for the 533 rows. The two
  direct Sportmonks snapshots have provider IDs only. The four required
  dedicated read-only exporter configuration names are absent by
  presence-only inspection; no secret value was read or recorded. Generic
  authenticated and service-role credentials remain disallowed.
- **Safe local candidate:** the existing deterministic application package at
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/`
  has per-row idempotency keys and confines a future executor to
  `football_player_market_values`, immutable history, and import/job audit
  tables. It does not execute. The generic importer is not eligible because it
  lacks the strict identity/membership proof, batch transaction, and durable
  batch fingerprint required here.
- **Value/economy boundary:** no player, club, membership, inventory,
  contract, price catalogue, tier, colour, offer or wallet write is permitted.
  A future value write must separately test derived public uncontracted
  presentation; stored active-contract tier/price authority remains outside
  this batch.
- **Validation:** local candidate syntax/check and `6/6` focused tests passed;
  `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed. No remote
  connection, database write, sync, migration, provider request, Preview or
  deployment ran.
- **Evidence and next gate:**
  `docs/touchline-arena/audit/2026-08-09-MARKET-VALUE-APPLICATION-LOCAL-PREFLIGHT-HOLD.md`.
  Preserve the 20 REVIEW, five pending and 23 provider-only pending records;
  stop until a fresh least-privilege canonical roster export and its local
  UUID/membership dry-run exist. Persistent checkpoint:
  `f9b91bc108b9b885f20c82383707dffd93530dd3`
  (`docs(market-values): record application preflight hold`).

## 2026-08-10 EN/PT local release-readiness checklist — LOCAL GATE COMPLETE / NOT DEPLOYED

- **Purpose and scope:** added an executable local release checklist for the
  approved en-GB / pt-BR surface only. It maps the canonical
  https://touchline.com.br route, www 308 policy, build chain and local-visual
  matrix without reading credential values, contacting Vercel, changing remote
  configuration, or deploying.
- **Safe fixes:** static ClubHub and card-value visual fixtures now explicitly
  render EN/PT from a strict shared resolver and fail unknown locales back to
  English. Two stale regressions now assert the retired provider-event route's
  410 fail-closed response and the current persisted Arena snapshot path. No
  product data, value, tier, price, contract, card art, ranking, database or
  deployment configuration changed.
- **Validation:** local checker PASS
  (LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL); focused suite 16/16 PASS; full
  suite 807/807 PASS; pnpm typecheck, pnpm lint, local production pnpm build,
  and git diff --check PASS. The build used an empty application environment
  and did not make a remote request.
- **Remaining gates:** this is not a production/Preview approval. Pin a clean
  candidate excluding the preserved generated workspace files, verify Vercel
  project/alias/effective environment externally, capture 390/768/1280 and
  Safari/iOS/Chrome Android fixture QA, and retain the independently recorded
  Quick Sub, immutable-data/public-boundary and market-value UUID/membership
  holds.
- **Evidence:**
  docs/touchline/release-audit/2026-08-10-LOCAL-EN-PT-RELEASE-READINESS-CHECKLIST.md,
  scripts/check-touchline-release-readiness.mjs,
  tests/touchline-release-readiness-local.test.mts, and
  tests/touchline-visual-qa-locale.test.mts. Persistent checkpoint:
  `0f646328` (`feat(release): add local EN PT readiness checklist`).

## 2026-08-10 EN/PT local static visual matrix — PASS / NOT DEPLOYED

- **Scope:** executed only the static local production fixtures for ClubHub,
  card value states, card/crest trace, Club Owner portrait trace and the
  initial official table. Every applicable fixture now has an explicit EN/PT
  query contract; the six deferred locales remain outside this scope.
- **Observed:** 30 local browser visits (five fixtures × EN/PT × 390/768/1280)
  had no root horizontal overflow. ClubHub retained the approved section order
  and readable field names; the initial table rendered 20 zero-stat rows;
  card/crest and Club Owner traces visibly performed their eight-second
  travelling pass, residual pause and restart. Decorative SVG paths are
  pointer-inert and leave touch-action unrestricted.
- **Safe fixture-only correction:** shortened oversized synthetic fixture
  labels that cropped at 390px. No live player content, art, value, tier,
  price, contract, economy, ranking, database, provider, sync, migration,
  Preview or deployment changed.
- **Validation:** the release-readiness, TypeScript, ESLint, full test
  (807/807), production-build package checks and `git diff --check` passed.
  Native Safari/WebKit, iOS Safari, Chrome Android, real touch and
  keyboard-focus observations remain explicitly external gates.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-LOCAL-STATIC-VISUAL-QA-MATRIX.md`.
  Persistent implementation checkpoint: `3ed3d378`
  (`test(visual): validate local EN PT fixture matrix`).

## 2026-08-10 dedicated roster-exporter local contract — COMPLETE / REMOTE NOT PROVISIONED

- **Local boundary:** the canonical roster exporter now accepts only the
  future JWT claim `role=touchline_roster_exporter`. It rejects generic
  `authenticated`, `service_role`, `anon`, malformed, missing and arbitrary
  roles while retaining HTTPS issuer and `aud=authenticated` checks.
- **Fail-closed proof:** a child-process `--check` with missing configuration
  exits before client construction with a stable error and empty stdout; no
  configuration value is printed. Select-only queries, two-pass revision
  fencing and fresh `wx` archive writes remain unchanged.
- **Validation:** focused exporter suite **6/6 passed**; TypeScript, focused
  ESLint and `git diff --check` passed. A separate direct no-configuration
  `--check` returned only
  `TL_ROSTER_EXPORT_READ_ONLY_CONFIGURATION_REQUIRED` with exit `1`.
- **Non-actions:** no role, token, environment variable, Vercel setting,
  database connection/query/write, RLS/grant/migration, sync, value import,
  Preview or deployment was performed. The local claim is not evidence that a
  remote role exists.
- **Gate:** the remote `PUBLIC` privilege/RLS/token-issuance NO-GO remains
  controlling. Do not substitute a generic authenticated session or
  service-role key. The 533 values remain local-only; five owner rows and 23
  provider-only rows remain pending, and 20 owner-only rows remain review.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-ROSTER-EXPORTER-LOCAL-ROLE-CONTRACT.md`.
  Persistent implementation checkpoint: `43974feb`
  (`feat(roster): require dedicated exporter JWT role`).

## 2026-08-10 owner-approved canonical value binding adapter — LOCAL COMPLETE / NOT EXECUTED

- **Purpose:** close the local code gap between the immutable owner-approved
  Sportmonks candidate and a future writer. The new private adapter binds only
  exact `(provider_team_id, provider_player_id)` pairs to canonical TouchLine
  player, club and active-membership UUIDs; it never re-matches a player name.
- **Implementation:** pure fail-closed builder
  `lib/touchlineArena/owner-approved-market-value-binding.ts` and server-only
  fresh reader/facade
  `lib/touchlineArena/owner-approved-market-value-binding-server.ts`.
  The reader uses only `football_players`, `football_squad_members`,
  `football_clubs` and `football_competitions`; it has no route, importer,
  provider, cache or mutation path.
- **Safety gate:** batches are capped at 60 provider IDs, read twice, and
  block the entire manifest on a query error, missing/duplicate identity,
  wrong team/current club, zero or multiple active memberships, invalid
  UUID/timestamp, competition mismatch or revision-fingerprint change. The
  manifest remains `BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION` and every
  row remains `application_eligible: false`.
- **Fixed scope:** tests bind the exact 533 explicit-EUR rows from the current
  `558 / 538 / 533 / 5 / 23 / 20 / 0` candidate vector. The five
  `PENDING_VALUE_MISSING`, 23 provider-only `PENDING` and 20 owner-only
  `REVIEW` entries are explicit exclusions from the manifest and every future
  write set; no value is invented or null-overwritten.
- **Validation:** focused value/binding/reconciliation suite **22/22 passed**;
  `pnpm typecheck`, `pnpm lint`, and staged `git diff --check` passed. The
  checks used no application credentials and made no database/provider/network
  request.
- **Non-actions:** no canonical DB read was invoked, so no real UUID manifest
  was created; no import, data write, sync, migration, cache invalidation,
  Preview or deployment ran. No card tier, price, contract, colour, inventory
  or roster data changed.
- **Next gate:** an explicitly authorized run of the server-only adapter must
  produce a new dated manifest from a stable canonical read. Even a successful
  533-row manifest is not import authorization: an atomic executor,
  rollback/preflight evidence and separate write decision remain required.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-MARKET-VALUE-CANONICAL-BINDING-ADAPTER.md`,
  `tests/touchline-owner-approved-market-value-binding.test.mts`, and
  persistent implementation checkpoint `e3a13739`
  (`feat(market-values): add canonical binding preflight`).

## 2026-08-10 canonical value-binding runner behavioral fence — LOCAL COMPLETE / NOT EXECUTED

- **Purpose:** convert the canonical binding adapter's two-pass revision-fence
  claim from source-only coverage into behavioral proof without connecting to
  a database.
- **Implementation:** extracted pure batching/orchestration into
  `lib/touchlineArena/owner-approved-market-value-binding-runner.ts`; the
  server-only canonical reader remains the sole default reader and injects
  into it. The runner has no Supabase/client/env/provider/route/write import.
- **Behavioral evidence:** injected local readers prove 19 stable team-local
  reads run twice and return exactly 533 review-only bound rows; a changed
  second-pass revision, blocked second pass or thrown reader blocks the entire
  manifest with zero rows. Reader-response contract errors also fail closed.
- **Scope preserved:** the candidate's five value-missing, 23 provider-only
  pending and 20 owner-only review records remain outside the binding output
  and every future write set. No real UUID binding was generated.
- **Validation:** focused candidate/binding/reconciliation suite **25/25
  passed**; `pnpm typecheck`, `pnpm lint` and `git diff --check` passed. All
  readers were local fakes: no credential, database query/write, provider,
  sync, migration, cache invalidation, Preview or deployment action occurred.
- **Gate:** an authorized fresh canonical read must still pass this runner
  before any dated 533-row manifest is created. Binding remains neither an
  import nor a write authorization; atomic executor, rollback/preflight and
  explicit write gates remain separate.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-MARKET-VALUE-CANONICAL-BINDING-RUNNER-BEHAVIORAL-TEST.md`;
  persistent checkpoint `065a1cbc`
  (`test(market-values): exercise canonical binding fence`).

## 2026-08-10 Quick Substitution readiness hotfix — LOCAL COMPLETE / NOT DEPLOYED

- **Problem confirmed:** the authenticated self route could briefly show the
  opaque global black loader before its second redirect, then rendered an empty
  standalone bench for a `0/11` / `0/9` matchday.
- **Local correction:** direct canonical self redirect, route-local readable
  loading shell, and a pure readiness gate. The standalone panel opens only
  with exactly 11 starters and 9 substitutes; otherwise it presents real
  counts plus a Market Transfer action and creates no player/card/contract.
- **Validation:** focused route/readiness/durable suite **20/20 passed**;
  typecheck, lint and `git diff --check` passed. Local browser observation at
  390/768/1280 had no horizontal overflow; demo proof rendered 11 field and 9
  bench cards, while the empty fixture displayed the explicit setup state.
- **Non-actions:** no database/write/sync/provider/value/economy/migration or
  deployment action was performed. The durable match-substitution authority is
  still a separate gate.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-QUICK-SUBSTITUTION-READINESS-HOTFIX.md`,
  `tests/touchline-quick-substitution-readiness.test.mts`.

## 2026-08-10 Quick Substitution self-route loop hotfix — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem confirmed in production:** the authenticated Luiz route cycled
  `/club-owner/me/substitution` → `/club-owner/luiz-lopez/substitution` →
  `/club-owner/me/substitution`, which Safari rejected as too many redirects.
- **Correction:** the canonical Luiz substitution pathname is now permitted as
  `own-private` for Luiz only, and its legacy static page uses the same
  authenticated identity boundary as the dynamic owner route. Other owners
  remain self-scoped and signed-out visitors still go to login.
- **Validation:** focused route/readiness suite **13/13 passed**; typecheck,
  lint, production build and `git diff --check` passed.
- **Boundary:** no roster, contract, value, card, match or database data was
  modified. Durable no-reentry match substitution remains a separate,
  server-owned match-state gate.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-QUICK-SUBSTITUTION-SELF-ROUTE-LOOP-HOTFIX.md`.

## 2026-08-10 Quick Substitution no-reentry session projection — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem:** the old standalone bench interaction put the outgoing field
  player back in the selectable bench and persisted that roster-style swap.
- **Correction:** a complete, identity-backed 11 + 9 sheet now feeds a pure
  match-session projection. The incoming player takes the outgoing fixed
  pitch slot; the outgoing player goes to a dim, non-interactive
  `Substituted out / Saiu da partida` rail and is rejected if selected again.
- **Scope:** the standalone Quick Substitution path does not mutate the saved
  roster, bench, contract, economy, value, card tier or database. It stores
  only an owner/match/revision-scoped browser-session projection. Contract
  release actions are not offered there.
- **Validation:** focused durable/readiness/session/UI suite **23/23 passed**;
  `pnpm typecheck`, `pnpm lint` and `git diff --check` passed locally.
- **Remaining boundary:** a server-owned match snapshot/event log is still
  required before this can be called an official reload-safe match record.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-QUICK-SUBSTITUTION-NO-REENTRY-SESSION-PROJECTION.md`.

## 2026-08-10 owner-approved 533-value application plan — LOCAL COMPLETE / NOT EXECUTED

- **Purpose:** create a pure, fail-closed dry-run hand-off from a future fresh
  canonical UUID binding to a separately authorized atomic writer; it is not a
  database client or import path.
- **Implementation:**
  `lib/touchlineArena/owner-approved-market-value-application-plan.ts` accepts
  only a clean 533-row canonical binding manifest and produces a
  `review-required`, `applicationEligible: false`, `dry-run-only` plan. It
  allows only the future market-value/audit table set and protects card tier,
  card price, contract and club assignment.
- **Fail-closed proof:** any issue, incomplete count, duplicate source/player/
  membership identity, changed club mapping, stale/invalid provenance or
  missing manual-scope club blocks the entire plan with zero rows. The fixed
  `533 / 5 / 23 / 20` vector is retained: five value-missing owner entries,
  23 provider-only entries and 20 owner-only entries remain outside every
  write set.
- **Validation:** focused application-plan plus binding suite **10/10 passed**;
  strict TypeScript (`tsc --noEmit --incremental false`), full ESLint,
  `git diff --check`, full repository suite **834/834**, and the Webpack
  production build passed. Tests use synthetic bindings and source checks
  prove no environment, HTTP, client/query or mutation capability.
- **Non-actions:** no credential, database/provider read or write, sync,
  migration, cache invalidation, card/value/contract change, Preview or
  deployment occurred.
- **Gate:** a real dated two-pass canonical 533-row binding is still required;
  an atomic, idempotent transaction with rollback/preflight proof and separate
  write authorization remains a distinct future decision. The generic
  sequential importer is not authorized for this batch.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-OWNER-APPROVED-MARKET-VALUE-APPLICATION-PLAN-DRY-RUN.md`,
  `tests/touchline-owner-approved-market-value-application-plan.test.mts`.

## 2026-08-10 customer visual audit — Arena / Quick Substitution block

- **Observed locally:** the static Quick Substitution fixture rendered its
  synthetic 35/35 squad, 20/20 matchday and 9/9 bench at 1280 × 720 without
  horizontal overflow; the shared action surface scrolled independently.
- **Validated:** focused readiness, session, durable protocol and canonical
  pitch tests passed **23/23**. The no-reentry projection remains verified by
  tests, with no roster or database persistence on a match substitution.
- **Open product gap:** a filled 4-3-3 currently labels multiple reserve cards
  as locked rather than highlighting compatible outgoing pitch targets. The
  requested inline score-rail replacement is also not implemented by the
  existing standalone Training Centre surface. Neither was changed during the
  audit.
- **Limit:** desktop local observation only; 390/768 and native
  Safari/iOS/Android remain external visual gates.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PAGE-BY-PAGE-CUSTOMER-VISUAL-AUDIT.md`.

## 2026-08-10 customer visual audit — Live / Match Centre block

- **Observed locally:** PT-BR and EN both rendered the intentional, explicit
  empty-schedule state at 1280 × 720 without horizontal overflow. No fixture,
  opponent, date or result was fabricated when the local persisted schedule
  was unavailable.
- **Validated:** focused Match Centre, fixture-schedule, persisted-live and
  motion suite **11/11 passed**; the public schedule boundary remains
  read-only and POST is fail-closed.
- **Limit:** no populated canonical fixture was locally available, so no
  visual claim is made for live-score/final-score cards. Native devices remain
  external visual gates.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PAGE-BY-PAGE-CUSTOMER-VISUAL-AUDIT.md`.

## 2026-08-10 customer visual audit — Club Owner public profile block

- **Observed locally:** the PT-BR and EN public profile hero, portrait,
  navigation and feature card fitted the 1280 × 720 desktop viewport without
  horizontal overflow. The circular portrait trace stayed on the perimeter,
  outside the photo crop.
- **Status:** market/card copy remains explicitly pending where value authority
  is unavailable; no value, tier, contract or account state was changed.
- **Validated:** focused portrait/neon/motion suite **8/8 passed**.
- **Limit:** authenticated owner, mobile/tablet and native device behavior
  remain separate visual gates.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PAGE-BY-PAGE-CUSTOMER-VISUAL-AUDIT.md`.

## 2026-08-10 customer visual audit — ClubHub block

- **Observed locally:** the ClubHub chooser exposed 20 club links, and the
  City profile placed verified club identity/value status, honours and Next
  Match ahead of matchday content. It fails closed with explicit pending text
  when the local canonical roster is unavailable.
- **Static presentation proof:** the local profile fixture displayed a
  confirmed 11 + 9 sheet, separate technical/outside-match sections and a
  20-club neutral initial official table in the required order.
- **Validated:** focused ClubHub/official-table suite **27/27 passed**;
  inspected desktop paths had no horizontal overflow.
- **Open visual queue:** the trophy carousel still permits a partial entering
  or leaving tile; the requested full-exit transition was not altered here.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PAGE-BY-PAGE-CUSTOMER-VISUAL-AUDIT.md`.

## 2026-08-10 customer visual audit — cards/neon block

- **Observed locally:** static PT-BR/EN card fixtures rendered verified,
  pending and active-contract boundaries with art frames; player and coach
  both rendered their centred perimeter trace and club crest treatment with
  no 1280px horizontal overflow.
- **Motion:** the normal preference exposed the calm 8-second looping trace;
  focused tests verify a static illuminated outline under reduced motion.
- **Validated:** focused cards/neon/accessibility/motion suite **50/50
  passed**. Fixtures have no account, database, provider or persistence path.
- **Limit:** this is presentation proof, not proof of owner-batch values being
  applied to the database; native device QA remains external.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PAGE-BY-PAGE-CUSTOMER-VISUAL-AUDIT.md`.

## 2026-08-10 Quick Sub unintended state-write guard — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem:** merely opening authenticated standalone Quick Sub, or an empty
  `clearLineup` state, could schedule a generic Arena-state PUT and risk an
  unconfirmed empty-lineup upsert.
- **Correction:** standalone Quick Sub and empty lineups now return before
  client/remote persistence, cancelling any delayed save; the state API also
  rejects `lineup: []`.
- **Validation:** focused **36/36**, full **835/835**, strict TypeScript,
  full ESLint, Webpack production build and `git diff --check` passed.
- **Non-actions:** no database, roster, contract, card, value, provider, sync,
  migration or deployment action was performed.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-10-QUICK-SUB-UNINTENDED-STATE-WRITE-GUARD.md`.

## 2026-08-10 programming audit — block 1

- **Status:** confirmed code findings recorded without data mutation. The
  remaining P1/P2 items cover server-owned Quick Sub authority, stale Live
  presentation, deployment gate coverage, TypeScript coverage/cache hygiene,
  and fail-closed roster/demo fallbacks.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-PROGRAMMING-AUDIT-BLOCK-1.md`.

## 2026-08-10 Live stale-snapshot presentation guard — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem:** the persisted Live endpoint already marked stale snapshots as
  `degraded`, but Match Centre discarded that metadata and could still display
  an in-play result as `LIVE` / `AO VIVO`.
- **Correction:** the public presentation now consumes the server-calculated
  read state, announces degraded data visibly in EN/PT, and renders an in-play
  stale snapshot as `LAST VERIFIED` / `ÚLTIMO VERIFICADO` rather than current
  live data. The initial server schedule is explicitly marked partial until a
  fresh persisted live snapshot arrives.
- **Validation:** focused **20/20**, full suite **837/837**, strict
  TypeScript, ESLint, Webpack production build and `git diff --check` passed.
  A local production render at 1280 × 720 had no horizontal overflow or active
  animation in the degraded notice.
- **Non-actions:** no provider, database, cache refresh, sync, migration,
  credential, value/card/contract or deployment action was performed.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-LIVE-STALE-SNAPSHOT-PRESENTATION-GUARD.md`.

## 2026-08-10 ClubHub opponent-crest fail-closed guard — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem:** an unresolved fixture opponent could inherit the current club's
  crest from a page-local fallback and look like a confirmed match identity.
- **Correction:** fixture teams now resolve only through the local canonical
  club registry. Unknown opponents retain a name if supplied but show no
  crest; missing identities show the explicit EN/PT pending-opponent state.
- **Validation:** focused ClubHub suite **15/15**, strict TypeScript, ESLint
  and `git diff --check` passed.
- **Non-actions:** no provider, database, schedule, sync, migration, value,
  card, contract or deployment action was performed.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-CLUBHUB-OPPONENT-CREST-FAIL-CLOSED.md`.

## 2026-08-10 ClubHub trophy carousel full-exit pagination — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Problem:** the previous continuously translating honours strip, combined
  with a fading edge mask, let trophies appear partially at both ends of the
  viewport.
- **Correction:** honours now render as complete responsive pages. A page
  exits fully, is briefly absent, and only then is the next complete page
  mounted; the edge mask and duplicated moving sets are gone. Reduced-motion
  users retain static, manually operable pages.
- **Validation:** focused **35/35**, full suite **839/839**, strict
  TypeScript, ESLint, Webpack production build and `git diff --check` passed.
  Local production observation at 1280 × 720 found five full City trophies and
  no horizontal overflow or cropped edge cards.
- **Non-actions:** no trophy asset, provider, database, sync, migration,
  value/card/contract state or deployment was changed during local validation.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-CLUBHUB-TROPHY-CAROUSEL-FULL-EXIT.md`.
