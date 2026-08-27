# TouchLine Final Product Completion — Current State

This is the sole authoritative continuation ledger. It supersedes the former
Full Product Recovery ledger without deleting its historical evidence.

## 2026-08-25 Player Zoom transparent information layer — QA GREEN

- **Scope:** commit `41f404c` removes only the green-tinted visual fills from the shared identity, performance and compact-stat panels. It preserves the card, backdrop, text, icon, rating, border, accessibility and full-performance contracts; no football, scoring, provider, database, Card Engine or Production boundary changed.
- **Evidence:** exact QA Preview `dpl_8BHxNgZv67Y6ouzaasvKvEtQCx6g` at `https://touchline-arena-official-q2x518emx-fifa-agent-plataform.vercel.app` returned public Club Hub HTTP `200`. Noni Madueke's actual opened Zoom had `background-image: none` for both details panels and six transparent stat-tile backgrounds, with no horizontal overflow. Focused zoom/dialog suite `19/19` and ESLint (zero errors; six established unrelated warnings) passed. Production remains untouched.

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

## 2026-08-10 ClubHub canonical crest perimeter trace — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Correction:** ClubHub directory, profile hero and canonical Next Match
  crests now reuse the shared calm 8-second centre-line trace. Each trace
  receives its colour solely from the canonical club registry; unresolved
  opponents remain without a crest or accent.
- **Safety:** the SVG is pointer-safe and contained within its own host; it
  uses no mask, clip-path or trace filter. Reduced-motion remains a static
  outline. No value, tier, price, contract, ranking, provider, database, sync,
  migration or credential state was changed.
- **Validation:** focused **4/4**, full local suite **841/841**, strict
  TypeScript, ESLint, Webpack production build and `git diff --check` passed.
  Local 1280 × 720 inspection found 20 directory trace hosts with no horizontal
  overflow, plus a profile hero trace that remained outside the crest art.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-CLUBHUB-CREST-PERIMETER-TRACE.md`.

## 2026-08-10 Arena main-field visual fixture and premium score-rail correction — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Correction:** added a no-data, admin-gated static 4-3-3 Arena fixture for
  390/768/1280 EN/PT visual QA. The real premium rail now keeps a future
  fixture as localized `Next` / `Próximo`, while preserving live/final state
  and verified score; it no longer places a calendar date on the Arena
  surface.
- **Visual evidence:** the local browser rendered actual-width `1280`, `768`
  and `390` iframe viewports (not desktop-scaled canvases). Each showed 11/11
  cards visibly inside the pitch, zero visible intersections and no outer
  page-width overflow. The deliberately synthetic static score rail showed
  team A vs team B plus LIVE/FT state, with no date. Native device
  Safari/iOS/Android remains external QA.
- **Validation:** focused **5/5**, full local suite **846/846**, strict
  TypeScript, ESLint, Webpack production build and `git diff --check` passed.
- **Safety:** no account, roster, database, provider, sync, migration, card
  value/tier/price, contract, credential, deployment configuration or Quick
  Sub authority was changed.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-ARENA-MAIN-FIELD-VISUAL-QA-AND-SCORE-RAIL.md`.

## 2026-08-10 Arena scheduled rail state visual QA — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Correction:** the same admin-gated static Arena fixture now also renders
  the third premium rail state: a scheduled fixture as localized `Next` /
  `Próximo`, with two team names and no kickoff date. It is included in the
  local EN/PT release-readiness fixture matrix.
- **Evidence:** all six direct local variants (EN/PT × 1280/768/390) rendered
  `Next`/`Próximo`, LIVE/AO VIVO and FT/FINAL together without a date or root
  horizontal overflow. The data remain synthetic fixture-only state.
- **Safety:** no account, roster, database, provider, sync, migration, value,
  contract, card tier/price, credential or deployment configuration changed.
- **Validation:** focused **8/8**, full suite **846/846**, strict TypeScript,
  ESLint, Webpack production build and `git diff --check` passed.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-ARENA-SCHEDULED-RAIL-VISUAL-QA.md`.

## 2026-08-10 ClubHub bench and pending-card readability — LOCAL COMPLETE / PENDING DEPLOYMENT

- **Correction:** confirmed 9-player technical-bench names now wrap rather
  than truncate on narrow screens; the compact pending market-value panel now
  says `PENDENTE` / `PENDING` in full while retaining neutral/pending state.
- **Observed evidence:** local 390px and 768px measurements found no root
  overflow and no sampled text overflow; the 1280px ClubHub layout was also
  visually checked in the local production render.
- **Safety:** no player, market value, tier, price, contract, provider,
  database, sync, migration, credential or deployment state changed.
- **Validation:** focused **8/8**, full suite **848/848**, direct TypeScript,
  production build, release-readiness check and `git diff --check` passed.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-10-CLUBHUB-BENCH-AND-CARD-PENDING-READABILITY.md`.

## 2026-08-11 manual editorial card mode — LOCAL COMPLETE / NOT DEPLOYED

- **Decision:** public compact and zoom card presentation now uses only a
  reviewed manual editorial profile (tier + display price) or an already
  frozen active contract. It does not derive a card from player valuation.
- **Visual continuity:** an unpublished card may retain its already-bundled
  club frame as visual artwork, but that asset never supplies a public tier,
  price, status or economic claim. This preserves the visible coloured card
  identity while editors publish profiles one player at a time.
- **Publication rule:** `draft` and `review` expose no tier or price;
  `published` exposes only public tier/price/review metadata. Internal note
  and internal source stay in the server-owned local catalogue.
- **Safety:** ClubHub/player readers request identity and membership only;
  automatic player/card search now fails closed before a provider lookup.
  No player, owner-value batch, contract, inventory, payment, database, sync,
  migration, credential, environment, Vercel, or deployment action occurred.
- **Validation:** focused editorial/public-boundary suite **94/94** passed
  before the final Arena presentation adapter; its dedicated contract **4/4**
  and the editorial privacy contract **7/7** passed. The final focused
  visual-art/editorial boundary suite passed **17/17**. The fresh integrated
  TypeScript recheck did not complete during a transient local filesystem I/O
  stall, so it is not claimed as passed for the final combined tree. ESLint remains a required release gate because a broad
  run was interrupted during a local I/O slowdown and is not claimed here.
- **Evidence and operator instructions:**
  `docs/touchline-arena/audit/2026-08-11-MANUAL-EDITORIAL-CARD-MODE-LOCAL.md`.

## 2026-08-11 manual card editorial admin candidate — LOCAL COMPLETE / DATABASE NOT TOUCHED / NOT DEPLOYED

- **Added:** a protected one-player manual editorial candidate. The editor
  enters an internal whole-EUR decision, review state and private evidence;
  the shared card policy calculates the tier and nominal TC display price.
  Draft/review records cannot become public card presentation.
- **Safety:** protected server validation requires a canonical player UUID,
  current club and exactly one active Sportmonks Premier League membership.
  The additive migration has immutable history and revokes all access from
  public/anon/authenticated. No migration was applied, database contacted,
  provider called, contract/checkout/payment touched or deployment made.
- **Validation:** editorial/admin focused suite **15/15**, strict TypeScript
  and scoped `git diff --check` passed.
- **Evidence and operator gates:**
  `docs/touchline-arena/audit/2026-08-11-MANUAL-CARD-EDITORIAL-ADMIN-CANDIDATE.md`.

## 2026-08-11 new-player market-value alert core — LOCAL COMPLETE / NOT ACTIVATED

- **Added:** a pure, deduplicated `MARKET_VALUE_REQUIRED` queue planner for
  new/transfer/unmatched canonical roster cases. It uses the strict 20-club
  reconciliation output and has no authority to assign a value, tier, border,
  neon or price.
- **Safety:** partial or duplicate provider snapshots block the entire queue;
  already-published profiles and unresolved keys deduplicate alerts. No
  provider poll, email, database write, cron, payment, credential or deploy
  action occurred.
- **Validation:** focused queue suite **3/3**, strict TypeScript and scoped
  `git diff --check` passed.
- **Evidence and activation gate:**
  `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-NEW-PLAYER-ALERTING-CANDIDATE.md`.

## 2026-08-11 shared card neon preservation and 20-club asset QA — LOCAL COMPLETE / NOT DEPLOYED

- **Correction:** a legacy generic pending selector now desaturates only a
  truly neutral card. A published editorial tier or frozen active-contract
  tier keeps its canonical border/neon rather than losing colour to unrelated
  pending metadata.
- **Technical QA:** all 20 canonical clubs × seven tiers have full, compact
  and zoom frame assets plus canonical crests; seven palettes are complete.
- **Validation:** 20-club asset suite **2/2**, strict TypeScript and scoped
  `git diff --check` passed.
- **Remaining gate:** browser/device matrix is still required; no production
  deployment, data, value, contract or payment state changed.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-NEON-CARD-VISUAL-AUDIT.md`
  and `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-20-CLUB-CARD-TECHNICAL-QA.md`.

## 2026-08-11 authoritative manual market-value card-publication model — LOCAL CANDIDATE / NOT APPLIED / NOT DEPLOYED

- **Decision:** this entry supersedes the earlier public “manual editorial
  card” interpretation. `football_player_market_values` is the canonical
  manual EUR-value store. Tier and nominal card price are calculated by the
  TouchLine engine; an explicit protected publication lifecycle is the only
  authority that may expose a game card.
- **Added locally:** additive migration candidate
  `051_touchline_manual_card_editorial_profiles.sql`, protected admin review
  flow, strict `NAME | AGE | VALUE` bulk preview, immutable publication
  history, and a single server-only `published` read model. ClubHub card grid
  and match XI now omit unpublished cards while keeping real football roster
  data available.
- **Safety:** no database migration, player/value write, provider request,
  Vercel environment change or deployment occurred. A missing/invalid value,
  stale membership, invalid classification or non-published lifecycle returns
  no game card; it never returns a grey/pending/fake-tier card.
- **Validation so far:** focused ClubHub/public-card boundary suite **17/17**
  passed after the authoritative rewrite. Full typecheck, lint, complete test
  suite, build and browser/device matrix remain release gates for the combined
  candidate.
- **Architecture:**
  `docs/touchline/architecture/TOUCHLINE_MANUAL_MARKET_VALUE_CARD_PUBLICATION_ARCHITECTURE.md`.

## 2026-08-11 Vercel recovery audit — COMPLETE / NO EXTERNAL CHANGE

- **Dashboard evidence:** project `touchline-arena-official` is on the Pro
  team plan, with a live Git integration and Node 24/Next.js build settings.
  A recent ready production deployment exists, but the history also has a
  burst of errors.
- **Root causes:** one Production deployment used an older candidate with a
  TypeScript failure; Preview deployments are correctly blocked because
  functional database/provider/sync variables are scoped into the isolated
  Preview environment. Both custom domains show `DNS Change Recommended`.
- **Safety:** no Vercel setting, secret, billing plan, domain, deployment or
  DNS record was changed. Failed deployment history was retained.
- **Gate:** no promotion until DNS is verified, the Preview strategy is made
  intentionally compliant, and a clean Git-sourced build at the reviewed SHA
  passes the required checks.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-11-VERCEL-COMPLETE-AUDIT.md`.

## 2026-08-11 Liverpool pipeline and 20-club binding forensics — LOCAL EVIDENCE / REMOTE EXECUTION NOT PROVEN

- **Liverpool:** the historical 052/053 SQL files are untracked local files,
  not migrations with a Git history or remote execution receipt. They describe
  a 29-player name-and-club bootstrap and must not be copied as a canonical
  20-club import mechanism.
- **20-club candidate:** the local owner/Sportmonks candidate has 558 supplied
  rows, 538 exact matches and 533 EUR rows, but all 533 still lack the
  read-only canonical UUID + active-membership proof required before any
  review or write plan. The five no-value, 23 provider-only and 20 owner-only
  rows remain excluded.
