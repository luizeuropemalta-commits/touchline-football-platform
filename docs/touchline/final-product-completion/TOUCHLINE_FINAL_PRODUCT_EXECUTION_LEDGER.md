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
