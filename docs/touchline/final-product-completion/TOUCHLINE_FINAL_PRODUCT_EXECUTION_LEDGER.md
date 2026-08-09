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