- **Safety:** no credential, database, provider, Vercel or production action
  occurred. The next permitted technical action is a dedicated, read-only,
  revision-fenced canonical snapshot—not a generic importer call.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-11-LIVERPOOL_CARD_PIPELINE_FORENSIC_REPORT.md`.

## 2026-08-11 Vercel build command guard — LOCAL COMPLETE / NOT DEPLOYED

- **Correction:** the candidate now declares `verify:release` and
  `vercel-build`. A Git-sourced Vercel build will have to pass strict
  typechecking, lint, the complete test suite and the local readiness contract
  before running Next.js production build.
- **Safety:** the typecheck is explicitly non-incremental; this gate does not
  delete generated cache files. It changes no Vercel setting, secret, domain,
  database or production deployment.
- **Validation:** source-contract test **1/1**, strict TypeScript, scoped lint
  and `git diff --check` passed.
- **External gates remain:** domain DNS, compliant Preview strategy and a
  reviewed Git SHA still require separate evidence before promotion.

## 2026-08-11 deferred card-publication safety gate — QUEUED / MANDATORY BEFORE ROLLOUT

- **Scope:** before any remote migration, manual-value write, publication-gate
  activation or production promotion, require an atomic publish/revert
  transaction, safe cutover/backfill plan, nominal-price verification and a
  rollback rehearsal.
- **Safety:** this record neither applies migration 051 nor changes database,
  Vercel, credentials, payments or production. It protects the current
  fail-closed published-card behaviour from being enabled ahead of data.
- **Evidence:**
  `docs/touchline/release-audit/2026-08-11-DEFERRED-CARD-PUBLICATION-SAFETY-GATE.md`.
  The exact atomic command and cutover design is recorded in
  `docs/touchline/architecture/TOUCHLINE_CARD_PUBLICATION_ATOMIC_ROLLOUT.md`.

## 2026-08-11 atomic card-publication command candidate — LOCAL ONLY / NOT MIGRATED

- **Added:** forward migration candidate `052_touchline_card_publication_atomic_commands.sql`.
  It adds explicit nominal-GBP compatibility columns and a protected atomic
  function which locks canonical identity/membership, value and publication
  state before writing current value, value history, publication and
  publication history as one database command.
- **Safety:** the function is not applied or callable remotely. It has no
  public/anon/authenticated execute grant. The Admin route delegates only to
  this RPC path and fails closed with 503 until the forward migration exists.
- **Validation:** atomic-command and public-card boundary focal suite **11/11**
  passed locally. Database transactional and rollback proof remains a required
  pre-rollout environment gate.

## 2026-08-11 nominal-price command hardening — LOCAL ONLY / NOT MIGRATED

- **Added:** the atomic publish command now rejects any tier/nominal-price
  pair outside the approved canonical GBP schedule: Ruby £0, Sapphire £1,
  Amethyst £2, Radiant Gold £4, Emerald £7, Clear Diamond £10 and Diamond
  Gold £15. This is enforced inside the database command, not only by the
  Admin UI.
- **Boundary:** the protected Admin route contains no direct current-value,
  value-history, publication or publication-history mutation. It can call only
  the atomic publish/revert RPC and otherwise fails closed while migration 052
  is absent.
- **Validation:** focused command/admin/manual-value tests **16/16**, strict
  TypeScript, scoped lint and `git diff --check` passed locally. No migration,
  database write, Vercel change or deployment occurred.
- **Remaining gate:** this is source-level proof only. A real database dry-run,
  all-or-nothing rollback rehearsal, cutover/backfill evidence and browser
  matrix are still mandatory before first production action.

## 2026-08-11 new-player manual-card alert — LOCAL ONLY / NOT MIGRATED

- **Added:** protected Admin-only `NEW PLAYER · MARKET VALUE REQUIRED` alerts
  for canonical Premier League players with exactly one active Sportmonks
  membership and no reviewed game-card publication.
- **Safety:** alerts are fail-closed for transfers, duplicate/inactive
  memberships and non-Premier-League records. They neither create a player,
  card, value, public pending state nor any provider/production write.
- **Validation:** alert/unit and Admin-boundary tests passed; strict
  TypeScript, scoped lint and `git diff --check` passed locally. Remote schema,
  database and deployment remain untouched.

## 2026-08-11 nominal-card-price public projection — LOCAL ONLY / NOT MIGRATED

- **Correction:** manual card publication and its shared public read model now
  render the approved **nominal GBP** tier price, never a TouchLine wallet
  balance. The legacy `*_tc` fields remain compatibility-only in the forward
  schema; they are not the public manual-card authority.
- **Validation:** 44 focused shared-card, Arena, ClubHub, assets, publication
  and visual-fixture contracts passed, including published EN/PT zoom labels
  and no-public-pending-card assertions. No remote action occurred.

## 2026-08-11 20-club card QA checkpoint — LOCAL CONTRACT PASS / BROWSER PENDING

- **Evidence:** all 20 canonical clubs have every crest/full/compact/zoom
  frame derivative and the seven canonical neon palettes. Static EN/PT card
  fixtures use only published manual GBP card terms, never a valuation or
  pending placeholder.
- **Validation:** 20-club assets plus static fixtures **10/10**, and broader
  shared-card/Arena/ClubHub boundary group **44/44**, passed locally. The
  gallery fixture then increased the 20-club asset/static group to **12/12**.
- **Limit:** the local Next server did not bind during the safe test window,
  so 390/768/1280 browser observations remain explicitly pending. No browser,
  production, database, provider or Vercel claim is made here.
- **Report:**
  `docs/touchline/release-audit/2026-08-11-TWENTY-CLUB-CARD-QA-CHECKPOINT.md`.

## 2026-08-11 publication-gate cutover guard — LOCAL ONLY / NOT DEPLOYED

- **Added:** `TOUCHLINE_CARD_PUBLICATION_GATE` is disabled by default and
  accepts only the explicit value `enabled`. Until the backfill/cutover proof
  exists, it preserves pre-existing verified canonical cards without exposing
  their EUR valuation or any pending/unclassified card.
- **Cutover:** after additive migration, backfill, dry run and visual proof,
  the controlled environment change to `enabled` removes that transitional
  path and makes the protected publication lifecycle the only game-card
  authority.
- **Validation:** publication-gate, public-card scope, read-model and zoom
  tests **14/14** passed locally. No environment, Vercel, database or
  deployment change occurred.

## 2026-08-11 revert-offer safety checkpoint — LOCAL ONLY / NOT MIGRATED

- **Added:** the protected manual-editorial history view now exposes a revert
  control only for an immutable, complete pre-publication snapshot with
  matching canonical player identifiers for both publication and market-value
  state. Incomplete first-publication history is visibly non-revertible.
- **Safety:** this presentation guard never substitutes for the future atomic
  database command, which must still validate active membership and restore
  value/publication/history consistently under one transaction. No automatic
  deletion or synthetic fallback state exists.
- **Validation:** focused revert and protected-Admin boundary tests **6/6**,
  strict TypeScript, scoped lint and `git diff --check` passed locally. No
  migration, database write, Vercel change or deployment occurred.

## 2026-08-11 20-club visual-matrix enforcement — LOCAL CHECKPOINT / NOT DEPLOYED

- **Added:** the executable release-readiness contract now includes the
  protected static twenty-club gallery in EN/PT. A release checklist cannot
  report local contract readiness if the gallery loses canonical registry,
  seven-tier or nominal-GBP fixture markers.
- **Validation:** release-readiness, gallery and canonical-asset focal group
  **7/7** passed locally. Browser observations at 390/768/1280 and native
  device evidence remain pending; no database, Vercel or production action
  occurred.

## 2026-08-11 Arena Market public-valuation cleanup — LOCAL ONLY / NOT DEPLOYED

- **Changed:** the authenticated Arena Market no longer renders raw player
  market value, market-value sorting, change or update fields. Listings and
  preview show published card tier, card price and card availability instead.
  The EN/PT Market copy was updated accordingly.
- **Preserved:** checkout, contract inventory, wallet totals and their server
  commands were not changed. Existing internal compatibility checks remain
  separate from public card presentation until the protected editorial
  publication cutover is authorised.
- **Validation:** Arena/editorial, commercial-surface and EN/PT Market-copy
  focal tests **14/14** passed; `git diff --check` passed. The local full
  TypeScript process was stopped after an I/O stall before it produced a final
  result, so it is not recorded as a pass. No database, Vercel or production
  action occurred.

## 2026-08-11 Arena visual-fixture editorial alignment — LOCAL ONLY / NOT DEPLOYED

- **Corrected:** the static 4-3-3 Arena QA field now gives its 11 fictional
  players an explicit published editorial tier and approved nominal GBP card
  price. It no longer relies on a fake verified `€20M` input that the shared
  card surface intentionally ignores.
- **Safety:** the fixture remains Admin-gated, static and isolated from
  account, provider, browser storage, drag/drop, cache and database state.
  This does not publish a player card or alter the real Arena.
- **Validation:** arena-field fixture tests **4/4**, strict TypeScript and
  `git diff --check` passed locally. Browser observation is still a separate
  pending gate because Next did not bind locally in the safe wait window.

## 2026-08-11 publication read freshness hardening — LOCAL ONLY / NOT DEPLOYED

- **Changed:** published game-card presentations now perform a fresh
  server-side read rather than a 60-second cache lookup. A successful atomic
  publication therefore appears on the next page/API read without a separate
  cache invalidation action.
- **Safety:** this removes cache invalidation as a possible post-commit
  failure mode. The database command remains the all-or-nothing authority for
  manual value, publication and immutable histories; the reader still fails
  closed for missing, unpublished, stale or non-canonical rows.
- **Validation:** atomic-command, protected-Admin and shared-read-model
  tests **9/9**, strict TypeScript and `git diff --check` passed locally. No
  migration, database write, Vercel configuration or deployment occurred.

## 2026-08-11 Vercel read-only audit checkpoint — NO CONFIGURATION CHANGE

- **Observed:** the connected Pro project `touchline-arena-official` is Ready
  on `main` at `304d5bb`; `touchline.com.br` and `www.touchline.com.br` map to
  Production. The visible six-hour observability window reported 0% errors.
- **Gates:** both public domains show a dashboard DNS recommendation and
  Deployment Checks are not configured. These are review gates only: no DNS,
  environment, deployment, billing, Git or Vercel setting was changed.
- **Evidence:** `docs/touchline/release-audit/2026-08-11-TOUCHLINE-VERCEL-COMPLETE-AUDIT.md`
  and `docs/touchline/release-audit/VERCEL_CLEANUP_CANDIDATES.md`. The audit
  permits continued local work only; it is not approval to deploy or migrate.
- **Canonical-host check:** a read-only HTTPS check observed `200` with HSTS
  from `touchline.com.br` and `308` from `www` to the canonical host. This
  validates the current production alias path only, not the unpublished local
  candidate or the dashboard DNS recommendation.

## 2026-08-11 manual editorial EN/PT boundary — LOCAL ONLY / NOT DEPLOYED

- **Changed:** the protected manual-card editor, club-scoped bulk preview and
  immutable history/revert controls now receive the existing EN/PT route
  locale. This is copy-only; the canonical identity, manual EUR input,
  classification policy, publication lifecycle and private evidence boundary
  are unchanged.
- **Validation:** manual-editorial boundary and classification focal tests
  **11/11** passed with `git diff --check`. No migration, database write,
  provider call, Vercel setting or deployment occurred.

## 2026-08-11 atomic manual-tier fence — LOCAL ONLY / NOT MIGRATED

- **Hardened:** the deferred atomic database command now independently
  verifies the approved EUR threshold for the requested tier as well as the
  nominal GBP price. A privileged caller cannot persist a valid-looking
  price/tier pair for a mismatched manual value.
- **Preserved:** active contracts, checkout amounts, existing migrations and
  public card reads are unchanged. Migration `052` remains local and
  unapplied.
- **Validation:** atomic-command and shared-manual-policy focal tests **7/7**
  passed with `git diff --check`. No database, Vercel or deployment action
  occurred.

## 2026-08-11 Arena Market publication-policy alignment — LOCAL ONLY / NOT DEPLOYED

- **Corrected:** Market card availability, price sorting and cart eligibility
  now use the same public card policy as every other game surface: an
  editorial card explicitly published by the owner, or an existing frozen
  active-contract term. They no longer derive eligibility, tier or price from
  a provider/verified-value field.
- **Preserved:** inventory identity, checkout, wallet, contract commands and
  active-contract terms were not changed. A card without a published profile
  remains unavailable rather than receiving a synthetic tier or price.
- **Validation:** Arena editorial boundary and commercial-card focal tests
  **10/10** passed with `git diff --check`. No database, Vercel or deployment
  action occurred.

## 2026-08-11 new-player review deep link — LOCAL ONLY / NOT DEPLOYED

- **Changed:** the protected new-player queue now keeps optional canonical
  position and detected-at context, normalises malformed optional context to
  `null`, and opens the precise canonical player in the protected manual-card
  editor. It still never creates a player, assigns a value or exposes a game
  card.
- **Safety:** provider identity remains internal; email and mobile push remain
  explicitly deferred until a server-owned queue/delivery mechanism and its
  consent/retention gates are separately approved.
- **Validation:** new-player-alert and owner-admin boundary tests **10/10**
  passed; scoped `git diff --check` passed. No database, provider, Vercel or
  production action occurred.

## 2026-08-11 twenty-club static matrix revalidation — LOCAL ONLY / NOT DEPLOYED

- **Validation:** twenty-club assets/gallery, ClubHub/crest/order fixtures and
  official-table tests **22/22** passed. The shared neon regression assertions
  now enforce the published editorial-card policy rather than the retired
  valuation/contract formatter.
- **Remaining gate:** a controlled local Next attempt did not become ready
  while the workstation volume was 99% occupied (3.5 GB free), so no actual
  390/768/desktop browser result is claimed. The stalled local process was
  stopped; no database, Vercel or production action occurred.

## 2026-08-11 manual-card typecheck and 20-club re-check — LOCAL ONLY / NOT DEPLOYED

- **Validated:** strict project TypeScript passed after hardening the owner
  manual-editor input boundary, the 50-row preview parser, the manual review
  alert queue, the Arena published-card price formatter and the static
  twenty-club fixture.
- **Focused evidence:** 29/29 twenty-club/ClubHub/table/reconciliation checks,
  24/24 editorial/Arena/manual-alert checks and 26/26 protected manual
  lifecycle checks passed. Scope was local logic only.
- **Unchanged:** no player record, manual value, publication state, inventory,
  payment/contract term, database migration, Vercel setting or production
  deployment was changed.
- **Still gated:** authenticated browser/device QA, a real canonical roster
  binding, application of the deferred migrations and explicit publication
  authority are still required before promotion.

## 2026-08-11 derived-matchday save fence — LOCAL ONLY / NOT DEPLOYED

- **Corrected:** the Arena persistence effect now also stops before local or
  remote save while a `fixtureId` matchday projection is active. Opening an
  internal fixture view can no longer overwrite the owner’s saved lineup with
  provider-derived positions.
- **Preserved:** the standalone Quick Sub no-reentry session remains local;
  production lineup edits outside matchday retain their existing explicit
  persistence path. No roster, contract, card, score, database record or
  remote request was executed by this change.
- **Validation:** Arena fixture/Quick Sub persistence boundary checks **10/10**
  passed and the scoped diff check is clean. The pre-existing complete
  typecheck remains green; a repeat typecheck was stopped after the local
  volume stalled, rather than being represented as a new pass.

## 2026-08-11 Quick Sub browser-session replay fence — LOCAL ONLY / NOT DEPLOYED

- **Corrected:** a serialized Quick Sub session is now reconstructed by
  replaying its recorded substitutions against the current 11 + 9 snapshot.
  Altered active slots, bench partitions or substituted-out history are
  rejected instead of being treated as authoritative browser state.
- **Boundary:** this remains a local match-session projection, not a
  server-owned match event system. Deleting browser session storage can start
  a new local session; durable official match history remains a separate
  product/authority gate.
- **Validation:** session and UI regressions **12/12** passed; scoped lint and
  diff checks passed. No storage schema, database, provider or deployment
  action occurred.

## 2026-08-11 Match Centre partial-score fence — LOCAL ONLY / NOT DEPLOYED

- **Corrected:** Match Centre now renders a numerical score only when both
  verified sides are finite numbers. A partial snapshot renders `VS`, never an
  invented `0` for the missing side.
- **Validation:** Match Centre regression checks **4/4** plus scoped lint and
  diff checks passed. This is display-only: no fixture, live snapshot, score,
  provider, database or deployment was changed.

## 2026-08-11 final local recovery gate — LOCAL ONLY / NOT DEPLOYED

- **Validated:** publication, release-build and twenty-club asset focal checks
  passed **9/9**; the executable local readiness script completed with its
  explicit `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL` result.
- **Preserved:** no project data was deleted during workspace cleanup. The
  regenerated `.next` cache is approximately 17 MB and remains a normal local
  build cache; no database, Vercel, payment or production action occurred.
- **Still gated:** remote migrations, a real UUID/membership binding and
  backfill, authenticated browser/device QA, a complete build and a separate
  explicit release authorization are required before rollout. Evidence:
  `docs/touchline/release-audit/2026-08-11-FINAL-LOCAL-RECOVERY-GATE.md`.

## 2026-08-11 manual engine fidelity re-check — LOCAL ONLY / NOT DEPLOYED

- **Validated:** 24/24 protected manual-value, bulk, publication, atomic,
  revert and new-player-alert checks passed. The sole shared engine turns a
  private manual EUR value into tier, border/neon and nominal GBP price; name
  and age remain matching aids, never identity writes.
- **Confirmed:** production code contains no Liverpool-only special case. No
  player, value, publication state, contract, migration, Vercel configuration
  or production deployment changed.

## 2026-08-11 controlled visual-QA environment attempt — LOCAL ONLY

- **Observed:** the local Next server started but did not return the protected
  static twenty-club QA route within 20 seconds. The exact local process was
  stopped; this was not a deployment and did not make any request to product
  infrastructure.
- **Gate:** no browser/device visual result is claimed. Repeat the matrix in a
  healthy controlled environment with authorised visual-QA access before
  release sign-off.

## 2026-08-11 repeat production-build attempt — LOCAL ONLY

- **Observed:** with approximately 8 GB free, `pnpm build` again reached the
  optimized-production phase and then made no CPU progress. Only its exact
  local build and worker processes were stopped.
- **Gate:** no build pass is claimed. This is a workstation environment gate;
  successful controlled build evidence remains required before promotion.

## 2026-08-11 remote roster-exporter preflight — NO-GO / NO REMOTE CHANGE

- **Read-only evidence:** the dedicated `touchline_roster_exporter` role does
  not exist. The generic `authenticated` role has CRUD table grants on all
  five required canonical roster tables; all have RLS enabled. The public
  schema has 52 functions executable by `PUBLIC`.
- **Decision:** no role, token, RLS policy, grant, migration, data write or
  deployment was created. A new role would inherit `PUBLIC EXECUTE`; solving
  that needs a separate project-wide privilege hardening, not a scoped export
  change. Evidence:
  `docs/touchline-arena/audit/2026-08-11-ROSTER-EXPORTER-REMOTE-PREFLIGHT-NO-GO.md`.

## 2026-08-11 canonical SQL Editor roster export and UUID binding — REVIEW ONLY / NOT APPLIED

- **Read-only evidence:** two identical authorized SQL Editor `SELECT` exports
  covered the 20 current clubs and returned **588** active player/membership
  rows on each pass with the same raw CSV SHA-256. The archived canonical
  export passed the strict 20-club, UUID, membership, timestamp and duplicate
  checks.
- **Bound locally:** all **533** explicit-EUR owner-approved rows now have an
  exact canonical player UUID, club UUID and active membership UUID in a
  fresh, immutable review-only manifest. The **5** missing-value rows, **23**
  provider-only rows and **20** owner-only rows remain excluded from every
  write set.
- **Unchanged:** no SQL mutation, migration, player/card/value/tier/price,
  contract, RLS policy, credential, Vercel setting or production deployment
  occurred. The binding remains `applicationEligible: false` until the
  separately gated atomic write procedure is authorized.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-11-CANONICAL-ROSTER-SELECT-ONLY-EXPORT-AND-533-BINDING.md`.

## 2026-08-11 owner-approved 533 atomic backfill — APPLIED / PUBLIC CUTOVER OFF

- **Applied safely:** the immutable fingerprinted 533-row owner-approved
  manifest was prepared and promoted in one database transaction after real
  database-level valid, invalid, idempotency and rollback proofs. It created
  533 publication rows, 533 batch-history links and 1,066 immutable history
  rows. The 5 value-missing, 23 provider-only and 20 owner-only rows remain
  outside every write set.
- **Protected:** card inventory stayed at 600 and contracts at 0, matching the
  before-state. The batch functions are inaccessible to `anon` and
  `authenticated`; no public grant, RLS relaxation, provider sync, roster,
  payment, wallet, Stripe, Vercel or deployment action occurred.
