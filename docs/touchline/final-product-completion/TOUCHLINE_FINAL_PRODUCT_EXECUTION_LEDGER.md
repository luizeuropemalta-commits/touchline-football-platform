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