- **Cutover blocked deliberately:** Liverpool’s 29 existing verified legacy
  values/cards have no new publication-lifecycle rows. Enabling the new public
  gate now would hide them, so `TOUCHLINE_CARD_PUBLICATION_GATE` remains OFF.
  A separate canonical Liverpool publication candidate must pass the same
  atomic proof before the 20-club public cutover.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-11-OWNER-APPROVED-533-ATOMIC-BACKFILL-AND-CUTOVER-GATE.md`.

## 2026-08-11 Liverpool lifecycle candidate — LOCAL REVIEW ONLY

- **Read-only reconciliation:** the 29 already verified Liverpool values were
  exported from canonical active memberships and converted to a deterministic
  review-only lifecycle manifest. It contains no invented value or identity,
  and has fingerprint
  `ccbe56721b4747690df91ebea5800906a9545443428ba64acfd066848a66b490`.
- **Gate preserved:** the existing 533-only command deliberately rejects 29
  rows. No generic sequential importer, value rewrite, publication, Vercel
  gate or deployment was used. A distinct atomic 29-row command must be
  reviewed and database-proven before the public 20-club cutover.

## 2026-08-11 Liverpool 29 lifecycle completion — APPLIED / PUBLIC CUTOVER STILL OFF

- **Applied:** the dedicated atomic command bound and published the existing
  **29** verified Liverpool values to the protected lifecycle. It used the
  deterministic manifest fingerprint
  `ccbe56721b4747690df91ebea5800906a9545443428ba64acfd066848a66b490` and
  returned batch `16c1b5dc-5aa4-4d9f-828c-c60e5a9d1a58`.
- **Proven:** transaction rollback preserved all 29 pre-existing values;
  complete publish/revert was all-or-nothing; replay of the same manifest made
  one batch with 29 links only. The dedicated command does not write
  `football_player_market_values`.
- **Aggregate pre-cutover result:** **562** published lifecycle cards
  (`533 + 29`) across **20** clubs, with zero incomplete rows, wrong active
  memberships, duplicate players, invalid nominal GBP prices, wrong tiers or
  fake GBP-zero records. The fixed 5/23/20 exclusion sets remain out.
- **Still gated:** `TOUCHLINE_CARD_PUBLICATION_GATE` remains off pending full
  release/build evidence, a Ready production deployment and live smoke.
  Evidence: `docs/touchline-arena/audit/2026-08-11-LIVERPOOL-29-LIFECYCLE-PUBLICATION-APPLIED.md`.

## 2026-08-13 Preview Supabase incident closure — LOCAL CONTRACT COMPLETE / PRODUCTION UNCHANGED

- **Root cause confirmed:** Vercel Preview has no dedicated Supabase Staging
  configuration. The earlier masked-secret theory is superseded.
- **Fail-closed contract:** an ordinary Vercel Preview now stops at config load
  with `TL_PREVIEW_AUTH_UNAVAILABLE_NO_STAGING_CONFIGURATION`. An explicitly
  isolated Preview still serves only `/preview`.
- **Boundary preserved:** no Production Supabase variable, service role, card
  publication gate, DNS, provider, billing, database row or deployment was
  changed. Production service-role access was not copied to Preview.
- **Release consequence:** authenticated Preview QA remains
  `BLOCKED_BY_DESIGN_NO_STAGING_SUPABASE`; the protected Production card
  cutover continues through a clean reviewed SHA and gate-OFF deployment.

## 2026-08-13 Codex engineering environment governance — LOCAL DOCUMENTATION ONLY

- **Added:** concise root `AGENTS.md`; supported project-local `.codex/config.toml` with high reasoning, workspace-only writes, on-request approvals and no sandbox network by default; canonical entry points for architecture, product, security, release, rollback, current ledger and current state.
- **Consolidated, not deleted:** TouchLine HQ remains the product/architecture/security authority and this append-only ledger remains historical evidence. `CURRENT_STATE.md` now provides the short active SHA, gates, blockers and next action so ordinary missions do not need to ingest the full historical ledger.
- **Audited:** no versioned CI workflow; the official GitHub, Vercel, Supabase, Sentry and Codex Security plugins were installed/enabled at version `11c74d6b`, but no external authorization, secret, write permission or Production access was added. GitHub's registered connector returned no accessible TouchLine repository; Vercel/Supabase/Sentry require a fresh session and least-privilege authorization review before they can be called connected. The Vercel project link and Supabase application SDK are present; no Sentry application instrumentation exists. A least-privilege integration and post-cutover CI/repository-location plan is recorded in `docs/touchline/architecture/CODEX_ENGINEERING_ENVIRONMENT_2026-08-13.md`.
- **Verification limitation:** direct document/config contract checks passed. Branch `work/continuation-20260810` and HEAD `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52` resolved, but subsequent `git status`/`git diff` reads stalled in the Documents/iCloud checkout and were stopped without mutation. This is recorded as an environment P1, not a clean-worktree claim.
- **Boundary:** documentation/configuration only. No TouchLine component, route, behavior, database, migration, credential, feature flag, Vercel setting, deployment, DNS, billing, provider, Stripe or Production state changed.

## 2026-08-13 permanent Codex engineering environment — LOCAL COMPLETE / EXTERNAL ACTIVATIONS GATED

- **Canonical repository reverified:** branch `work/continuation-20260810`, `HEAD` and `origin/main` `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52`; no cache, temporary clone or generated `.next` output was treated as authority.
- **Governance validated:** concise root `AGENTS.md`, strict project-local `.codex/config.toml`, canonical architecture/product/security/release/rollback/current-state entry points, four work modes, one-critical-mission rule and independent-review rule are present. The current environment authority is `docs/touchline/architecture/CODEX_ENGINEERING_ENVIRONMENT_2026-08-13.md`.
- **Official stack established:** GitHub, Vercel, Supabase, Sentry and Codex Security plugins are installed. GitHub's official connector resolved the TouchLine repository/main SHA and read a harmless source file. Vercel CLI authenticated and inspected the existing official project, deployments, environment names/scopes and domains without values. Supabase CLI authenticated and listed project `vxireiswggllwhbsmdcj` without reading database credentials or rows. Sentry tooling is installed but remains `SENTRY_ACCOUNT_OR_PROJECT_REQUIRED`; no DSN or application instrumentation was invented.
- **Developer tooling validated:** pinned Node 24/pnpm 11.9, official GitHub/Vercel/Supabase/Sentry CLIs, Playwright with Chromium/WebKit/Firefox, `actionlint`, Git, ripgrep, jq and curl were version/path checked. Browser tooling passed a seven-project 390/768/1280/1440, keyboard, touch-capable, reduced-motion, screenshot, console and network-failure smoke matrix. Playwright WebKit remains explicitly distinct from native iOS Safari.
- **CI candidate created:** `.github/workflows/touchline-ci.yml` uses read-only repository permission and no Production secrets. Frozen install, release readiness, TypeScript, ESLint, full suite, diff/generated-artifact safety and Production build are enforced. `actionlint` and the source-contract regression passed locally. Activation remains gated on an intentional reviewed commit/push.
- **Reusable workflow:** user-level skill `touchline-release-preflight` was created and schema-validated. Post-release decomposition plans for ArenaClient, ClubOwnerProfileRenderer and TouchlineEliteExactCard were recorded without refactoring them.
- **Remaining environment boundaries:** Supabase schema/migration/RLS live inspection is not yet validated under a dedicated least-privilege database session; Sentry needs a real account/project; GitHub CLI itself is not authenticated although the official connector is; the iCloud checkout migration is planned but not executed. These are P1/deferred items, not authorization to change Production.
- **Production boundary:** no TouchLine behavior, database row, migration, RLS, credential, environment variable, feature flag, Vercel deployment, alias, DNS, billing, Stripe setting or Production state changed. The next product P0 remains Production authentication / missing `NEXT_PUBLIC_SUPABASE_URL`.

## 2026-08-14 Sentry tooling and privacy instrumentation — LOCAL COMPLETE / PRODUCTION INACTIVE

- **Account/project validated:** official `sentry-cli` `3.6.2` authenticated to organization `touchline-rn` and project `touchline-arena` (project ID `4511905124188240`) through a least-privilege internal integration. Capabilities are Project Read, Organization Read and CI only; Issue/Event write access and webhooks are disabled.
- **Credential hygiene:** the active CLI credential is stored only in the user configuration with mode `0600`. The earlier token exposed in conversation was revoked. No token, DSN or secret value was printed, committed, added to Vercel or copied to Preview/Production.
- **Local instrumentation:** `@sentry/nextjs` `10.70.0` now covers client, server, edge and global React errors. It fails closed without DSN, sends no default PII, samples no traces by default, scrubs credentials/request bodies/query strings, and uses build-only source-map credentials when separately configured.
- **Controlled proof:** event `143a3eef94e541bca4522f23db7c8a68`, environment `engineering-validation`, arrived with release SHA `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52` and was marked resolved in the authenticated Sentry UI.
- **Fresh gates:** focused Sentry/CI tests 3/3 PASS; TypeScript PASS; ESLint PASS with four pre-existing warnings and zero errors; complete suite **929/929 PASS**; Playwright browser tooling **7/7 PASS** across 390/768/1280/1440 Chromium, desktop WebKit/Firefox and reduced motion; `actionlint` PASS; diff check PASS; clean isolated Production build PASS with 131 routes.
- **Boundary:** no Production deployment, Sentry Production activation, Vercel environment change, Supabase/database/RLS change, DNS, billing, payment or card-publication gate change occurred. Production Sentry stays inactive pending a separately authorized DSN/environment/source-map release gate.

## 2026-08-14 canonical checkout migration — COMPLETE / OLD CHECKOUT PRESERVED

- **New canonical path:** `/Users/luizlopez/Developer/touchline-football-platform`, cloned cleanly from GitHub branch `codex/canonical-checkout-migration-20260814` at preservation SHA `acd274dab2cde9bacee28d6f902b5f28f19391e2` and tree `b093bd103aed4c2514f78689542f25a115a66dd9`.
- **Preservation:** 62 explicitly reviewed paths were committed and pushed; local and remote SHA matched. The former Documents/iCloud checkout remains intact and is no longer source authority.
- **Clean-clone proof:** no dataless files, no inherited `node_modules`, `.next`, local environment file or Vercel binding, and no tracked modification after the full validation run.
- **Fresh gates:** frozen install PASS; release readiness PASS; TypeScript PASS; ESLint 0 errors/4 pre-existing warnings; full suite 929/929 PASS; Playwright 7/7 PASS; diff check PASS; Next.js 16.2.11 Production build PASS with 131 static pages.
- **Authorized cleanup:** three temporary worktrees were removed only after path/status validation. Four unique uncommitted files from one temporary Preview worktree were preserved first as a verified 12 KiB patch at `/Users/luizlopez/Developer/touchline-recovery-20260814/market-p0-functional-preview-20260813.patch`.
- **Boundary:** no Product behavior, Production deployment, Vercel environment, DNS, Supabase/database/RLS, credential, billing, Stripe or card-publication state was changed by this migration.

## 2026-08-15 representative QA package — ENGINEERING DECISION / IMPLEMENTATION IN PROGRESS

- **Objective:** prepare one deterministic, versioned and reversible representative package in the isolated `TouchLine Development QA` project so authenticated browser QA can exercise the twenty-club Market, published cards, squad construction, Arena and Quick Substitution without using Production data or credentials.
- **Authority and scope:** every write must first prove the exact QA project ref `xgxbwqxjssxxuihuwmgy`. Real football identities come only from the archived canonical 20-club roster export and its active memberships. Manual values, tier and nominal price come only from the immutable owner-approved 533-row publication manifest. The existing published Liverpool 29 batch is preserved and reconciled, never recreated by name.
- **Synthetic boundary:** deterministic QA-only identities may be introduced only where a required visual/formation state cannot be proved from canonical football data. They must be visibly marked `QA FIXTURE`, carry the fixture version/run id, remain unpublished and must never be represented as official football facts, market values or commercial cards.
- **Non-goals:** no Production Supabase/Vercel/DNS/alias/environment/card gate/payment/provider state; no copied Production service role; no invented player value, position or fixture presented as official; no name-only identity write; no broad destructive cleanup.
- **Implementation contract:** a dry-run must validate repository manifests, project identity, row counts, UUID uniqueness, active memberships, tier/price policy and the current QA before-state before any mutation. Apply must be idempotent and auditable with `touchline_qa_fixture_version` plus `qa_fixture_run_id`. Rollback must remove only rows created by that run and restore any pre-existing QA publication state through the existing protected batch revert path.
- **Release boundary:** this package is QA infrastructure only. It does not authorize Production promotion. After apply, database invariants, authenticated Market/Arena/ClubOwner/Quick Sub flows, responsive browser matrices and a separate security/release preflight remain required.

### ClubOwner representative scenario contract

- **Roster authority:** the QA owner scenario uses the official atomic Market checkout against 35 already-published canonical cards. It does not insert contracts directly. To avoid a fake credit or payment event, selection is limited to the approved Ruby Red zero-TC tier.
- **Composition:** 3 goalkeepers, 10 defenders, 11 midfielders and 11 attackers preserve the exact aggregate totals of the 35-player rules. The remote Arena state contains a canonical 4-3-3 (1 goalkeeper, 4 defenders, 3 midfielders and 3 attackers); the authenticated client derives 9 matchday substitutes and 15 outside the matchday squad from the remaining active contracts.
- **Position boundary:** source evidence provides canonical broad positions and the already-approved full-back catalogue, but not a complete authoritative CDM/ST classification for all 35 selected players. The QA scenario therefore records tactical slots separately and never rewrites or presents an invented official player position. Exact CDM/ST roster-filter proof remains gated on canonical detailed-position authority.
- **Profile and coach:** the scenario sets only the approved repository avatar URL and the existing QA coach provider id `455907`, while snapshotting the prior avatar and Arena state for a scoped rollback.
- **Rollback:** rollback uses the official no-refund contract-release command for only the 35 scenario cards, restores the prior avatar/Arena state, and marks the zero-TC QA order reversed. Immutable checkout/release history remains as audit evidence; no wallet grant or destructive identity cleanup is used.

## 2026-08-15 representative QA package — APPLIED TO QA / PRODUCTION UNCHANGED

- **Canonical package applied:** run `bf476289-c6df-47a6-878e-7dc8c40f3f91`
  on QA project `xgxbwqxjssxxuihuwmgy` contains 20 clubs, 588 canonical
  players/memberships, 533 owner-approved cards plus 29 preserved Liverpool
  cards, for 562 published cards across all seven tiers. Expected and observed
  counts match and replay is idempotent.
- **ClubOwner scenario applied:** the existing official QA identity has 35
  zero-TC active contracts, approved avatar, coach `455907`, a 4-3-3 with 11
  starters, 9 substitutes and 15 outside the matchday squad. QA tactical labels
  cover GK/CB/RB/LB/CDM/MID/ATT/ST without rewriting canonical football facts.
- **Live/Arena coverage applied:** 20 reversible QA fixtures cover Scheduled,
  second half, Finished, Postponed, Cancelled, stale/degraded and partial-score
  behavior. No unverified venue was created.
- **Visual/state catalogue applied:** 27 service-role-only rows cover 11 card
  cases, 2 coach cases, 4 Quick Sub cases and 10 fail-closed UI states. Its
  rollback was transaction-proven as 27 removed, zero remaining and 27 restored.
- **Quick Sub verified:** 31/31 focused tests prove exact 11+9 readiness,
  fixed-slot replacement, outgoing disabled, no re-entry, replay idempotency and
  no saved-roster mutation. Current substitution history remains browser-session
  scoped rather than a server-owned cross-device match ledger.
- **Gates:** representative/card tests 27/27 PASS; coach/card zoom 24/24 PASS;
  TypeScript PASS; diff check PASS. Production, DNS, Vercel environment, feature
  flags, payment, provider data and `touchline.com.br` were not changed.
- **Evidence:**
  `docs/touchline-arena/audit/2026-08-15-REPRESENTATIVE-QA-PACKAGE.md`.

## 2026-08-15 native Safari stale-deployment incident — CLOSED / QA ONLY

- **Symptom:** an already-open native Safari tab became visually blank after the stable QA alias moved to the new Market P0 deployment. No current Arena-state or roster requests appeared in runtime logs during the blank render.
- **Cause proved:** Safari's open page retained the asset graph from deployment `dpl_AMVH4DELGqeVQ3vdg67SQwEj493u` at commit `1130455`, while Vercel's stable QA alias correctly pointed to deployment `dpl_5GCTMjjJnanBgFjWdrkqukuwrkf6` at commit `486e790fee65a278dfa1d2d23d5642a7312e3da6`.
- **Server evidence:** the current Market document returned HTTP 200 with `Age: 0`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and `x-vercel-cache: MISS`. This rules out a current server/CDN stale-document defect.
- **Recovery and verification:** one Web Inspector cache-bypass reload fetched the current chunk hashes and all expected Market APIs. The authenticated page rendered the deterministic 35-player QA scenario, coach, XI and 20-club catalogue. Cache bypass was then disabled and an ordinary reload also passed with the same current asset graph.
- **Decision:** no code, Vercel configuration, Supabase data or credential change is required for this incident. It is closed as stale in-memory browser state across deployments, not a product-data loss or a need to copy Production into QA.
- **Boundary:** Production, `touchline.com.br`, DNS, payment systems, the Production database and the card-publication gate were not changed. The next gate is the responsive Market visual/interaction matrix followed by page-by-page authenticated QA.

## 2026-08-15 Market full-back filters — FIX VALIDATED / QA DEPLOY PENDING

- **Rendered defect:** native Safari on the authenticated QA Market showed Liverpool with 28 cards, but the Right-back filter returned `0 CARDS FOUND` even though the catalogue included Jeremie Frimpong and Conor Bradley. The same broad-position boundary could hide left-backs.
- **Cause proved:** the persisted provider roster supplies the broad role `Defender`; `market-position-catalogue.ts` refines it through exact provider-player IDs. The approved 19-club catalogue was present, but the separately preserved Liverpool batch was missing four current exact IDs, so the shared fallback classified those players as centre-backs.
- **Correction:** added only the four exact Liverpool provider IDs to the existing shared catalogue: Frimpong and Bradley as right-backs; Kerkez and Tsimikas as left-backs. Identity, card tier, nominal price, market value, contract, roster and database data were not changed.
- **Evidence:** official Liverpool player material confirms the football roles; the repository's existing verified Liverpool publication manifest binds each name to its exact provider-player and canonical UUID. The implementation continues to match by provider ID, never by name alone.
- **Verification:** focused position tests `9/9`; TypeScript passed; targeted ESLint passed; `git diff --check` passed; full Vercel release build passed with ESLint `0` errors and the same `4` pre-existing warnings, tests `949/949`, and Next static generation `133/133`.
- **Gate:** deploy only to the stable QA branch/alias, then re-observe Liverpool Right-back and Left-back filters in Safari plus cross-club spot checks. Production remains forbidden.

## 2026-08-15 authoritative roster browser contract — FIX VALIDATED / QA DEPLOY PENDING

- **Rendered defect:** the authenticated QA Market proved `35/35` active contracts and the persisted Arena state proved `11/11` starters, but the squad builder rendered `0/9` substitutes and `0/15` outside the matchday squad.
- **Cause proved:** `/api/touchline-arena/roster` returned HTTP 200 with the complete published editorial roster. The server intentionally stopped emitting the retired `cardPriceAuthority` field, while `parseAuthoritativeRosterResponse` still required the literal `active-contract`. The browser rejected the complete response wholesale, so it retained the empty fallback bench.
- **Correction:** the untrusted browser boundary now accepts a valid published editorial card without retired pricing fields, still accepts a frozen active-contract fallback, rejects unknown authority strings, and rejects any card with neither authority. No ownership, price, tier, contract, football identity or database row changed.
- **Regression coverage:** a cross-boundary test now sends the exact output of `mapAuthoritativeRosterRows` into `parseAuthoritativeRosterResponse`; the client-specific tests also cover the published editorial contract, frozen fallback, missing authority and forged authority.
- **Verification:** focused authoritative-roster tests `24/24`; TypeScript passed; targeted ESLint passed; `git diff --check` passed; full Vercel release build passed with ESLint `0` errors and the same `4` pre-existing warnings, tests `952/952`, and Next static generation `133/133`.
- **Gate:** deploy only to the stable QA branch/alias, then prove in native Safari that the authenticated builder renders `35/35` contracts, `11/11` starters, `9/9` substitutes and `15/15` remaining cards. Production remains forbidden.

## 2026-08-16 canonical QA persona closure — QA ONLY / HISTORICAL ACTOR RETAINED

- **Decision:** the former technical account remains a **HISTORICAL QA ACTOR**. Its immutable publication provenance is retained; no deletion, reassignment, password reset, Production mutation or database migration is part of this closure.
- **New fail-closed contract:** every new authenticated QA run must prove the exact QA project `xgxbwqxjssxxuihuwmgy`, the stable `qa` branch alias, canonical owner email `jl_nenelopes10@hotmail.com`, UUID `072900f3-27fc-41a5-9881-6913a486754e`, confirmed Auth email, matching public profile and Arena access.
- **Prevention:** the executable preflight rejects another project, alias, UUID, email, an unconfirmed account, missing profile or missing Arena access before a new customer-style QA journey begins. Tests retain only a negative regression reference to the historical actor, so it cannot be silently selected again.
- **Evidence boundary:** no browser credential/session storage, password, recovery token or service-role value is committed or logged. Production, `touchline.com.br`, credentials, card data, contracts and history are unchanged.
- **Next checkpoint:** run the preflight on the QA project, use only the canonical owner in the visible QA browser, then resume the existing responsive visual audit without reopening already-closed route audits.

## 2026-08-16 Arena fixture rail and in-Arena Quick Sub — QA CANDIDATE / DEPLOY PENDING

- **Observed Arena defect:** the QA fixture endpoint returned twenty-one published schedule items, including the current representative round, yet the Arena rendered the empty rail. The client accepted only numeric fixture provider IDs; the QA snapshot uses stable canonical cache IDs such as `qa-representative-01`, so it discarded the otherwise published fixture record.
- **Correction:** the client now accepts a non-empty stable provider ID from the server-published fixture snapshot. It does not create, edit or infer schedule data. The round selector still keeps one coherent weekly ten-match round, and score presentation remains contingent on actual schedule status/scores; upcoming matches show the two clubs and next-match state only.
- **Quick Sub interaction:** opening Substituição Rápida intercepts the same Arena deep link and changes React state instead of navigating the document. A successful substitution now clears only the in-Arena bench panel and immediately restores the fixture rail in the same match context. The outgoing player remains in the non-interactive substituted-out rail and cannot re-enter. No roster, contract, database or remote Arena state is saved by this match substitution.
- **Visual containment work:** the Quick Sub smoke layer is lighter so the pitch remains visible. Tier-card hover uses artwork-following `drop-shadow` light rather than a rectangular box glow. The ClubHub directory now uses a thin moving SVG stroke around each rounded club card and enlarges crest plus perimeter together; reduced-motion remains static.
- **Verification:** focused regression tests `61/61`; full suite `987/987`; TypeScript `pnpm exec tsc --noEmit --incremental false` PASS; ESLint PASS with zero errors and four pre-existing warnings; release-readiness PASS; production build PASS with 133 generated pages; `git diff --check` PASS.
- **Boundary and next gate:** this candidate changes only source, tests and QA operational state. Production, touchline.com.br, Vercel Production settings, Supabase data/auth, DNS, billing, payments and card-publication state remain untouched. Native QA deployment and rendered desktop/mobile visual observation are still required before a visual PASS is claimed.

## 2026-08-16 Arena frozen-contract card presentation — QA DEPLOYED / VISUAL GATE PENDING

- **Observed defect:** the representative QA Arena had a complete `35/35` contract roster and displayed player labels in the `11/11` field positions, but the player-card artwork itself was blank. This made the field and bench visually incomplete despite valid signed contracts.
- **Cause proved:** the common `TouchlineEliteExactCard` allowed either a published editorial presentation or an explicit visual preview tier. Existing signed QA cards are intentionally carried as frozen `active-contract` terms, so their valid fixed tier was excluded from the rendering gate.
- **Correction:** the shared component now accepts the fixed tier only when `cardPriceAuthority === "active-contract"`, while leaving unpublished cards fail-closed. It does not derive a value, tier or price from valuation data and does not change contracts, roster data, player identity, prices, or card-publication state.
- **Verification:** focused shared/Arena card regression set `21/21` PASS; TypeScript PASS; targeted ESLint PASS; full suite `989/989` PASS; full Vercel build completed with 133 routes, zero ESLint errors and the same four pre-existing warnings; `git diff --check` PASS. The native QA deployment `dpl_CRrfqxNrtbiGkq7ejVKwV8uhuNB6` is READY on commit `72713d7` and owns the stable `qa` alias. Public QA smokes returned `200` for Live and ClubHub and `307` to login for unauthenticated Arena as expected.
- **Boundary and next gate:** QA-only source release. Production, touchline.com.br, Vercel Production configuration, Supabase data/auth, DNS, payments and the publication gate were not changed. Native authenticated desktop/mobile observation of the rendered field/bench cards, rail and Quick Sub remains required before visual PASS.

## 2026-08-16 complete QA matchweek and owned-card field visibility — QA ONLY / DEPLOY PENDING

- **Live round defect:** the QA schedule contained twenty representative fixture rows but repeated clubs within each round. The shared Arena selector correctly rejected a round once it found a repeated club, leaving a truncated seven-fixture surface instead of the intended complete ten-match round.
- **QA-only correction:** migration `007_touchline_qa_complete_matchweek_repair.sql` preserves the existing fixture IDs, kickoff times, statuses and score states while pairing each of the 20 canonical QA clubs exactly once in each of the two representative matchweeks. It is project-gated, idempotent and has an explicit rollback. The applied QA result is two rounds of ten fixtures with twenty distinct clubs each; no football provider, Production data or result was invented or changed.
- **Arena builder field defect:** a completed `11/11` field, `9/9` bench and `35/35` squad could still show only player labels because `TouchlineSquadBuilderStage` did not opt its already-owned cards into the exact component's authenticated inventory visual-preview boundary.
- **Correction:** the three authenticated squad-builder card surfaces (field, matchday bench and remaining squad) now pass `allowVisualInventoryPreview`. This restores artwork only for roster cards already rendered in the authenticated builder; no public publication rule, price, valuation, contract, CTA or data ownership behavior changes.
- **Verification:** focused card/squad suite `18/18` PASS; TypeScript PASS; targeted ESLint PASS; production build PASS with 133 generated routes; `git diff --check` PASS. Full suite result was `992/993`; the sole failure was pre-existing/time-sensitive `football data HTTP aborts a slow provider request`, measured at 11.6s against its 2s latency assertion. It is recorded as a separate runtime-test instability and was not masked.
- **Boundary and next gate:** commit and deploy only to the stable `qa` alias, then inspect the authenticated actual QA owner journey: cards visible in all 11 field slots, 9 bench slots and 15 remaining slots; no Production change.

## 2026-08-16 Live fixture cascade — QA CANDIDATE / DEPLOY PENDING

- **Scope:** reworked only the Match Centre fixture rail presentation. The rail now identifies the competition with a drawn England flag and the explicit label **TouchLine England League**. Each confrontation is vertically ordered as home team, score or kick-off state, then away team, with a narrow divider and a non-interactive future match-alert indicator.
- **Honest notification boundary:** the indicator communicates that match alerts are planned; it does not claim to subscribe the device or deliver lock-screen notifications. Real alerts remain a separate push-permission and delivery-service feature.
- **No data or rule changes:** fixture selection, persisted schedule reads, score truthfulness, fixture status, football data, authentication, contracts, cards, prices, database and Production configuration were not changed.
- **Verification:** focused Match Centre tests `9/9` PASS; complete suite `994/994` PASS; `pnpm run check:release-readiness` PASS; TypeScript PASS; ESLint `0` errors with four existing repository warnings; `git diff --check` PASS; production build PASS. Rendered Chromium evidence at 1440×900 and 390×844 showed the league title, the complete vertical fixture card, no modal, no console failure and no horizontal overflow. Playwright browser-engine evidence is not represented as native iOS Safari evidence.
- **Deployment boundary:** this is a QA-branch candidate only. Production, `touchline.com.br`, Vercel Production settings, Supabase data/auth, provider configuration, DNS, payments and feature flags remain untouched. Next gate: push only the reviewed commit to `qa`, wait for the native QA Vercel deployment, and observe it through the stable QA alias.

## 2026-08-16 Live fixture rail: verified time and score column — QA CANDIDATE / DEPLOY PENDING

- **Scope:** refined only the Live fixture cascade. Each rail item now shows the verified kick-off time (`HH:MM`), home crest/name, away crest/name, a compact vertical result column aligned beside the non-interactive alert affordance, and the real state (`NEXT`, `LIVE`, `FULL TIME` or `LAST VERIFIED`). Rail crests use the original asset without a circular background.
- **Truthfulness rule:** a score is rendered only when both persisted official scores are finite. Otherwise the rail stays score-neutral; a live item says `LIVE/AO VIVO` rather than claiming an elapsed minute such as `23′`, because the canonical public fixture DTO does not currently provide a verified elapsed-minute field.
- **Verification:** focused Match Centre tests `9/9` PASS; complete suite `994/994` PASS; TypeScript PASS; ESLint PASS with zero errors and four existing repository warnings; production build PASS with 133 generated routes; `git diff --check` PASS. Rendered local desktop evidence at 1280px shows the England league label, enlarged unbacked crests, the 16:30 kick-off time, and no horizontal overflow.
- **Boundary:** no fixture, score, player, card, authentication, database, provider, notification subscription or Production configuration changed. The alert icon is presentation only; it does not claim device push registration. Next gate: commit and deploy only to the `qa` branch, then inspect the stable QA alias in EN/PT on desktop and mobile.

## 2026-08-16 provider metadata server boundary — QA APPLIED / PRODUCTION UNCHANGED

- **Finding:** `football_provider_mappings` and `football_data_sync_runs` were readable by authenticated browser roles. The latter includes `source_payload`, which can contain raw provider responses. This bypassed the intended server-side sanitisation and provider-data licensing boundary.
- **Correction:** forward-only migration `058_football_provider_metadata_server_boundary.sql` removes both authenticated read policies, revokes `public`, `anon` and `authenticated` table privileges, and grants access only to `service_role`. It was applied only to isolated QA project `xgxbwqxjssxxuihuwmgy`.
- **Application contract:** `/api/football-data/foundation` keeps its explicit safe sync-run column projection, but reads it through the server admin client only after request authentication. When server admin configuration is unavailable it returns no sync-run records rather than falling back to a browser read.
- **Verification:** focused boundary and sync-safety tests `4/4` PASS; full suite `996/996` PASS; TypeScript PASS; scoped ESLint PASS; `git diff --check` PASS; production build PASS with 133 routes. QA privilege inspection confirmed these two tables are accessible only to `postgres` and `service_role`.
- **Boundary:** no player, membership, fixture, card, value, contract, user, Auth, Production database, Vercel Production environment, DNS, payment, provider configuration or `touchline.com.br` state changed.

## 2026-08-16 provider metadata server boundary — QA DEPLOYED

- **Source:** commit `ff9fdb6` was pushed only to branch `qa`; native Vercel deployment `dpl_Hv1HnSpApbpN9qkYG7Seti6XAXgc` reached `READY` and now owns the stable QA alias.
- **Smoke:** the stable alias returned `200` for public Live and ClubHub routes. Unauthenticated Arena returned the expected `307` login redirect. Response headers identify the new deployment token `dpl_Hv1HnSpApbpN9qkYG7Seti6XAXgc`.
- **Security audit:** the completed standard scan `dfc750c3-8830-4c79-b438-3772af01115f` reported the original authenticated provider-metadata browser-read boundary as one medium finding. Its QA remediation is migration `058`, with applied grant verification recorded above. The scan baseline was commit `084a6d5`; its warning about a changed checkout is expected because the remediation was committed after the audit began.
- **Boundary:** QA branch and QA database only. Production, credentials, DNS, payments, provider configuration, card-publication state and `touchline.com.br` remain unchanged.

## 2026-08-17 QA representative seven-tier scenario — DATABASE GREEN / QA DEPLOY PENDING

- **Scope and confirmed cause:** the original 35-card QA owner scenario intentionally used 35 `ruby-red` contracts. The uniform red display was therefore scenario data, not a CSS, provider, Arena-tier or Production defect. The corrected QA-only scenario uses only existing canonical published cards and retains the canonical QA owner, 35 active contracts, coach `455907`, 11 starters, 9 bench cards and 15 remaining cards.
- **Applied result:** the current run `bf476289-c6df-47a6-878e-7dc8c40f3f91` is `applied` with all seven canonical tiers: ruby-red `6`, sapphire-blue `4`, amethyst-purple `6`, radiant-gold `6`, emerald-green `6`, clear-diamond `3`, diamond-gold `4`. Its editorial total is `£172`; QA checkout remains `0 TC` without changing canonical price, tier, player, club or publication identity.
- **Rollback repair and proof:** two QA-only forward migrations repair the rollback function for the current tactical-slot columns (`broad_position`, `tactical_bucket`, `slot_index`, metadata, creation time) and numeric historical order balances. The function is executable only by `service_role`, not `anon` or `authenticated`. A real rollback returned `rolled_back`, restored 35 cards and preserved the ledger; the same run was then reapplied, and an immediate further apply returned `already_applied`.
- **Database verification:** `35` active contracts; `11` lineup cards; `9` bench; `15` remaining; `35` tactical slots; `7` represented tiers; `0` duplicate active contracts; `0` orphan contracts; `0` invalid publications; `0` price/tier mismatches; `0` non-ruby zero editorial prices; `0` nonzero QA-checkout contract metadata.
- **Local verification:** focused tier-mix tests passed; full suite `1016/1016`; TypeScript passed; ESLint passed with `0` errors and four existing warnings; mission governance and release-readiness checks passed; `git diff --check` passed; Next production build passed with 133 routes.
- **Boundary and next gate:** this change is limited to the QA scenario rollback source, its regression test and QA database migrations. It has not yet been pushed or deployed. Production, `touchline.com.br`, Vercel Production settings, Production database, credentials, payments and provider configuration remain unchanged. Next: commit and push only `qa`, await READY, then capture authenticated Safari/Chromium/WebKit visual evidence across desktop, tablet landscape and phone landscape. Record but do not correct the separate 4-3-3 issue.

## 2026-08-18 Arena 4-3-3 cinematic coordinate lock — QA DEPLOYED / VISUAL GREEN

- **Scope and cause:** authenticated native Safari showed the saved official 4-3-3 base slots being reprojected by per-camera profile offsets. The first implementation allowed the historic camera path to distribute cards through the crowd and accepted a prior-loop position. This was visual placement only: no contract, tier, editorial price, player, club, QA persona, Supabase state or Production state was changed.
- **Correction:** `arena-formation-video-layout.ts` is the sole explicit `formation + loop + viewport` source for protected 4-3-3 match presentation. It covers the three camera loops (`wide-touchline`, `lower-stand`, `side-sweep`) at desktop, tablet-landscape and phone-landscape. The field renderer now ignores saved camera drags and transient editor positions for this protected formation, uses each canonical card height with the chosen coordinate, and updates the profile on window, orientation and visual-viewport resize.
- **Visual iteration:** native Safari first confirmed the wide-touchline correction; the low/side camera capture still exposed the upper card clipping into the stand. The canonical anchors for the lower-stand and side-sweep were then moved onto the tactical grass and their sizes reduced proportionally. Final native Safari evidence shows the goalkeeper in the goal area and stable 1/4/3/3 columns on the pitch for all three loops, with no card-frame overlap, inherited prior-loop coordinates or viewport clipping.
- **Responsive and browser evidence:** native Safari Responsive Design Mode passed at desktop, `1024×768` tablet landscape and `844×390` phone landscape with all 11 labelled field controls present. Chromium, Playwright WebKit and Firefox each returned HTTP `200` from the stable QA alias with zero console/page errors. Those automated engines have no canonical authenticated QA session, so the rendered owner XI remains Safari-native evidence rather than being misrepresented as an anonymous browser assertion.
- **Verification:** focused video-layout tests PASS; full suite `1020/1020` PASS; TypeScript PASS; ESLint `0` errors with four pre-existing warnings; `git diff --check` PASS; local production build PASS with 133 routes; Code Verification/release governance PASS; Vercel build/release gate PASS. Native Vercel deployments `dpl_AP1N4ogHjPPP2iJMhSq7Sbp45Gou` (coordinate source) and `dpl_8nV6qEsQ1oTcUkw7yT3z4MBM7o6f` (on-pitch camera recalibration) are READY, the latter at commit `db13db1` owning the stable `qa` alias. Vercel Observability reports no `/arena` runtime errors in the observed hour.
- **Boundary:** QA branch and QA deployment only. Production, `touchline.com.br`, Production Vercel configuration, Supabase QA/Production data, cards, contracts, prices, tiers, provider configuration, payments, credentials and DNS were not changed.

## 2026-08-18 Arena Quick Sub premium responsive HUD — QA DEPLOYED / VISUAL GREEN

- **Scope and cause:** native authenticated Safari confirmed that the original ten-column rail compressed the substitute hierarchy in short landscape and that the compact fixture rail could claim a second `Open Match Centre` row. A subsequent real `1280×720` Safari observation exposed a tenth substitute tile clipping at the right edge. This was presentation-only; the canonical 4-3-3 coordinates, 35-card scenario, contracts, tiers, prices, QA persona and database state were not changed.
- **Correction:** the in-Arena Quick Sub rail remains a single `4 + coach + 5` decision surface, with adaptive artwork/name sizing for compact landscape, an accessible close control, entry/exit motion respecting reduced-motion and a client-history close that keeps the Arena document and XI mounted. The compact fixture rail uses an accessible arrow-only Match Centre link to remain one row. The landscape compact rail now starts at `1366px`, so the real `1280×720` target keeps all ten tiles within the safe frame.
- **Interaction and accessibility proof:** native Safari showed 11 editable field controls, nine bench controls and Coach Unai Emery. Selecting a target applied the existing compatibility lock and disabled invalid bench choices; closing Quick Sub removed only `panel=bench` and restored the score rail without a document navigation. The Coach Unai Emery spotlight opened over the active Quick Sub and closed back to the same rail without losing selection. Card and coach controls remain semantic buttons with labels; reduced-motion is explicitly static. Gamepad/TV hardware was not present, so no claim is made for that optional input path.
- **Responsive and browser evidence:** native authenticated Safari passed 1440×900, 1280×720, 1024×768 and 844×390. Final 1280×720 evidence showed Patterson, Branthwaite, Acheampong, Vuskovic, the centered coach, Williams, Savona, Cardines, Echeverri and Armstrong fully visible in one row. Chromium (1280×720 and 1920×1080), WebKit and Firefox each reached the expected login boundary with HTTP 200, zero console/page errors and no horizontal overflow. The `agent-browser` CLI was unavailable in this host, so Playwright was used for those anonymous engine smokes; no browser-engine claim replaces authenticated Safari evidence.
- **Verification:** focused Quick Sub regression `18/18` PASS; full suite `1021/1021` PASS; TypeScript PASS; ESLint `0` errors with four pre-existing warnings; `git diff --check` PASS; local production build PASS; Code Verification and release governance PASS; Vercel release subset `993/993` PASS. Initial UI commit `33a10e1` deployed as `dpl_9sTXwoae1iuanoSR7FqvmcVTwPGN`; the observed 1280 correction `7474e2e` deployed as `dpl_AZaGsRg3QfQgt8pGegpF4EWsBwvC`, READY and owning the stable `qa` alias. Vercel Observability found no `/arena` runtime errors in the observed hour.
- **Boundary and decision:** QA branch/deployment only. Production, `touchline.com.br`, Production Vercel configuration, Supabase QA/Production data, cards, contracts, prices, tiers, provider configuration, payments, credentials and DNS were not changed. Block 3 is closed; do not begin Live work without a new explicit brief.

## 2026-08-20 raw football-data browser boundary — QA APPLIED / DEPLOY PENDING

- **Finding and scope:** direct browser roles could read the legacy raw-football tables `football_players`, `football_clubs`, `football_squad_members` and `football_seasons`. The public foundation diagnostic also risked becoming a broad raw-provider proxy. This closure is limited to the isolated QA project `xgxbwqxjssxxuihuwmgy`; it makes no claim about unrelated Supabase advisor findings or the whole repository.
- **Correction:** three forward-only, QA-applied migrations (`20260820055004`, `20260820060148`, `20260820061016`) force RLS, remove permissive policies, revoke `PUBLIC`/`anon`/`authenticated` table privileges, remove direct execution of legacy raw-table search trigger functions, and leave only the four required CRUD privileges to `service_role`. The source diagnostic is now owner-or-server-authenticated and maps explicit, purpose-specific allowlisted DTOs rather than passing raw rows through.
- **Direct QA proof:** before the correction, all four tables had `authenticated SELECT USING (true)` and broad browser-role grants. After it, every table has RLS enabled and forced, zero policies, no `anon` or `authenticated` select grant, and only `service_role` CRUD. Real QA negative queries confirmed `authenticated` player select, `anon` club select and `authenticated` raw trigger-function execute all fail with `42501`; a `service_role` read succeeds over the preserved 20 clubs, 621 players, 629 memberships and one season.
- **Consumer safety:** the existing stable QA deployment still returned `200` for the public squad (`30` players) and fixture-schedule safe contracts after the database boundary. The newly changed source passed focused boundary tests, the full suite `1065/1065`, TypeScript, build, lint with zero errors and the same five pre-existing warnings, release checks and `git diff --check`. Authenticated native-browser proof and a source deployment to the QA alias remain the next gate.
- **Rollback and boundary:** rollback is documented as a QA-only, reviewed forward migration that restores only the recorded prior grants/policies after a consumer failure; no data, provider configuration, credentials, Auth identity, Vercel environment, Production database, Production deployment, DNS or `touchline.com.br` state was changed.

## 2026-08-20 Tables / My Club authenticated resolution — QA DEPLOYED

- **404 cause and correction:** Tables used the generic `authenticated` navigation surface for every logged-in identity. This exposed the ClubOwner-only `/club-owner/me` link to the platform administrator; Next.js Link prefetch then produced the observed RSC 404s because the proxy correctly refuses to derive a ClubOwner slug for an admin. The shared navigation resolver now distinguishes public, admin-authenticated and authenticated-ClubOwner capabilities. The existing self route remains the canonical session-owned boundary and redirects the QA persona to `/club-owner/luiz-lopes`.
- **Zero-summary cause and correction:** Tables hard-coded `0` cards and `£0`, and derived the ClubOwner count from the intentionally empty competition leaderboard. The authenticated private summary now reports one resolved ClubOwner, all `35` active card contracts, and `£171` from the server-owned current public editorial card projection. No raw provider value, browser state or fabricated ranking is used.
- **Data-quality boundary:** `33` cards currently satisfy the complete public-card policy. Anthony Patterson (£1) and Rio Cardines (£0) remain tracked active contracts but their publication memberships are inactive, so they are excluded from effective public-card value rather than silently treated as valid. No Sportmonks, fixture, Matchweek, sync, publication or database write occurred.
- **Browser proof:** native authenticated Safari rendered `1 / 35 / £171`, exposed My Club, and resolved it to `/club-owner/luiz-lopes`. A clean Web Inspector reload contained no 404. Chromium passed 1440×900, 1024×768 and 844×390; WebKit and Firefox passed 1440×900 and 844×390, with HTTP 200, no horizontal overflow and no `/club-owner/me` 404. Anonymous self-route access redirected safely to login.
- **Verification and deployment:** focused tests `36/36`, full suite `1076/1076`, TypeScript, ESLint (`0` errors; five pre-existing warnings), production build (133 routes), release readiness and `git diff --check` passed. Commits `3d6279b` and `3b55b1d` were pushed only to `qa`; deployment `dpl_BkE3fN2JdQdyD4Kx1CmWGnVxHHWc` reached READY and owned the stable QA alias. Vercel Observability found no runtime errors for Tables/My Club in the observed hour.
- **Boundary:** Production, `touchline.com.br`, Production Vercel configuration, Supabase data, Sportmonks, fixtures, Matchweek, payments, credentials and DNS were not changed.

## 2026-08-20 Tables summary + analytics clean reload — QA VISUAL/RUNTIME CLOSED

- **Source and deployment:** product commit `738d7dbb526ed8141872c40ce62e503b29bc7913` was pushed only to `qa`; Vercel deployment `dpl_FNur7zPzJeWFyqvwpr8FmBxmxPH3` reached `READY`, and the stable QA alias was confirmed on that exact SHA.
- **Tables chain:** the authenticated QA persona resolved the canonical ClubOwner route `/club-owner/luiz-lopes`. The server-owned roster reader selected active contracts by the authenticated `user_id`, counted all `35` contracts, projected only currently published GBP editorial cards for value, and passed `1 / 35 / £171` through the Tables summary into the rendered UI. No summary value came from provider raw data, browser persistence or a fabricated ranking.
- **Clean Safari proof:** native Safari Console and Network were cleared before reload. Tables rendered `1` ClubOwner, `35` tracked cards and `£171`; My Club opened the authenticated Luiz Lopes area; Arena rendered after the same forward navigation. The clean Console contained zero new `403` and zero new `404`.
- **Analytics runtime proof:** deployment-scoped Vercel logs showed successful `POST /api/touchline-analytics` responses in each observed Tables, My Club and Arena window. A status-filtered query from the clean-run timestamp returned no `4xx` logs. The analytics origin/auth/RPC boundary, focused tests, full suite, TypeScript, ESLint, build, Security Diff Scan and independent Code Verification had already passed on the same product SHA.
- **Boundary:** this closing step changed documentation only. No Supabase row, Auth identity, Sportmonks data, fixture, Matchweek, card, contract, Vercel environment variable, Production deployment, DNS, payment or `touchline.com.br` state changed.

## 2026-08-20 premium Market metrics / Club Construction header — BLOCK 1 QA GREEN

- **Root cause and correction:** the Market header combined browser/session-derived roster counters, a redundant slot tile, legacy `Signing Balance` wording and a decorative `Enter Arena` progress step. Its value display could diverge from Tables. Product commit `232185ac7998775f717dbc13bdc287aa80e51cd5` introduces one server-owned commercial summary for active contracts and currently public GBP editorial prices, projects the distinct canonical club count from those contracts, and exposes only the allowlisted scalars required by the authenticated Market inventory DTO.
- **Authenticated result:** the canonical QA owner renders `TouchLine Credits 0`, `Squad card value £171`, `Active contracts 35/35` and `Clubs represented 14`. `Contract Slots` is removed without leaving a gap; the decorative `Enter Arena` step is removed while the real `Back to Arena` link remains functional. The value is derived from the same approved public presentation authority used by Tables and is not the raw provider valuation or a hard-coded QA total.
- **Technical verification:** focused Market/Tables/roster tests `51/51` PASS; complete suite `1091/1091` PASS; TypeScript PASS; ESLint `0` errors with five pre-existing warnings; `git diff --check` PASS; Next.js 16.2.11 production build PASS with `133/133` pages; release-readiness PASS; independent Code Verification PASS. Security Diff Scan `aa4b14f6-ddd4-4114-b527-401fd0b79a86` covered the authentication, server projection, DTO and UI diff and reported zero findings.
- **Deployment and visual proof:** commit `232185a` was pushed only to `qa`; native Vercel deployment `dpl_BcyshAWNsYUM3gFUiuG7U16WBeA8` reached READY and received the stable QA alias. Native authenticated Safari passed 1440x900, 1280x720, 1024x768 and 844x390. A clean Safari reload showed no console error and the inventory route returned HTTP 200. Chromium, Playwright WebKit and Firefox each passed the anonymous login boundary at desktop, tablet-landscape and phone-landscape with no page/console error or horizontal overflow. Vercel Observability showed no Market/runtime error during the observed window.
- **State and rollback boundary:** no contract, formation, starter, bench, remaining-squad, coach, card override, selection, ClubOwner, provider, Supabase, Vercel environment, Production deployment, DNS, payment or `touchline.com.br` state changed. Rollback is the reviewed revert of `232185a` pushed only to `qa`, followed by confirmation that the prior READY Preview deployment owns the stable alias. Block 2 may now begin; Blocks 2-10 were not implemented in this block.

## 2026-08-21 canonical programme addendum — REGISTERED / EXECUTION DEFERRED BY ORDER

- **Continuity:** the active Block 2 formation mission remains the sole implementation scope and is not interrupted or reopened by this registration.
- **Block 3 addition:** the Admin card overlay exposes `Edit in Card Engine` only to authorized Admin users and resolves directly to the exact player/card record. This is a fast path beside, never a replacement for, the complete Card Engine Inbox; ordinary users must not see it.
- **Block 4 addition:** every real incomplete player remains visible as the normal full TouchLine card in premium grayscale; the status/price area uses `PENDING` or `REVIEW PENDING`, never a player position. The Card Engine Inbox must name the exact missing required fields, approved overrides must survive provider sync, Admin receives an exact-record shortcut, and saving the final required field automatically produces the complete colour publication without an extra publish action when no conflict exists.
- **New Block 4B:** immediately after Block 4, implement one canonical coach-contract/history system with cancellation and replacement, one active coach at a time, no retroactive points, preserved prior history, a compact fixture-context Home or Away indicator, complete zoom/profile history, and versioned `coach_scoring_v1` rules: Home `3/1/0`, Away `4/2/0`. Final scoring must be Sportmonks-fixture-backed and idempotent; no result, contract or historical value may be invented or erased.
- **Final Live regression:** when a real official match is observable, record provider and TouchLine status times and latency; verify Scheduled→Live, minute/score and only the events that actually occur, Squad Preview→official Matchday Line-up, HT→Live→FT, archive persistence, Live/Arena agreement, and the premium last-verified-state fail-safe without invented data or duplicate reconciliation. Events not occurring in the observed match are reported `NOT OBSERVED IN THIS MATCH` rather than simulated.
- **Deployment state preservation:** final regression must prove `SAVE → NEW QA DEPLOYMENT → REFRESH → STATE PRESERVED` for an in-progress owner formation/squad/Market action. Interface code may change; canonical owner data must not disappear.
- **Release boundary:** Block 4 and 4B each require focused/full tests, TypeScript, ESLint, diff check, build, Code Verification, security/Supabase verification for writes, Preview QA deploy, native Safari and Chromium/WebKit/Firefox evidence, Observability and release preflight. Production remains explicitly excluded.
- **Precedence:** for every requirement explicitly covered by this addendum, this registered wording is the newest canonical product rule. Original programme order otherwise remains unchanged.

## 2026-08-21 formation switching inside Club Construction — BLOCK 2 QA GREEN

- **Root cause and correction:** the previous formation action could reuse positional arrays by index, coerce players into a new role, scroll the user from the pitch to Market, and hide an incomplete XI. Product commit `bd3b521fb5ac65eb9146ccf1f3e2426f4aa158bb` adds a pure canonical formation transition boundary, preserves role-compatible starters, moves overflow safely to reserves, exposes exact on-pitch vacancies and filters the local picker through the approved eligibility rules. The UI remains inside Club Construction and no longer calls the Market scroll target.
- **Authenticated functional proof:** native Safari exercised `4-3-3 → 4-4-2`: ten compatible starters remained, one forward moved to reserves, one midfielder vacancy was explicit, and the picker contained only midfielders. Choosing Claudio Echeverri completed `1/4/4/2`; Supabase recorded 11 starters and reload preserved them. The reverse transition exposed one forward vacancy, listed only attackers, and selecting Stefanos Tzimas completed `1/4/3/3`.
- **User-state preservation:** before interaction, the exact QA Arena row was captured read-only. After both transitions and the final reload, `user_id`, `formation_key`, every one of the 11 lineup objects, `coach_provider_id` and all saved formation/camera layouts matched the backup exactly; only the normal `updated_at` timestamp changed. Contracts remain `35`, and no coach, bench, remaining-squad, override, provider or publication data changed.
- **Responsive and browser proof:** authenticated native Safari passed 1440×900, 1280×720, tablet landscape 1024×768 and phone landscape 844×390, with the metrics, formation controls, field and technical area remaining coherent. Chromium, Playwright WebKit and Firefox each returned HTTP 200 at the expected anonymous login boundary in all four viewports, with meaningful content, no Next.js error overlay, no console error and no page error. Aborted speculative RSC prefetches and cancelled entry-video downloads were browser cancellations, not application failures.
- **Technical verification:** focused formation/Market tests `36/36` PASS; complete suite `1113/1113` PASS; TypeScript PASS; ESLint `0` errors with only pre-existing warnings; `git diff --check` PASS; Next.js production build PASS with 133 pages; React best-practices review and independent Code Verification PASS. Security Diff Scan `c0056ce5-db57-475c-8f4b-193c1c8732e1` covered every runtime file in the product snapshot and returned zero findings; its TAC advisory was unavailable and remained advisory, not a false PASS claim.
- **Deployment and observability:** `bd3b521` was pushed only to `qa`; Git-native Preview deployment `dpl_Diwv4o8hddCV375y1NefuJwquG7o` reached READY and the stable QA alias resolved to that exact SHA. Vercel reported no runtime-error clusters for Market or Arena state; every observed authenticated `GET`/`PUT /api/touchline-arena/state` returned 200, and the build error query returned only `Build Completed`. Five separate `touchline-analytics` 429 quota responses were the already-closed telemetry rate limit outside this formation boundary and did not produce a browser console/page error during the Block 2 flow.
- **Rollback and boundary:** rollback is the reviewed revert of `bd3b521` pushed only to `qa`; no Production deployment, Production database, DNS, payment, secret, Sportmonks fact or `touchline.com.br` state was touched. Block 3 may begin only after the separate documentation checkpoint owns the stable QA alias.

## 2026-08-21 shared card overlay and incomplete-card contract — BLOCKS 3–4 QA GREEN

- **Shared interaction:** the card zoom detail builder is now the single presentation boundary used by Arena, Market/Club Construction, Club Hub lineup and squad grid, ClubOwner profile, player profile and rankings. The overlay preserves its source page, exposes the complete card/profile details, and gives only the authenticated owner the exact-record `EDIT IN CARD ENGINE` shortcut. Native Safari proved that shortcut resolves Dermot Mee's canonical UUID and selects the matching Card Engine Inbox record.
- **Incomplete-card correction:** the full TouchLine card remains visible in premium grayscale when a real required field is missing. Its status/price slot now renders `CARD PRICE / PENDING`; the overlay renders `CARD STATUS / Review pending`, `CARD PRICE / Pending` and every canonical missing field instead of substituting position in the price slot or showing a generic square. Dermot Mee provided the real QA proof with shirt 45, NIR, Goalkeeper and only `Market Value` missing. No value, tier, price, publication or override was invented or written.
- **Responsive/browser proof:** authenticated native Safari passed desktop, tablet landscape and 844×390 phone landscape; the card, missing-field summary, close action and Admin shortcut remained reachable. Chromium, Playwright WebKit and Firefox each returned HTTP 200, rendered `CARD PRICE / PENDING`, `MISSING FIELD / Market Value` and `CARD STATUS / Review pending`, with zero console/page errors. Anonymous sessions correctly omitted the Admin shortcut.
- **Technical verification:** focused card-review/overlay tests `31/31` PASS; complete suite `1107/1107` PASS; TypeScript PASS; ESLint `0` errors with five pre-existing unrelated warnings; `git diff --check` PASS; production build PASS with 133 routes; governance/release verification PASS. Product commit `8348baff38025e11cb6e94ad43b649d61b1f6a74` was pushed only to `qa`; deployment `dpl_ECAKWupNJqnTrYn3Z6oWYaAt5zM8` reached READY and owns the stable QA alias. Deployment logs contained only HTTP 200 responses and no warning/error in the observed window.
- **Boundary and next action:** Production, Supabase data, contracts, values, publications, Sportmonks facts, credentials, payments, DNS and `touchline.com.br` were not changed. Blocks 3 and 4 are closed. Per the registered canonical addendum, the next and only implementation scope is Block 4B: coach contracts, cancellation/replacement history and versioned Home/Away scoring.

## 2026-08-21 premium coach card insights — BLOCK 4B VISUAL ADDENDUM QA GREEN

- **Coach visibility boundary:** product commit `f47925be5bdff97be0671114ee72762cc6c825f8` adds a canonical first-team coach panel to Club Hub without weakening the official matchday-sheet boundary. The coach card remains visible for the club while the separate technical area honestly reports `Awaiting official matchday sheet` until the provider supplies a complete XI, coach and nine-person bench.
- **Premium zoom and profile:** the shared coach-card zoom now shows the complete card before navigation, icon-led Home and Away records, W-D-L, context TouchLine Points, total TouchLine Points, discipline status, contract dates and the full-profile action. The authenticated QA owner resolved one active Unai Emery contract; the public browser matrix displayed dashes and `No TouchLine contract` instead of inventing points. The full profile uses the same icon-led performance component and preserves provider-backed classification evidence.
- **Native Safari proof:** the stable QA alias served deployment `dpl_3f6Qqaq5AnC8Qn1B3TP1Nm6WH3Jc` on the exact product SHA. Native authenticated Safari rendered the Aston Villa coach panel, opened the complete card zoom, displayed Home/Away W-D-L/TP, total points, cards and contract dates, then opened the full Unai Emery profile. A transient blank inspection was traced to an incomplete automated address-bar action; repeating the navigation through Safari's native Command-L path loaded the product normally and required no speculative code change.
- **Responsive browser proof:** Chromium, Playwright WebKit and Firefox each passed desktop 1280x900, tablet landscape 1024x768 and phone landscape 844x390. Every engine rendered the coach panel and complete zoom, exposed Home, Away and Total TouchLine Points, produced zero console errors, zero page errors, zero failing HTTP responses and zero horizontal overflow. Human screenshot inspection confirmed the card asset resolves after its intended reveal animation and that the short-landscape detail surface remains scrollable.
- **Technical and runtime gates:** focused/full verification, TypeScript, `git diff --check`, production build and Security Diff Scan passed on the product commit. Final `pnpm run verify:release` passed governance, TypeScript, ESLint with zero errors and five pre-existing unrelated warnings, `1106/1106` release tests, and returned `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL`. Vercel Observability showed `310` HTTP 200, `41` redirects, `12` HTTP 204 and `5` HTTP 304 in the observed hour, with no 4xx/5xx count and no runtime error cluster for the coach/club routes.
- **Queued Block 7 rule:** the owner requires all 20 Club Hub Squad Preview/timeline pitches to use the exact canonical formation coordinates approved in Market Transfer for the same formation and viewport. This is one shared-source correction, never twenty club-specific offsets, and is queued for Block 7 without altering the already approved Market positions during this coach delivery.
- **Boundary:** no Supabase row, coach contract, points history, fixture, provider fact, credential, payment, Production deployment, DNS or `touchline.com.br` state changed. Production was not touched. Remaining Block 4B cancellation/replacement lifecycle proof stays open; Block 7 implementation remains deferred by programme order.

## 2026-08-21 global 20-club player-position audit — QA READ-ONLY / MATERIAL DEFECT PROVED

- **Scope:** all other programme blocks were paused by owner order. The audit compared the live Sportmonks squad/player detailed-position relation, the isolated QA canonical player/membership rows and the actual Market bucket resolver for every current roster member of the 20 canonical clubs. The diagnostic is owner-only, `GET`-only, sanitized and contains no provider token or raw provider payload.
- **Coverage:** live provider rosters contain `581` memberships. Official `detailed_position_id` is present for `578`; Daniel Bentley (Coventry), Mohamed Belloumi (Hull) and Jocelin Ta Bi (Sunderland) remain `PENDING / DATA QUALITY` and were not assigned an invented exact role. The QA snapshot contains `580` active canonical memberships and zero persisted detailed position IDs. Provider-versus-canonical drift is three provider-only memberships and two canonical-only memberships.
- **Official availability:** the 578 detailed positions resolve to GK `68`, CB `104`, RB `49`, LB `45`, DM `43`, midfield `115`, winger/secondary-attacker `89` and centre-forward `65`. Every one of the 20 clubs has at least one RB, one LB and one DM. Therefore the reported inability to find full-backs or defensive midfielders is not caused by provider roster scarcity.
- **Root cause and impact:** the sync retained only broad `Goalkeeper/Defender/Midfielder/Attacker` labels and the Market compensated with two manual provider-ID lists. Those lists currently force `184` IDs to RB/LB. Against the live official detail, Market disagrees for `200/578` classified athletes: CF→attacker `65`, winger→RB `41`, winger→LB `37`, DM→midfield `43`, RB→CB `5`, RB→outfield `1`, LB→CB `2`, midfield→RB `3`, midfield→LB `2`, CB→outfield `1`. Estêvão (`37701999`) is Sportmonks `Right Wing` (`156`) but TouchLine forces `RB`.
- **Verification and deployment:** commits `ec6581c` and `848ebf1` were pushed only to `qa`; the final correction removed an unsupported bulk-filter assumption and instead requests the documented nested `player.position` and `player.detailedPosition` relations. Focused tests `13/13`, TypeScript, scoped ESLint, `git diff --check` and production build (133 routes) passed. Deployment `dpl_B5Zqu9oGmUJorrc72qtZUEkAVM8a` reached READY on the stable QA alias.
- **Decision and boundary:** the audit made no Supabase write and did not alter any athlete identity, exact position, contract, card, publication, formation or owner state. The safe follow-up is one global QA reconciliation with backup/rollback and idempotence: persist official detailed IDs, let approved TouchLine editorial overrides win, delete manual full-back guessing from resolution, preserve unresolved players as visible `Position pending review`, and validate exact-position selection. Production was not touched.

## 2026-08-21 QA Live real-time P0 — GREEN / CLOSED

- **Root cause and correction:** Live, Arena and Club Hub polled persisted fixture state, but QA had no recurring server writer after kickoff. Product commit `c15ad638a31349050d6aa85148809f4ac6d485d7` adds a protected QA-only Sportmonks sync boundary, adaptive cadence, status-regression protection, coherent canonical/public snapshots, minute/period/events projection and a Vault + pg_cron one-minute wake-up.
- **Canonical proof:** QA contains ten unique official fixtures. Fixture `19722203` is persisted as Arsenal FC `3–0` Coventry City, `Full Time`, minute `94:41`, with `14` provider events and its provider round. Schedule and fantasy-live DTOs each return HTTP `200`, the same ten unique IDs and the same target state. Repeated protected sync executions leave the unique count at ten.
- **Security and authorization:** `GET` on the command returns `405`; an unauthenticated `POST` returns `401`; the authorized scheduler returns `200`. The secret exists only in Vercel Preview branch `qa` and QA Vault and was never logged. Exact-commit Security Diff Scan `2e77b724-126b-4276-836a-63d87b346c08` returned zero findings.
- **Visual and runtime proof:** native authenticated Safari rendered ten fixtures, Matchweek 1 and Arsenal `3–0` Coventry at Full Time; Club Hub reflected the verified table result. Chromium desktop/tablet/phone-landscape, Playwright WebKit and Firefox rendered the same result with clean console/network. Deployment `dpl_5oZFyoKBthxjCzrXCnaRUqTPpAJh` is READY and owns the stable QA alias. Vercel recorded 24 scheduler `200` responses in the scoped window, no `5xx`, and no runtime-error cluster.
- **Technical gates and boundary:** focused `12/12`, full `1145/1145`, TypeScript, lint (zero errors/five pre-existing warnings), diff check, 134-route build and release verification (`1117/1117`) passed. The dirty Block 4A worktree and backup `9fb94339-d9ce-4925-9d3c-59ef9b0cfe0e` remained untouched. Production, `touchline.com.br`, Production Supabase, DNS and payments were not touched. Resume Block 4A from Security Diff Scan.

## 2026-08-22 P0B golden fixture settlement — QA DEPLOYED / AUTHENTICATED SAFARI FOLLOW-UP BLOCKED

- **Source and deployment:** commits `70f6105` (settled fixture reconciliation) and `cdcd2c2` (anonymous Live detail guard) were pushed only to `qa`. Preview deployment `dpl_9k2KhTfVwof4ikYFmfqmveuyecyv` reached `READY` and owns the stable QA alias.
- **Canonical data and idempotence:** two protected QA runs for official fixture `19722203` each returned success without errors. QA persists Arsenal FC `3–0` Coventry City as `Full Time`, minute `94:41`, with `14` canonical events and `40` final player-fixture rows. Goals, assists and yellow cards match the provider-backed settled events; duplicate/rescinded event protection remains in the canonical writer.
- **Public and browser evidence:** the Live detail fetch is now server-authorized and the anonymous client short-circuits before calling the protected endpoint. Chromium at 390 and 1280 pixels, Playwright WebKit and Firefox each rendered Live, Club Hub, standings and public cards with HTTP `200`, no console error, no protected-detail request and no horizontal overflow. Anonymous Arena redirected to login as intended. A public Bukayo Saka profile rendered in Chromium with official data.
- **Security and verification:** focused P0B tests `10/10`, full suite `1155/1155`, TypeScript, build and `git diff --check` passed. ESLint reported zero errors and five pre-existing warnings. Security Diff Scans `4b549e3d-4868-4444-b70f-32da578b9876` and `eec8067a-637b-4864-9100-59504ce744d8`, plus independent review, reported no findings.
- **20-club/Card Engine continuity:** the latest QA reconciliation run `c93c92ea-99dd-481c-a447-953b3dceccfe` is applied with 20 clubs, 581 provider players, 580 detailed positions and one `PENDING` provider omission; it is backed up and reversible. The Card Engine override table has no active position override, therefore there is no current conflict to enqueue. The product route and focused contract tests preserve the rule that any approved TouchLine override is final and provider conflicts are shown in Card Engine rather than overwrites.
- **Remaining blocker:** native Safari is running but the local computer-use controller returns `timeoutReached` before it exposes Safari's accessibility tree; it can read Finder normally. The active QA owner state remains present in QA (`4-3-3`, 11 lineup entries, coach, 35 active contracts), but it was not opened, altered or authenticated by this mission. This is `BLOCKED / EXTERNAL` pending restored Safari automation access or an already-open accessible QA owner session.
- **Boundary:** no Production deployment, Production database, credentials, DNS, payment, provider configuration, editorial value, tier, price, card, contract or user-state write occurred. Production remains untouched.

## 2026-08-22 dependency-security remediation and Safari continuation — QA CANDIDATE

- **Scope and source truth:** the requested `xlsx@0.18.5` High remediation was investigated first. `xlsx` is absent from every workspace manifest, the lockfile and the resolved dependency tree, so no ungrounded package change was made. A fresh audit instead identified vulnerable transitive patch releases in `brace-expansion` (`^1.1.0` and `^5.0.0`), `js-yaml@^4.0.0`, and `nanoid@^3.0.0`.
- **Correction:** the workspace overrides now resolve compatible patch releases only: `brace-expansion` `1.1.18` for the legacy minimatch path and `5.0.9` for minimatch 10, `js-yaml` `4.3.1` for the ESLint path, and `nanoid` `3.3.18` for the PostCSS path. The resulting lockfile changes are limited to those patch resolutions and pnpm peer-snapshot relinking; no application source, feature flag, credential, provider setting, database row or Production setting changed.
- **Security evidence:** fresh production and complete dependency audits both return zero vulnerabilities. The completed final Security Diff Scan `c518e1b3-2d4f-4655-a0be-3e62e6607ea8` reports zero findings, and a fresh independent diff review found no unresolved issue. The earlier intermediate scan finding is remediated by the final lockfile state, not hidden.
- **Technical gates:** full suite `1155/1155`, TypeScript, ESLint with zero errors and the same five existing warnings, 134-route build and `git diff --check` all passed on this candidate.
- **Browser continuation:** native Safari is now accessible and rendered public Arsenal Club Hub plus the existing-session Arena surface on the stable QA alias. The existing session is not the canonical QA owner: `/club-owner/me` presented the safe-navigation unavailable state. No login, credentials, cookies, user selection or persisted user data was changed. Native-Safari canonical owner checks for Arena, cards and profiles remain `BLOCKED / EXTERNAL` until a reusable canonical-owner session is already available. Chromium, Playwright WebKit and Firefox public route evidence remains green; WebKit is browser-engine evidence, not native Safari substitution.
- **Next executable gate and rollback:** commit the explicit workspace/lockfile/document manifest, push only to `qa`, wait for a Git-native Preview deployment, and smoke the stable QA alias before recording READY. If a P0 occurs, stop mutation and redeploy the prior verified QA SHA `41744856212aa8418aeb24a91e4dc3b0154a4b3f` through the official QA project; do not force-push. Production remains untouched.

## 2026-08-22 dependency-security remediation — QA DEPLOYED

- **Source and deployment:** commit `bbd122793ee0799058e0dc701c3872931b31bfc1` was pushed only to `qa` in a fast-forward. Git-native Preview deployment `dpl_9RGPTeRTcQGGExkHGf7ynFZN3UcE` reached `READY`, identifies branch `qa` and that exact commit, and owns `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- **Remote smoke and browser evidence:** the stable alias returned `200` for Live, Arsenal Club Hub, standings and rankings. Anonymous Arena followed its intended login boundary and ended `200` on the login surface. Firefox isolated-context checks found content, no framework overlay, no horizontal overflow, no console errors and no request failures on every route. Chromium and Playwright WebKit rendered the same routes with HTTP `200`, content, no overlay, no overflow and no console errors; navigation-time cancelled RSC/prefetch requests were then separated from application failures by the isolated Firefox pass. WebKit remains browser-engine evidence only and does not replace native Safari.
- **Observability and rollback:** scoped Preview runtime error/warning log query returned no events. The build log confirms the branch and exact SHA, governance PASS, release tests `1127/1127`, TypeScript and 134 static pages. The only build observations are the same five ESLint warnings and pre-existing Sentry source-map release-token warning; neither is a runtime error and neither was changed in this scope. Rollback remains the Git-native redeploy of prior verified QA SHA `41744856212aa8418aeb24a91e4dc3b0154a4b3f`; do not force-push. Production remains untouched.

## 2026-08-22 Arena saved-formation role recovery — QA DEPLOYED / NATIVE SAFARI VERIFIED

- **Observed defect and cause:** the canonical QA Arena row retained 11 player objects and both saved layout keys, but the saved 4-3-3 displayed defensive vacancies. The reload mapper in `inferArenaRole` recognized abbreviations (`LB`, `RB`, `RW`) but not the same official long-form positions (`Left Back`, `Right Back`, `Right Wing`) supplied by the stored card record. Rehydration classified those exact cards as midfielders and the automatic authenticated-state save preserved the wrong broad roles.
- **Correction scope:** commit `f9d5ebcb1afa818563e4d7883b585dbf1afb4735` extends the existing exact-label classifier to include left/right back and left/right wing, with a regression test for `Left Back`, `Right Back` and `Right Wing`. It does not infer a player from name, alter provider facts, create a replacement XI, change a card, contract, coach, formation key, visual layout or schema.
- **Verification and deploy:** focused `16/16`; full `1156/1156`; TypeScript; release-readiness; ESLint `0` errors/five existing warnings; diff check; local production build with 134 routes. The commit was pushed only to `qa`; Preview `dpl_5ATYVM16Nw9NUtx3LeuHMBL5sCCc` is READY and owns the stable QA alias.
- **Native QA evidence:** Safari loaded `/arena?skipIntro=1` without selecting a card or formation. It rendered the full saved XI, then the authoritative QA-state read showed `4-3-3`, 11 cards, roles `goalkeeper: 1`, `defender: 4`, `midfielder: 3`, `forward: 3`, coach `455907`, and preserved layout keys `4-3-3` / `4-4-2`.
- **Security note and boundary:** the standard Security Diff Scan capability preflight returned `ready`; the app-backed scanner rejected its own selected uncommitted patch as stale and returned no scan ID, so this entry does not claim a zero-finding security report. No Production URL, Vercel Production setting, Production Supabase data, credentials, payments, DNS or football/editorial value was changed.

## 2026-08-22 Block 4A Card Engine hardening — QA DEPLOYED / AUTHENTICATED SAFARI BLOCKED

- **Commit and deployment:** Card Engine hardening commit `7490344` was merged with the closed P0B QA line as `522c99e96d5f01479130e46811495ded6182339d` and pushed only to `qa`. Git-native Preview `dpl_5sm1NgngbhabhzWUkrx3FoZLNyjs` reached `READY`, owns the stable QA alias and identifies the exact `qa` SHA. No Production target was selected.
- **Security and authority:** the editor accepts bounded CSV/TSV only, removes browser-side SheetJS/XLSX parsing, applies a 260 KiB streaming request limit before privileged JSON parsing, and records both owner-only API methods in the route manifest. The earlier Card Engine Security Diff Scan completed with zero reportable findings; P0B's final scan and independent review remain preserved by the merge. The merged lockfile was frozen-install validated and `pnpm audit --json` reports zero advisories at every severity.
- **Technical gates:** clean-worktree release preflight passed frozen install, release-readiness, TypeScript, ESLint (zero errors/five existing warnings), focused combined contracts `12/12`, full suite `1161/1161`, diff check and build (135 pages). The merge preserved P0B exact-position coverage and inventories 57 pages and 59 API methods.
- **Remote evidence:** Chromium, Playwright WebKit and Firefox each rendered Live, Tables and player profile at 390×844, 768×1024 and 1280×720 with HTTP 200, meaningful content, no overflow and no framework overlay. Anonymous `/arena` and `/admin/card-engine` correctly terminated at login; no privileged endpoint was called. Deployment-scoped Vercel runtime observation reported no error cluster; status traffic was 200/307/204/206 only in the observed window.
- **QA data preservation:** a post-deployment read-only QA query confirms 581 active Sportmonks memberships across 20 clubs, 580 detailed positions, 35 active contracts and unchanged Card Engine audit evidence: two batch creations, one approval, one override publication, one market-value publication and one batch rollback. No roster, identity, contract, formation, card, profile or editorial record was written.
- **Remaining gate:** `SAFARI AUTHENTICATED: BLOCKED / EXTERNAL — sessão atual não é a persona QA canônica e a automação não pode validá-la sem alterar login/sessão.` No user switch, cookie deletion, credential request, session restart or fabricated PASS is permitted. This means Block 4A is not GREEN and the programme must not enter Block 4B yet. Production remains untouched.

## 2026-08-22 native Safari canonical-persona correction — READ-ONLY / ROUTE-TRANSITION FOLLOW-UP

- **Supersedes the prior persona assertion:** the user confirmed the already-open Safari session, and one safe canonical self-route observation resolved `/club-owner/me?lang=en-GB` to `/club-owner/luiz-lopez?lang=en-GB`. That is the canonical QA ClubOwner route. No login, account selection, cookie inspection/deletion, credential handling, session restart or user-data action occurred.
- **Observed blocker is different:** immediately after that navigation, native Safari stayed on the app-wide `TouchLine Arena` loading boundary for more than 15 seconds. The Preview recorded successful `200` requests for both `/club-owner/me` and `/club-owner/luiz-lopez`, with no matching runtime error. Fresh isolated Chromium, WebKit and Firefox loads of `/club-owner/luiz-lopez?lang=en-GB` each returned `200`, rendered the Luiz Lopez heading, had no loader, no page error and no horizontal overflow. The evidence isolates a native-Safari in-tab transition symptom; it does not indicate a login, route, profile or persisted-formation failure.
- **Safe stop point:** browser Back returned the address bar to the original `/arena?skipIntro=1&lang=en-GB` URL, but the global loader remained. No reload or further browser interaction was taken, and no Arena selection, saved formation, card, profile, contract, audit, roster or database state was changed. The authenticated Arena/cards/profiles Safari gate is pending recovery and **must not be marked PASS**. Production remains prohibited.

## 2026-08-22 bounded private-profile reads — QA DEPLOYED / SAFARI GATE STILL BLOCKED

- **Objective and exact scope:** remove an indefinite wait from the authenticated ClubOwner profile without weakening identity or data boundaries. Commit `0a4759935b2ea240e9f4797d016ecd8e20bbfda7` changes only `ClubOwnerProfileRenderer`, a generic server-read deadline helper, and its regression test. It bounds active-ranking, authoritative-roster and wallet `SELECT` reads at 8 seconds; successful values are retained, while rejection/timeout receives caller-selected fail-closed fallbacks. No query writes a roster, lineup, contract, wallet, card, audit record, profile, provider fact or Arena state.
- **Privacy/fail-closed proof:** an unavailable authoritative roster remains `null` and resolves to the existing `unavailable` empty-roster state; it never reaches cookie/demo fallback for an authenticated owner. Wallet fallback has no entries and yields zero balance. Both Security Diff Scan `5dd23e96-52e7-40ed-97b7-0f822ce711bd` and a fresh independent review found zero findings.
- **Verification:** release-readiness, TypeScript, ESLint with zero errors and five existing warnings, focused private-profile contracts `13/13`, full suite `1163/1163`, `git diff --check` and production build passed. The worktree was clean after the explicit three-file commit. The QA-only Git Preview `dpl_MrmAXgy4pfB8dP8Du3yVceEyFFFR` is `READY`, identifies the exact SHA, and owns the stable QA alias. Remote smoke returned HTTP `200` for Live, Tables, Arsenal Club Hub and the public owner profile.
- **Native Safari follow-up:** one ordinary reload of the already-open canonical-owner Safari tab on the new QA deployment was allowed solely to load the new bundle. It did not change login, account, cookies or user data. The tab nevertheless remained on the global loading boundary after 25 seconds. Deployment-scoped runtime logs had only HTTP `200` and no runtime error; hence this deadline patch is not claimed to resolve Safari. Chromium, Playwright WebKit and Firefox each rendered the public profile with HTTP `200`, the Luiz Lopez heading, no overlay, no console/page errors and no horizontal overflow. WebKit is not native Safari evidence.
- **State, rollback and next gate:** the canonical QA saved Arena state is preserved by the preceding verified evidence (`4-3-3`, 11 cards, `1/4/3/3`, coach `455907`, layouts `4-3-3` and `4-4-2`). Rollback, if the candidate causes a P0, is a reviewed revert of `0a47599` pushed only to `qa`, followed by redeployment of prior QA SHA `7c43a86`; never force-push. `SAFARI AUTHENTICATED` remains `BLOCKED / EXTERNAL`, not PASS. With Block 4A still not GREEN, Block 4B and later ordered blocks may not begin. Production was not touched.

## 2026-08-22 private avatar deadline follow-up — QA DEPLOYED / NO SAFARI RESOLUTION

- **Follow-up correction:** static inspection found an authenticated `users.avatar_url` read that occurred before the first deadline. Commit `de806dcc91b9b27953e88fbc7c923f2e4f392c1e` wraps that user-scoped read at the same 8-second deadline and projects only `{ data: avatar_url | null }`; timeout or rejection uses null, leaving identity derived only from the authenticated user and its existing metadata/default avatar. It does not use the admin client and has no write path.
- **Verification:** focused private-profile contracts `14/14`, complete suite `1164/1164`, TypeScript, scoped ESLint and diff check passed; the local production build generated 135 pages. Security configuration preflight was `ready`; fresh independent review found no finding. Preview `dpl_5qSNHTTsVc63T6ovAGq94AJDy1AQ` reached `READY` on branch `qa`, exact SHA `de806dc`.
- **Result and boundary:** the one Safari reload permitted because that Preview changed condition still left `/club-owner/luiz-lopes?lang=en-GB` on the global loader after 25 seconds. No login, account, cookies, selection, formation, card, profile, contract or database data changed. The evidence excludes the avatar query as the sole blocker; no unsafe identity fallback was introduced merely to force a visual PASS. The authenticated Safari Block 4A gate remains `BLOCKED / EXTERNAL`; all other safe evidence remains preserved and Block 4B does not begin. Production remains untouched.

## 2026-08-22 Block 4A native Safari recovery and saved-lineup correction — QA GREEN

- **Scope and supersession:** this entry supersedes the preceding Safari loader/`about:blank` checkpoint only for the now-accessible authenticated CUSTOMER QA session. The test used `jl_nenelopes10@hotmail.com` in its existing normal Safari window; no login, logout, account switch, credential action, cookie/storage action or data reset occurred. Production remained excluded.
- **Cause and minimal correction:** native Safari could keep the full-screen `app/loading.tsx` visual boundary over a navigation whose document, auth and private reads had completed. QA commit `eb84316` removes that route-wide visual cover. During the recovery test, a separate ClubOwner-profile display defect was confirmed: its “Starting XI” took the highest-ranked eleven cards rather than the saved Arena XI. QA commit `be0b9f2` reads only the same authenticated user's `touchline_user_arena_state.lineup`, resolves the stored `inventoryId` entries only against that user's authoritative roster, requires exactly 11 unique valid cards, and otherwise retains the pre-existing fail-closed presentation fallback. No source path writes user data.
- **Verification and assurance:** `be0b9f2` is pushed only to `origin/qa`; Preview `dpl_FPt4mGVhygnDD8JwJW9A9WVHs4cf` is `READY` and owns the stable QA alias. Focused tests `28/28` and the complete suite `1171/1171` passed, as did TypeScript, ESLint (`0` errors; five existing warnings), `git diff --check`, and the 136-page build. Security Diff Scan `87e23a93-70e6-467f-be88-aba1d845e6ae` and independent read-only review report zero findings.
- **Native Safari proof:** a new normal Safari tab at the QA profile rendered `VERIFIED PRIVATE AREA` with no global loader. The rendered Starting XI exactly matches the customer’s saved Arena lineup: Senne Lammens, Luca Netz, Matai Akinmboni, Nordi Mukiele, Nico O'Reilly, Eberechi Eze, Lewis Miley, Elliot Anderson, Amad Diallo, Callum Wilson and Stefanos Tzimas. The pre-existing Arena tab rendered those eleven editable cards; the Senne Lammens card overlay opened and closed without navigation or write.
- **Network, console and state preservation:** Web Inspector recorded `124` completed Arena resources, `1` redirect and a completed load in `5.34s`; the document, Supabase auth `user`, Arena `state` and fixture reads all completed, with no pending requests. The clean Console contained no errors or warnings. One authorized normal reload returned the rendered Arena in approximately 15 seconds, without white screen or infinite loading, and retained the same eleven cards. A subsequent QA read-only state query confirms `4-3-3`, eleven lineup entries and a coach assignment. The existing autosave updated only the row timestamp; it did not change formation, lineup, coach, contracts, cards or profile data.
- **Result and boundary:** `SAFARI AUTHENTICATED: PASS`; `BLOCO 4A: GREEN`. Customer evidence remains CUSTOMER QA-only; Admin has not been used as a substitute. Begin Block 4B from its first unclosed gate. Production Vercel, Production Supabase, production URLs, DNS, payments, credentials, contracts, card publication and editorial data were not touched.

## 2026-08-22 Block 4B coach contract lifecycle — QA GREEN

- **Real QA evidence, no synthetic replacement:** a read-only query against the canonical CUSTOMER QA owner confirms one `active` and one `ended` coach contract, all on `coach_scoring_v1`; the immutable event history contains two `hired` and one `cancelled` events. There are zero fixture-point rows for this owner, so the pass does not attribute invented outcomes or historical points. No coach, contract, fixture, provider or customer state was modified for this observation.
- **Contract/system proof:** focused coach scoring, coach contract and Arena coach-first coverage passed `36/36`. It demonstrates the authoritative server derives owner and canonical coach/club identity; browser requests are same-origin and payload-bounded; only one active contract is possible; hire/cancel are idempotent; the lifecycle and final fixture results are immutable; and a replacement cannot receive points before start or at/after its exclusive cancellation boundary. `coach_scoring_v1` remains the approved Home `3/1/0`, Away `4/2/0` contract.
- **Visual continuity:** the earlier native authenticated Safari proof of the compact Home/Away context, complete zoom/profile and preserved lifecycle remains green. It was not replayed because this closure made no code or visual change. The current native Safari session remains CUSTOMER QA and preserved.
- **Result and boundary:** `BLOCO 4B: GREEN`. No new cancellation, replacement, score settlement or data write was executed. Advance to Block 5's first unclosed visual gate; Production remains excluded.

## 2026-08-22 Block 5 cards, frames, crests and motion — native Safari QA evidence

- **Authorization held:** `/visual-qa/*` is intentionally `OWNER_ADMIN` protected. CUSTOMER QA navigation was redirected at the server boundary and was not given admin access. A separate Safari Private Browsing window was used for the admin-gated static fixtures; they contain no account, roster, provider, contract or persisted-layout data.
- **Rendered proof:** native Safari rendered `/visual-qa/card-value-states` with the published Radiant Gold player frame, Manchester City crest and `£15.00` approved card-price state, while review/draft remained neutral and unpublished. It rendered `/visual-qa/card-neon-trace` with both Player and Coach Radiant Gold cards using the shared crest/perimeter contract. A second observation after a full calm cycle retained the traces without a visual fallback.
- **Isolation and tests:** fixture text and source keep interaction, persistence and subscriptions disabled. The focused visual/card suite passed `45/45`, covering admin gate/static isolation, the editorial publication states, tier-neon identity, safe action zones, reduced-motion rules and public-card release boundaries. No user, card, contract, provider, or Production state changed.
- **Result and boundary:** `BLOCO 5: GREEN`. Native Safari evidence proves the approved frame/crest/motion contract only, while the CUSTOMER boundary remained intact and the static admin fixtures did not receive or change account or football data. Continue with the first unclosed Block 6 Market reconciliation gate; Production remains excluded.

## 2026-08-22 Block 6 Market/provider reconciliation — QA GREEN / read-only

- **Current Liverpool chain:** the provider-backed QA roster has `30` active Liverpool memberships. `29` have one matching published, available inventory card and one published TouchLine lifecycle record bound to that same current membership. Ronald Araújo (`469717`) is the single current member without an inventory/publication/value record; his official current membership and detailed `Centre Back` position remain visible. The public TouchLine squad DTO returns all `30`, presenting that record honestly as `REVIEW_REQUIRED` with only `market_value` missing, rather than omitting it or inventing a card/price.
- **Global lifecycle boundary:** read-only QA counts remain `581` active memberships and `580` detailed positions, with `527` published-and-available inventory cards and `563` published lifecycle records. The unmatched records are explicit review/publication scope, not hard deletes. The established atomic, owner-scoped market contract operations and reversible, idempotent roster reconciliation remain unchanged and no write was issued.
- **Result:** `BLOCO 6: GREEN`. The historical `29 vs 28` display discrepancy no longer reproduces as a hidden or stale-card condition. Advance to the queued canonical all-club Club Hub formation-coordinate work in Block 7; Production stays untouched.

## 2026-08-22 Block 7 canonical Club Hub formation geometry — QA GREEN

- **Product correction:** commit `1052ce9` centralises the pitch slot geometry in `lib/touchlineArena/pitch-layout.ts`. Both Market Transfer and Club Hub consume that pure shared source: the approved market coordinate lines remain `GK x=9`, defender `x=34`, midfield `x=61`, forward `x=88`, with evenly distributed y values. Club Hub no longer owns an older, offset 4-3-3 layout; valid stored formations use their own capacity map and invalid inputs fall back to `4-3-3`. This is a shared source, not twenty per-club adjustments.
- **Verification and security:** canonical-pitch, Club Hub lineup and transition coverage passed `20/20`; full suite `1171/1171`, TypeScript, ESLint (`0` errors; five existing warnings), `git diff --check` and a 136-page build passed. Exact-commit Security Diff Scan `936ed041-c39e-41bf-b0e8-7d2befbf7457` and independent read-only review of `da06cb0..1052ce9` found no reportable issue.
- **QA-only deployment and Safari proof:** Preview `dpl_FaLJifiY7BK9qL7F5b9aQ1JJa9SQ` is `READY` and owns the stable QA alias. Native Safari rendered the public Club Hub selector with all `20` club links, then Arsenal's Squad Preview at `FORMATION 4-3-3` with eleven player cards and Mikel Arteta as first-team coach. That route was visited from the separate pre-existing ADMIN QA private window for public-component smoke only; it did not read or alter customer data and does not replace CUSTOMER QA proof.
- **Result and boundary:** `BLOCO 7: GREEN`. No provider, contract, roster, card, editorial, credential, cookie, storage or Production action occurred. Continue with Block 8 localisation audit.

## 2026-08-22 Block 8 localisation audit — QA DEPLOYED / NATIVE SAFARI VISUAL GATE PENDING

- **Resolved scope:** `d7e020c` establishes `lib/touchlineArena/card-tier-names.ts` as the single source for the seven English/Portuguese tier names, and propagates the selected locale through editorial history and Football Data Admin dates. `0cedab3` extends the same normalized `en-GB | pt-BR` locale into every remaining affected Admin date, currency and TC formatter in the owner dashboard, Finance, Promotions and Market Value Admin. No row, role, query, route capability, mutating component or data authority changed.
- **Verification:** `43/43` focused affected tests, TypeScript, `git diff --check`, and local Next build `136/136` passed. ESLint is `0` errors with five existing warnings outside the change. Independent review found no finding. Exact diff Security Scan `89ddca42-addc-4869-bc0a-865ce46f0f1f` completed with full four-runtime-surface coverage and zero findings.
- **QA evidence:** commit `0cedab3` is pushed only to `qa`; Git Preview `dpl_GFPgiLXDNr67txPCAxcPQUipJhjU` is `READY` and owns the stable QA alias. Its own release suite is `1144/1144` PASS and its build generated `136/136` pages. The stable QA Club Hub returns HTTP `200` for both explicit approved locales.
- **Open native-browser evidence:** Computer Use was limited by the macOS lock screen before it could observe the existing Safari window. This is **`BLOCKED / EXTERNAL`** precisely at local Mac unlock, not at auth, application, QA deployment or code. The user must only unlock the existing Mac session; no login/logout/user switch/cookie or storage action is authorized. The Safari DOM, Console, Network, local state and visual rendering gates are deliberately not claimed. Production was not touched.

## 2026-08-22 Block 8 localisation and authenticated Arena startup — QA GREEN

- **Supersession and session boundary:** this replaces only the preceding Block-8 native-Safari visual blocker. The existing normal CUSTOMER QA Safari window for `jl_nenelopes10@hotmail.com` was used without a login, logout, user switch, credential action, cookie/storage action or reset. The separate private ADMIN QA window was not accessed. Production remained prohibited.
- **Cause and minimal code change:** the authenticated state route waited for the complete authoritative roster reconciliation, leaving a native Safari navigation needlessly vulnerable to a long private read. QA commit `b9f5788` applies a four-second deadline only to the GET roster read; timeout returns a private/no-store `503` carrying no partial state or demo data. Client startup stays on the existing owner-namespaced saved state and reconciliation remains available later. Commit `f76bb8a` localises shared known fixture status labels; `c05f505` changes only the corresponding structural test boundary.
- **Verification and review:** `1174/1174` complete tests passed, as did TypeScript, lint (zero errors/five existing warnings), 136-page build and `git diff --check`. The independent review of `f76bb8a..b9f5788` found no finding. The security scan for the runtime deadline diff completed with zero findings. QA Git Preview `dpl_5jGVTQfJbRmHBqUTZCAXb2ALYkSX` is `READY`, points at exact SHA `c05f5054848dca677640c07650f4b8a9652291f8`, and owns the stable QA alias.
- **Native Safari evidence:** the actual CUSTOMER QA Arena at `?lang=pt-BR` rendered no global loader, all eleven editable cards, Portuguese ARIA/UI values `Jogadores de linha editáveis`, `Inglaterra Liga`, `BRE vs TOT 2º tempo` and `Abrir central da partida`. A non-mutating Senne Lammens overlay opened and closed. Returning to `?lang=en-GB` retained the identical eleven-card selection and showed the expected English equivalents. This builds on the preceding preserved read-only state proof of `4-3-3`, eleven entries and an assigned coach; no user, provider, contract, roster, card or editorial write was issued.
- **Result:** `BLOCO 8: GREEN`. No canonical definition for Blocks 9–10 exists in the ledger or the supplied original programme, so they are not fabricated. The next defined executable work is the final-regression matrix; its exact-deployment native-Safari Console/Network observation remains to be freshly captured before a whole-program final PASS can be claimed.

## 2026-08-23 Score Engine V3 ranking coverage closure — QA GREEN / PUBLISHED

- **Evidence and classification:** the seven originally blocking V3 appearances were inspected against their persisted Sportmonks final lineup payload and canonical mapped player ID. Every one is an exact mapped substitute appearance with a provider payload and minutes, but no rating field: Fabian Schär (19722195, 1'), Ben Gannon-Doak (19722196, 1'), Alejandro Garnacho and Malick Yalcouyé (19722197, 4'), Destiny Udogie (19722198, 4'), Arnaud Kalimuendo (19722199, 1') and Carlos Alcaraz (19722201, 1'). Classification is `D` for all seven: official provider rating genuinely absent. A/B/C recovered cases: `0`; E cases: `0`.
- **Canonical handling:** QA commit `76a9288` updates only V3 ranking eligibility. An exact provider-confirmed final appearance without Sportmonks rating remains a visibly audited `complete_for_scoring` fact, but receives no invented rating, no zero-point settlement and no V2 fallback. Its season total remains unavailable rather than fabricated, and it is excluded from the V3 ranking payload. The completed Score Engine V3 formula, V3 settlements, Card, Zoom, Profile and V2 audit history were not modified.
- **Publication and database proof:** the protected QA rebuild completed with `partial_v3_aggregates=0` and `ranking_unavailable=0`. The active snapshot is `player-v3:1e83121b-b778-459b-b9a0-7cf1eaff5729:2beb347d`, `player_scoring_v3`, `complete_for_scoring`, `312` players and `284` total points, published `2026-08-23T20:49:39.841Z`. Jack Hinshelwood provides a direct audited sample: Sportmonks rating `8.94` → V3 settlement `7`; season aggregate/Card/Zoom/Profile `7`; ranking payload `7`.
- **Public-surface correction and native Safari CUSTOMER:** the published snapshot was initially hidden by a build-time preseason render. QA commit `25c9a6f` makes only `/touchline-player-card-rankings` dynamic so publication is read live; it changes no scoring behavior. Preview `dpl_2j87vJBUbaPT3wsaME64HbQaEy7N` is READY on the stable `qa` alias. Native Safari CUSTOMER then showed `312` cards, `284` points, `TouchLine Points live order`, Top 20 (Jack #1) and Zoom fields `Rating 8.94`, `Match points 7`, `Sportmonks rating 8.94 · 1 × +7 = +7`. The linked Profile showed cumulative points `7`, current match points `7`, rating `8.94` and the complete current-season statistics/history.

## 2026-08-23 Cumulative Sportmonks rating backfill — QA GREEN / PUBLISHED

- **Scope and canonical rule:** QA commits `a842530` and `3133a86` extend the existing `football_player_season_statistics` V3 aggregate; no second scoring, fixture, or ranking system was created. Each persisted final fixture is evaluated by canonical `(football_player_id, fixture_id)`: a starter or substitute with minutes greater than zero and a valid Sportmonks rating contributes to immutable match history and `totalRating`; bench-only rows and official provider-absent ratings remain absent rather than becoming zero.
- **Protected QA execution and database proof:** owner-authenticated ADMIN QA rebuild populated the aggregate from all persisted fixtures. Independent SQL audit returned 278 players with eligible appearances, 271 players with valid ratings, 271 player-match ratings backfilled, 271 cards with accumulated rating, 7 true provider-missing ratings, 0 duplicate player/fixture pairs and 0 numeric mismatches between fixture-rating sums and stored aggregate values. Starter sample Abdukodir Khusanov: 90 minutes, `6.95` fixture rating, stored total `6.95`; entered-substitute sample Aaron Hickey: 14 minutes, `6.30` fixture rating, stored total `6.30`.
- **Cross-surface publication:** rebuild published `player-v3:1e83121b-b778-459b-b9a0-7cf1eaff5729:6462744f` at `2026-08-23T21:45:10.121Z`. Its 312-player ranking payload contains 247 applicable `totalRating` values and has 0 ranking-to-canonical-aggregate mismatches. Native Safari CUSTOMER showed Top 20, Card, Zoom, Profile and Ranking on the stable QA alias. Jack Hinshelwood proves the visible contract: Card `TOTAL RATING 8.94`; Zoom rating `8.94` and V3 match points `7`; Profile total rating `8.94`, one rated appearance and history rating `8.94`; Ranking `7 pts / Total rating 8.94`.
- **Future path:** all future official fixture syncs call the same idempotent season-statistics aggregate rebuild, then publish the same V3 ranking read model. V3 TouchLine Points and the V2 audit history are unchanged; cumulative Sportmonks rating is an additional persisted read-model statistic only.
- **Verification and boundary:** focused regression tests 36/36, TypeScript and scoped ESLint passed. Production source, deployment, Supabase, credentials and data were not accessed or changed.

## 2026-08-24 Club Hub premium matchday, confrontation and table — QA GREEN

- **Scope and source of truth:** commits `418f0fc`, `c8dd778` and `ba2be55` reuse the existing official lineup/live-score and canonical standings sources. They remove the Club Hub shop/partner board and the separate coach showcase; the existing compact coach card is now in the technical area and eagerly reveals only its immediately visible Safari assets. No parallel lineup, scoring, ranking, provider, table or card system was introduced.
- **Rendered behaviour:** the squad preview now owns its compact `CONFRONTO` panel, including the persisted/current live score and fixture state, with formation kept separately below it. Eleven actual player cards render on the pitch; the technical area renders Mikel Arteta’s card plus a rail of nine real available-squad cards. Before the full official sheet arrives, the UI labels those cards as a preview; after it arrives, the existing canonical official XI/bench projection replaces it on the next 45-second live refresh.
- **Presentation integrity:** public copy uses TouchLine / Nota TouchLine and no public Club Hub, ranking or profile label names the data provider. The old long preview claim is replaced by `A prévia pode mudar até a escalação oficial TouchLine ser confirmada.` The official table has continuous display positions `1…20`; shared sporting ties remain audit facts but no longer produce `2=` or `4=` in the public rank cell. This follows the Premier League in-season convention of deterministic vertical display alongside separate official tie criteria.
- **Evidence:** focused `37/37`, complete `1275/1275`, TypeScript, ESLint (`0` errors; six existing unrelated warnings), `git diff --check` and a 136-route local build passed. QA Preview `https://touchline-arena-official-fbzjkjwc6-fifa-agent-plataform.vercel.app` for `ba2be55` is READY. Native Safari rendered the exact URL with all requested cards and no visual blank coach. Chromium phone 390px, Playwright WebKit desktop and Firefox desktop returned `200`, had no horizontal overflow or console errors, and contained neither the removed shop/partner copy, public provider text, nor tied rank glyphs. Analytics writes were blocked during automated reads. Production was not touched.

## 2026-08-24 all-club Card Rating parity — QA DEPLOYED / PUBLIC UI GREEN

- **Correction:** commits `3f9aab9`, `bc4d041` and `74422d6` complete the existing public Club Hub season adapter. It now carries the immutable V3 `totalRating` through to the shared card card while preserving real stats. If the current-season marker is in transition, it uses the already-published, audited `player_scoring_v3` snapshot; it does not calculate a new score, summon V2, materialize a zero, or write any database state.
- **Twenty-club evidence:** on exact QA Preview `https://touchline-arena-official-dt58c8oyd-fifa-agent-plataform.vercel.app`, automated desktop rendering expanded the cards on every Club Hub. Result: `20/20` HTTP 200 routes; `529` rendered player-card roots; `276` valid cumulative ratings; `0` invisible cards; `0` broken images; `0` horizontal overflows; `0` console errors. Cards without an eligible valid provider rating retain the product's unavailable display rather than a fabricated value.
- **Shared-surface proof:** Martin Ødegaard is `8.08` in Arsenal Club Hub, Player Card, open Zoom and the live Top 20 ranking. The Zoom dialog supplied the same total and match history. Arena's server presentation maps only `seasonTotalRating` and `matchRating` into the shared exact card/zoom, with legacy points excluded from that path.
- **Verification and boundary:** focused `22/22`, complete `1275/1275`, TypeScript, local build, diff check and Vercel's Preview release verification passed. The Mac re-locked before a fresh native-Safari Arena observation of this exact deployment; no login, account, cookie, stored formation or data was changed to bypass that boundary. Production remains untouched.

## 2026-08-24 Arena Card Rating parity — QA DEPLOYED / FIXED

- **Real Safari finding:** the preserved authenticated QA Arena rendered Senne Lammens' Performance rating `6.36`, but the card and its detail panel still showed `TOTAL RATING —`. This was a projection failure, not a missing provider datum, and it was observed without an Arena write.
- **Correction:** commit `8891fa0` makes the existing authoritative private-roster reader use the same immutable, published `player_scoring_v3` total-rating snapshot when the technical `is_current` season marker has not yet exposed its aggregate row. It retains null for genuine provider absence. There is no rating/points formula change, no V2 fallback, no new system and no database mutation.
- **Verification and deployment:** exact Preview `https://touchline-arena-official-42m0fm2lq-fifa-agent-plataform.vercel.app` is READY. Focused `51/51`, complete `1276/1276`, TypeScript, local build, diff check and Vercel release verification passed. The current public Arsenal smoke still exposes 16 rated cards including Martin Ødegaard `8.08`, with zero console errors. The old authenticated Safari tab is isolated to its prior Preview hostname; the new Preview correctly redirects an unauthenticated new-host tab to login, and no credentials were entered to bypass that security boundary. Production remains untouched.
## 2026-08-25 Premium Player Zoom redesign — QA GREEN

- **Scope:** commit `24345a4` changes the shared Player Zoom presentation, not the data system. It preserves the existing cumulative TouchLine Rating, last-match rating, position-aware verified facts, card art, dialog primitive and 15%-smaller Zoom-card scale. It explicitly excludes TouchLine Points, V2, V3 formula/settlements, provider mapping, ranking calculations, Card Engine, database writes and Production.
- **Interaction and accessibility:** total rating is the performance hero; last-match rating is contextual; compact performance is bounded to six verified outfield facts or five goalkeeper facts. The rest of the stat tree and full match history are conditionally rendered only after the labelled, keyboard-accessible `Ver desempenho completo` / `View full performance` control. The shared Escape, focus trap, return-focus and background isolation contracts remain in force. Semantic Lucide SVGs replace UI emojis and `prefers-reduced-motion` disables the expand-chevron transition.
- **Evidence:** focused zoom model contracts `14/14`; focused zoom/dialog/identity regression set `48/48`; TypeScript, ESLint (zero errors; six pre-existing unrelated warnings), `git diff --check` and local Next production build (`136/136` routes) passed. Chromium, Firefox and Playwright WebKit rendered the QA fixture at `1440×1040`, `820×1180` and `390×844`, all without horizontal overflow. Native Safari was observed only in its own previous-host crash banner state; no session-changing workaround was used.
- **QA deployment:** Preview `dpl_J5JuhQwfuKfQJvE99WkWYoZxL417` at `https://touchline-arena-official-dfoveonx6-fifa-agent-plataform.vercel.app` is `READY`; it contains product commit `bafeb55`. Remote public smoke opened the redesigned Zoom for Noni Madueke (`6.93`) and Maxim De Cuyper (`8.21`): each had six compact stats, the explicit last-match context, the full-performance action and zero horizontal overflow. Native Safari was navigated only to the public QA route without state-changing actions but stayed blank after its existing crash-banner state, so it remains unavailable rather than PASS. Production was not touched.

## 2026-08-25 Player Card master audit — QA CODE/DATA/REMOTE GREEN; NATIVE SAFARI EXTERNAL BLOCKER

- **Confirmed causes and fixes:** QA commit `e0e9ca6f` isolates the public Club Hub adapter to `player_scoring_v3`, preventing preserved V2 audit aggregates from winning an unspecified database row order. It also converts the recurring player-statistics persistence from per-membership/per-fixture sequential writes to three versioned idempotent batches, fails closed after an aggregate-batch failure, recovers stale QA-only live-sync runs before a new execution and writes a privacy-safe structured completion summary. It leaves rating formula, provider facts, V2 history, player/card identity, editorial overrides and Production unchanged.
- **QA database/ingestion proof:** direct reads from QA project `xgxbwqxjssxxuihuwmgy` report `392` V3 settlement rows and `0` duplicate versioned fixture keys: `220` started / rated, `89` substitute appearances of which `82` are rated and `7` are genuine provider omissions, plus `83` unused bench records. The seven low-minute substitute omissions remain `rating = null` with `sportmonks-rating` missing evidence; no zero or fallback is made. The first post-deploy automatic runs completed successfully, persisted `392` player fixture rows and converted every stale `running` record to the explicit QA recovery state; active stale-run count is `0`.
- **Cross-surface/remote evidence:** the stable QA alias points to `dpl_8UWqSWyKMY3VapFfczKUBDEvu47E` (`READY`). Chromium, WebKit and Firefox each returned `200` on Arsenal Club Hub, Noni Madueke Profile and Ranking, with shared-card Zoom open/close keyboard operation and no overflow. Martin Ødegaard has `8.08` on the canonical card, Profile, expanded Zoom (including full history) and live ranking. Chromium phone `390×844` retained focus within the opened dialog and had no horizontal overflow. A first Firefox batch warning for an Arsenal WebP was reproduced as neither decoding nor delivery failure in the isolated test; the subsequent Firefox Club Hub/Zoom run was clean, so no unsupported asset change was made.
- **Quality/security:** focused `31/31`, full `1278/1278`, TypeScript, ESLint (zero errors; six pre-existing warnings), `git diff --check`, local production build and `verify:release` passed. Security Diff Scan `7197d2cc-2799-4f5d-b960-0c8bab930e9f` covered all three runtime files and found zero reportable issues. The audit-created `caffeinate -dimsu -t 25200` process ended naturally.
- **Native Safari:** Computer Use did not access Safari because macOS was locked before the app could be inspected. No login, logout, account switch, cookie/storage operation, credential action or data mutation occurred. This remains `BLOCKED / EXTERNAL` until the existing Mac session is manually unlocked; it does not authorize any browser-session workaround. Production was not touched.

## 2026-08-25 Player Card master audit final native-Safari gate — QA GREEN

- **Only regression found and corrected:** native Safari initially proved Ben White's Profile/current fixture Rating as `7.74`, while the Club Hub Zoom showed `Last match rating: —`. The selected fixture row already contained the correct provider Rating; `applyTouchlineMatchdayPoints` copied it into `matchStats.rating` but not the shared card's `matchRating`. Commit `622161451c0c962ba7fb1e85a867b2daa93178c8` now forwards that same nullable persisted field. It never derives a Rating from stats, legacy points or zero and changes no formula, settlement, V2 audit row, identity, database record or Production surface.
- **Verification and QA deployment:** the new regression assertion failed before the implementation (`null !== 8.21`) and passed after it. Focused shared-card/Zoom/lineup/identity coverage passed `68/68`; complete suite `1278/1278`, TypeScript, ESLint (`0` errors; six established unrelated warnings), `git diff --check`, release-readiness, mission governance and the 136-route build passed. The exact source commit was pushed only to `qa`; Preview `dpl_PzLzCzxyx2eH5ZSv9V49iNJNFRPN` reached `READY` on the stable QA alias. Deployment-scoped error and HTTP `500` log queries returned no events.
- **Native Safari CUSTOMER evidence:** the existing CUSTOMER session was preserved without login/logout, account switch, cookie/storage action or data write. Arsenal Club Hub rendered `4-3-3`, eleven pitch starters, Mikel Arteta and nine bench cards. Ben White was `7.74` in card, Zoom, Profile, current fixture, match history and Ranking #15; the Zoom now also reports `Last match rating: 7.74`, goals `0`, assists `1`, DEF `1`, clean sheets `1`, and no legacy TouchLine Points. Ranking rendered all Top 20 and reopened the same Ben White card at `7.74`.
- **Arena and Club Owner:** Arena rendered the CUSTOMER's current incomplete ten-card saved state without changing it; its recovery panel explicitly retained the club safely and requested completion rather than inventing an eleventh. Senne Lammens rendered as goalkeeper at `6.36`, and the same canonical Profile confirmed Manchester United, shirt `1`, one start, match Rating `6.36` and Total Rating `6.36`. `/club-owner/me` resolved inside the same authenticated session, rendered the owner portrait and card crests, and opened João Pedro's correct Chelsea card/Zoom at `8.21`; Ranking also shows João Pedro at `8.21`.
- **Final visual result and boundary:** no white screen, infinite loading, broken image, relevant horizontal overflow or obvious visual regression appeared in Club Hub, Zoom, Profile, Ranking, Arena or Club Owner. `SAFARI CUSTOMER: PASS`; `FINAL DEEP REGRESSION: GREEN`. Production was not touched.

## 2026-08-25 Market account header and Training Center retirement — QA GREEN

- **Correction:** commit `1ff7789` reuses the existing authenticated Market inventory API and parser. A single transient read can no longer pin the account header to dashes until a full page reload: only retryable transport/status failures receive two bounded retries, while authorization and validation failures still fail closed. The four values remain entirely server-authoritative; no fallback or hard-coded account total was added.
- **Surface retirement:** the standalone Market no longer exposes a Training Center navigation slot, ClubOwner no longer renders the separate Training Center article, the audit catalogue no longer advertises that route, and EN/PT Training Center labels were removed. Formation, Starting XI, nine-player bench, remaining squad, saved state and the existing Quick Substitution action were deliberately preserved in this block.
- **QA proof:** Preview `dpl_DJjof6uc9KCUcN5moVbTA8UM9M5K`, exact source `1ff7789`, reached `READY` and owns the stable QA alias. In the preserved native Safari CUSTOMER session, two ordinary reloads rendered Credits `0`, Squad value `£171`, Active contracts `35/35` and Clubs represented `14`; Credits and Squad value use the same yellow. The visible Market links are Profile, ClubHub and Rankings. ClubOwner contains no Training Center area or copy. Market and inventory requests returned HTTP `200`; no validation error-level event was recorded.
- **Verification:** focused `88/88`; remote release `1254/1254`; TypeScript; ESLint with zero errors; mission governance; release-readiness; `git diff --check`; and the 136-route Next build passed. No QA data was changed. Production was not touched.
- **Explicit next-block queue:** remove Quick Substitution everywhere, including its rules and obsolete routes, only in the next authorised block. Also prototype the shared compact Market/line-up orientation so the card tip faces the goalkeeper/goal while number, name and rating/points remain upright; validate readability and collision spacing on one formation before applying the system globally. Neither queued change is part of `1ff7789`.

## 2026-08-25 Attack-facing compact pitch cards — QA GREEN / NATIVE SAFARI CUSTOMER

- **Exact scope:** product commits `adbc9c4ad55bd58b4415961bc993d45c53b0619b` and `32dc22208f9f0589f404a0f0d1a796215489bce0` introduce one shared `TouchlineGoalFacingPitchCard` presentation wrapper used only by the Market Starting XI and Club Hub line-up. The canonical compact card rotates `90deg` clockwise so its tip faces the right-hand attacking goal. The floating `[data-arena-match-rating="true"]` element counter-rotates `-90deg`, keeping only the Rating horizontal. Player nameplates remain outside the rotated wrapper, and the Zoom portal remains outside it, so the full card opens unchanged and upright.
- **No system/data change:** the wrapper reuses the existing canonical card and Zoom components. It does not alter Rating, V3/V2 scoring, stats, card publication, identity, formation coordinates, lineup selection, bench/squad composition, contracts, roster, account totals, database state or Production. Bench, remaining-squad and Market catalogue cards remain upright. Quick Substitution was not changed in this block.
- **Verification:** the new orientation contract failed before the wrapper existed and then passed. The combined card-orientation, Market, Club Hub, formation-geometry and responsive-neon suite passed `68/68`; `git diff --check`, governance and release-readiness passed locally. Git-native Preview `dpl_HiF1NTveUL8Ci6xtQrKz3fxqZ3Eo` is `READY`, branch `qa`, exact SHA `32dc22208f9f0589f404a0f0d1a796215489bce0`, on the stable QA alias. Its remote release pipeline passed TypeScript, ESLint with zero errors/seven established warnings, `1241/1241` tests and all `136/136` generated routes.
- **Native Safari evidence:** the existing CUSTOMER session was preserved. After one ordinary QA refresh, the Market pitch rendered the compact cards with the tip to the right. Arsenal Club Hub rendered the same right-facing geometry, external names upright and verified Ratings horizontal at the card head, including Ben White `7.74`, Bukayo Saka `7.71`, Cristhian Mosquera `6.89`, Declan Rice `7.08` and Eberechi Eze `6.62`. Opening Ben White from the rotated line-up rendered the original upright full-card Zoom with Total Rating and Last match rating both `7.74`; opening Eberechi Eze from Market likewise left the Zoom upright. Both dialogs were closed without a write.
- **Observability and rollback:** exact-deployment logs record HTTP `200` for `/market-transfer`, `/touchline-clubs/arsenal`, Market inventory, roster and state. The observed `503` entries belong only to the existing fixture-schedule boundary, and `429` entries belong only to analytics rate limiting. Rollback is a reviewed revert of `32dc222` and `adbc9c4` pushed only to `qa`; never force-push. Production was not touched.

## 2026-08-25 Fantasy Gameweek V1 — QA GREEN / NATIVE SAFARI CUSTOMER

- **Commercial and entitlement model:** product commit `288deb9d5a16a33214a67b94090ce062e6ff2e67` adds one server-owned `fantasy_access` entitlement and dedicated Stripe Test Mode boundary for a GBP `29.90` monthly subscription. No per-card purchase is used by `/fantasy`; historical card purchases, contracts and finance rows remain intact. The route and all four Fantasy APIs require authentication, and entitlement decisions are made server-side.
- **Gameweek and scoring:** fixture-backed canonical states are `UPCOMING → MARKET_OPEN → LOCKED → LIVE → FINAL → SETTLED`. A subscriber selects exactly eleven players in an existing calibrated formation, with unlimited pre-lock edits, auto-carry draft, €350m budget and maximum three players per real club; the snapshot becomes immutable 90 minutes before the first fixture. Rating is the only base score. Three or more confirmed goals applies one `2×` multiplier per fixture; DNP and missing provider Rating retain null Rating and contribute zero; double Gameweeks sum each valid fixture.
- **QA data evidence:** Gameweek `6138d361-ce4b-459c-94de-facc95565b66` is settled with `392` canonical player-fixture rows, `302` rated appearances, `7` provider omissions, `83` DNP, `0` duplicates and `0` formula mismatches. Reconciliation is idempotent. A real transactional probe rejected ten players, accepted/reconfirmed eleven without duplication and denied a post-lock edit, then removed the probe state. The canonical CUSTOMER has a time-bounded QA grant through `2026-09-24`.
- **Budget evidence:** all `532` published, valued catalogue cards were evaluated across the canonical formations and three-per-club rule. Exact minimum valid XI is `€5.05m`; 50,000 constrained simulations produced P25 `€203.5m`, median `€249.5m`, P75 `€300.5m`, P90/star-heavy `€351.4m` and P95 `€385.8m`; exact maximum is `€1.105bn`. The centrally configured €350m cap is retained because it allows a star-heavy side only with trade-offs and blocks the unconstrained maximum team.
- **Card and UX:** the shared Player Card label/value is `Market Value`, never a Fantasy purchase price, while existing tier, border and card art are unchanged. The premium Fantasy surface contains the XI pitch, all calibrated formation controls, budget/deadline/club-limit context, 532-card market, explicit confirmation actions, Rating-only rules and separate Gameweek/season rankings. Native Safari CUSTOMER rendered the settled Gameweek without changing account data and opened Adam Smith's upright Zoom at Total Rating `6.38` / Market Value `€300K`.
- **Security and database:** ten tables are RLS-enabled with zero browser grants; all mutations are service-only. Unique constraints cover entitlement, Gameweek, user Gameweek, locked player, fixture score and audit idempotency. Webhook events are monotonic under an advisory lock, and public manager rankings expose only rank/name/score/current-manager state. The completed Security Diff Scan has no unresolved P0/P1. The QA-only additive `touchline_fantasy_fk_indexes` migration cleared all new unindexed-foreign-key advisor notices; deliberate RLS-without-policy and newly unused-index notices remain informational.
- **Quality and browser evidence:** focused `9/9`, complete `1293/1293`, TypeScript, ESLint (`0` errors; `7` established warnings), release governance/readiness, diff check and Next build passed. Stable-QA anonymous boundary tests passed Chromium `390/768/1280/1440`, WebKit `1280`, Firefox `1280` and reduced-motion with no overflow, page error or server `5xx`. In-app browser independently confirmed the login redirect and return path. Vercel deployment `dpl_EVTwhHhxWsKi3R5jL1SvrkCYS6iC` is READY for product SHA `288deb9`; deployment-scoped runtime errors are empty and the Fantasy page/state API return `200` for CUSTOMER traffic.
- **Open external billing configuration:** the Preview environment has no dedicated `TOUCHLINE_STRIPE_MODE`, test secret, Fantasy monthly Price ID or Fantasy webhook secret. The implementation therefore fails closed and no checkout/charge was attempted. QA entitlement/gameplay is validated with the QA grant; paid subscription checkout remains inactive until dedicated Stripe Test Mode configuration is supplied. No live credential and no Production resource was touched.

## 2026-08-26 TouchLine Markt Gameweek XI redesign — QA GREEN / NATIVE SAFARI CUSTOMER

- **Canonical integration:** product commits `727ceb4` through `fcce81095527fa55aa308ad7e20261ef7c770004` reuse Fantasy Gameweek V1 and promote `/market-transfer` as its canonical product surface. `/fantasy` redirects to the same authenticated journey. The ordered flow is one of twenty canonical coaches → canonical formation → exactly eleven canonical cards → review → confirm → Arena sync. Fantasy has no bench, and neither a second lineup model nor a second persistence path was introduced.
- **Server and database authority:** the first valid fixture minus five minutes is calculated and enforced on the server. Confirmed lineups are immutable, reconfirmation is idempotent, and the previous locked coach/XI carries into the next open Gameweek. QA migrations `20260825202938_touchline_fantasy_markt_gameweek_xi.sql`, `20260825213744_touchline_fantasy_wall_clock_deadline.sql` and `20260825214912_touchline_fantasy_lineup_alert_fk_indexes.sql` were applied only to `xgxbwqxjssxxuihuwmgy`. Transactional probes proved 20 coaches, 532 eligible player cards, 11 formations, 10/12-player rejection, exact-11 acceptance, T−5 lock boundaries, immutable snapshots, carry-forward, official-evidence-only `NOT_SELECTED_ALERT_ELIGIBLE`, covered foreign keys and `0` duplicate canonical keys; the probe transaction was rolled back.
- **Arena and Club Owner parity:** both surfaces read one shared confirmed-snapshot adapter. Arena maps the same canonical player IDs, formation coordinates and roles into its existing presentation and has no write-back or duplicate save. The direct Quick Substitution entry is closed when an XI is Gameweek-synced. The CUSTOMER account has no confirmed Gameweek XI and Gameweek 1 is already `SETTLED`; QA therefore renders the honest `0/11` empty state and does not synthesize an eleventh player or mutate the saved ten-card legacy Arena state.
- **UI, responsive and accessibility:** the Markt card is upright and uses the shared canonical card/Zoom data; Player Zoom itself is unchanged. Desktop/laptop/wide desktop remain playable. Phone/tablet portrait remains playable, while a touch/mobile-identity landscape viewport receives the labelled `Rotate to portrait` overlay with preserved state. Native Safari CUSTOMER proved iPad landscape gate, portrait recovery and normal desktop recovery; state remained `0/11` with €350m available and the canonical deadline remained `21 Aug 2026, 19:55`. The Safari SSR/client punctuation difference that caused React `#418` was isolated and fixed by separately formatting date and time in `Europe/London`. A final reload left the Inspector console without hydration/runtime errors.
- **Security and integrity:** lineup/state APIs remain authenticated and private, reject cross-origin mutation, enforce an 8 KiB request limit and use strict server parsing. RLS/service-role boundaries remain intact. The completed security diff review found no reportable issue. No provider Rating, card value, lineup, alert evidence or billing value is fabricated. The RDM-only Fetch warning was paired with exact-deployment HTTP `200` state responses and was classified as Inspector/RDM client noise rather than an API defect.
- **Verification and release:** focused `15/15`, complete local `1302/1302`, governance, release-readiness and `git diff --check` passed. The exact product-SHA Vercel pipeline passed TypeScript, ESLint with `0` errors (`7` established warnings), `1274/1274` release tests and the `135/135` route build. Preview `dpl_EP6T5jfemYpbjJsQydEftT1bQ8dE` is `READY`, source product SHA `fcce810`, and owns `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`. Stable Markt and authenticated state traffic returned HTTP `200`; no application hydration failure remained.
- **Open external configuration:** Preview still lacks dedicated Stripe Test Mode mode/secret/Price/webhook values. Paid checkout correctly remains fail-closed; no live credential or charge was attempted. Production was not touched.

## 2026-08-26 TouchLine Markt classic presentation restoration — QA GREEN / NATIVE SAFARI CUSTOMER

- **Outcome:** commit `b1b2b9419dbdadd5857337c57fbc6ba074fe3ff3` restores the compact classic Markt presentation without replacing the canonical Fantasy Gameweek implementation. Coach remains first, formation second, then exactly eleven canonical cards, review, confirmation and Arena sync. No second model, migration, API or write path was created.
- **Presentation contract:** the classic metric rail, premium green builder, compact progress rail, pitch and technical guide are responsive. Selected pitch cards use the already shared attack-facing wrapper with horizontal Rating; catalogue cards and Player Zoom stay upright. No gameplay, Rating, publication, budget, formation, contract, roster or persistence rule changed.
- **Evidence:** focused `57/57`, complete local `1302/1302`, release-readiness, diff check and ESLint with zero errors passed. Vercel verified the exact SHA with governance, TypeScript, ESLint, `1274/1274` release tests and all `135/135` routes. Native Safari CUSTOMER passed desktop, iPad `820×1180` and phone `390×844`, displaying all twenty coach cards and the honest settled `0/11` state without changing session or data.
- **Release:** Preview `dpl_HBAz7zTkSnM77yCNAi3KMr98NCW3` is `READY` and owns the stable QA alias. `/market-transfer` and `/api/touchline-fantasy/state` returned HTTP `200`; deployment-scoped error logs were empty. Production was not touched.

## 2026-08-26 TouchLine Markt inter-round window — QA GREEN / NATIVE SAFARI CUSTOMER

- **Canonical timing:** the existing Fantasy Gameweek synchronizer now opens the Markt exactly five minutes after the last fixture of the previous round is observed final and closes exactly five minutes before the first fixture of the current round. The active proof is Gameweek 2: prior finalization `2026-08-24 21:05:00.356Z`, opening `21:10:00.356Z`, close `2026-08-28 18:55:00Z`, kickoff `19:00:00Z`.
- **Constraint correction:** future rounds are still materialized while the predecessor is incomplete. A one-microsecond sentinel keeps the row inside the existing strict timestamp constraint, while the earlier state branch forces `UPCOMING`; it can never become an opening window. Both the original and incremental migration define the same corrected function, so fresh and already-migrated QA databases converge without a second system.
- **Database/security proof:** Gameweeks `1–5` exist with states `SETTLED`, `MARKET_OPEN`, `UPCOMING`, `UPCOMING`, `UPCOMING`; duplicate round rows are `0` and every close is exact T−5. The synchronizer remains `SECURITY DEFINER` with empty `search_path`; browser roles cannot execute it and `service_role` can. Security Diff Scan `7221d774-d381-4ec1-aba5-37e841341bd2` completed with zero findings.
- **Safari/customer proof:** the preserved CUSTOMER session on the stable QA alias displayed Gameweek 2 and `Mercado aberto`. All twenty coach buttons were enabled; Mikel Arteta opened eleven formation buttons, and `4-3-3` exposed enabled player-slot/catalogue controls. Codex did not save, confirm or send a lineup and did not clear session state.
- **Quality/release:** focused `6/6`, full `1303/1303`, TypeScript, scoped ESLint and diff-check passed. The exact Vercel pipeline passed governance, TypeScript, complete ESLint/release tests, release-readiness and Next compilation. Product Preview `dpl_9kNYgssQN9cP9onxmvUQqCYsPicZ` reached `READY` for source `c3fcbc9`; the stable QA alias follows the latest branch-head deployment with identical runtime code. Seventeen observed post-correction cron starts matched seventeen completions with no new strict-window violation. Production was not touched.

## 2026-08-26 TouchLine Markt editable persistence and free club choice — QA GREEN / NATIVE SAFARI CUSTOMER

- **Persistence correction:** commit `02c88b0bbe0d5f483520967914dff039deb974a8` connects the existing Markt client to the already canonical Fantasy Gameweek state. The state payload now hydrates the persisted coach, formation and selections; a deterministic lineup fingerprint distinguishes clean from unsaved UI state. Save/Confirm are considered successful only after a bounded state re-read proves the exact server-persisted fingerprint and expected `DRAFT`/`CONFIRMED` state. Network, validation and verification failures remain visible and cannot falsely claim that a team was saved.
- **Editable while open:** coach, formation and player selection remain customer-controlled while `now < locks_at`. The review and confirmed views provide explicit coach/player edit actions, and any new change returns the UI to the unsaved state. A client deadline timer disables controls at the exact boundary, while the canonical RPC retains the server wall-clock T−5 guard. Market reopening remains owned by the existing T+5 inter-round synchronizer.
- **No per-club cap:** QA migration `20260826203421_touchline_fantasy_remove_club_limit` was applied only to Supabase project `xgxbwqxjssxxuihuwmgy`. It removes the club-concentration exception from the existing `touchline_fantasy_save_lineup` RPC; the legacy configuration and snapshot columns remain fixed at XI size `11` only for schema/rollback compatibility. A transactional QA probe built one valid `4-3-3` with eleven Coventry City players, saved and confirmed it through that RPC, verified `11` rows and `1` distinct club, and rolled the entire probe back. The reviewed rollback patch restores the former guard and was itself tested inside a rolled-back transaction.
- **Customer integrity and database evidence:** after all probes, Gameweek 2 is still `MARKET_OPEN` from `2026-08-24 21:10:00.356Z` until `2026-08-28 18:55:00Z`. The live RPC definition contains the deadline guard and no `TL_FANTASY_CLUB_LIMIT_EXCEEDED`. The preserved CUSTOMER Gameweek remains `DRAFT`, formation `4-3-3`, coach null, draft count `0`, locked count `0`; Codex did not choose or save a team for the customer.
- **Native Safari evidence:** the existing CUSTOMER session was preserved. The stable QA alias rendered twenty enabled coach buttons, `Escolha livre de jogadores por clube`, `0/11`, the correct T−5 deadline and `Ainda não salvo`. A local Mikel Arteta click exposed all eleven canonical formations, enabled Save draft and showed `Alterações não salvas`. No Save or Confirm action was invoked; an ordinary reload rehydrated the authoritative empty state with `Treinador pendente` and disabled save controls. No white screen, infinite loading, broken image or relevant overflow appeared.
- **Verification and release:** focused `17/17`, complete local `1304/1304`, TypeScript, scoped ESLint, diff check, governance and release-readiness passed. Vercel Preview `dpl_E1iRAo4SrYaY7Eghr1vZPAxSQGU1` is `READY` for exact QA source `02c88b0`; its pipeline passed governance, TypeScript, ESLint with zero errors, `1276/1276` release tests and all `135/135` generated routes. Deployment-scoped observability records successful Markt/state traffic and no `5xx`, error or fatal event. Production was not touched.

## 2026-08-27 Arena intro isolation and Markt quick link — QA GREEN / NATIVE SAFARI CUSTOMER

- **Outcome:** the existing Arena player layer remains mounted for preload but uses the established hidden entry state until `isArenaFunctionalReady`. It is invisible, non-interactive and excluded from the accessibility tree during the official intro, then reveals the unchanged confirmed XI. The quick menu now includes one localized same-origin `Markt` link.
- **Native Safari proof:** the preserved CUSTOMER session replayed the stable-QA intro on desktop and at `390×844`. The actual screenshot and accessibility tree exposed only the premium intro and skip control—never the eleven player cards, synced-XI badge or Arena controls. After reveal, Gameweek 2 returned as `4-3-3 · 11/11`. The `Markt` link opened the canonical authenticated builder with Mikel Arteta and the same eleven saved players.
- **Integrity and verification:** no player, coach, formation, Rating, cookie, storage or account state was changed. Focused tests passed `35/35`, complete current-QA tests `1305/1305`, TypeScript and scoped ESLint passed with zero errors. No new system, API, table or migration was created. Production was not touched.
