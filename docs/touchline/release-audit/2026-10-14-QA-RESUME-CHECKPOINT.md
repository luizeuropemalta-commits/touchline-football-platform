# QA resume checkpoint — 14 October 2026

## QA migration applied — 2026-10-15 04:xx Malta

- Owner completed `supabase login`; CLI listed both separately named projects and linked only QA ref `xgxbwqxjssxxuihuwmgy` (TouchLine Development QA). Production ref remains distinct and untouched.
- Fresh preflight returned `postgres` executor, migration max `20261011015000`, finite migration absent, zero confirmed gameweeks, row fingerprint `8276344206530321ee4a0957f439862c`, zero active peer transactions, cron jobs 5/6 inactive, zero recent sync runs, and no local server listening on 3321.
- Firewall was rechecked immediately before the write: no drafts; `QA TouchLine migration hold rehearsal 20261011` active/valid/deny/Preview-only. No firewall change made.
- Applied the generated finite-budget envelope once through linked QA. The first shell composition error sent an empty query, which Supabase rejected before any SQL executed. The corrected single transaction succeeded: migration `20261013173813`, name `touchline_fantasy_finite_plan_budgets`, exact payload one statement.
- Post-apply remote verification: all expected hashes matched for `touchline_fantasy_lock_gameweek`, `touchline_fantasy_prepare_user_gameweek`, and `touchline_fantasy_save_lineup`; zero confirmed rows and exact pre-write fingerprint remained unchanged. No compensation required.
- No commit, push, deployment, Sportmonks/provider request, data cleanup or Production mutation. Hosted QA still serves an earlier SHA; candidate release/remote acceptance remains pending.

## Superseding checkpoint — 2026-10-14 21:23 UTC

- Canonical repository `/Users/luizlopez/Developer/touchline-release-candidate-20261007`, branch `qa`, baseline `14ae584ef4b9ba3dfc0a8880dd246951d8ae7ab9`. WIP remains unpublished.
- Stable QA https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app still corresponds to deployment `dpl_BFCqPT1n3Xtn7hTsZyuXPb9wo7h5`, not the current dirty tree.
- Fresh firewall inspection: QA hold active, Deny, environment Preview only; diff empty. The separately owner-published .com.br pause is already active. This continuation changed neither rule nor Production.
- Supabase CLI `link` for QA `xgxbwqxjssxxuihuwmgy` rejected `Invalid access token`. Linked query also encountered unsupported IPv6. Owner asked to run `supabase login` and complete browser authentication; do not send tokens. MCP read-only access remains available, but no migration was applied.
- Added `scripts/qa/finite-budget-envelope-20261014.mjs` and focused tests. Exact source/hash checks, function preimages, security invariants, writer checks and migration history insert share one transaction. Forward compensation retains original history and rejects changed row fingerprint. Explicit QA executor binding and continuous writer hold remain mandatory.
- Fresh local SQL rehearsal: 2 PASS, including history-insert failure rollback, success, replay refusal, forward compensation and restored function ACLs. Persona/envelope tests: 5 PASS. Logs `/tmp/touchline-finite-envelope-compensation-20261014.log` and `/tmp/touchline-finite-envelope-persona-20261014.log`. These are local proofs only.
- Persona verifier fallback to NEXT_PUBLIC_SUPABASE_URL preserves exact-origin guard; canonical persona preflight PASS. No secrets printed or changed.
- Native Safari local customer session: ClubOwner to Rankings navigation succeeded, pt-BR preserved, eleven-player XI and closed-market restriction visible; Golden Ball, Golden Boot and coach-only crown observed. Avatar selection remains disabled. Sportmonks scope/worker remain OFF, zero pending attempts; no provider request made. Stored fixtures are not proof of fresh Live data.
- Local server PID28008/parent28006 on3321 remains running. Drain owned writer paths and refresh DB hashes/transactions before applying anything. Current row fingerprint is only an observation, not a permanent authorization.
- No files removed; no commit, push, deployment, remote SQL mutation or Production change. Still NOT READY for remote acceptance. Earlier checkpoint statements below are historical.

## Latest superseding checkpoint

Continuation after owner asked to clear all gates: live firewall remains v6 QA
deny; v7 .com.br hostname maintenance is still exactly one UNPUBLISHED draft.
Public Production /login returned200 and its shipped JS embeds only Supabase
ref vxireiswggllwhbsmdcj (20 public script references inspected), distinct from
QA xgxbwqxjssxxuihuwmgy. No secret/env value accessed. QA pg_stat_activity
snapshot found only idle application sessions, no active application transaction;
this does not establish future writer containment. Local next-server PID28008,
parent28006, cwd canonical candidate, remains listening on3321 and must be
drained before migration. No process stopped in this continuation. Fresh
vercel-input check PASS9required docs, mission governance PASS, diffcheck PASS.
No migration, commit, deployment, provider call or Production mutation performed.

2026-10-14T20:21Z: owner explicitly requested taking .com.br offline after
read-only account inventory. Narrow exception to prior Production-no-change
boundary: staged ONLY host deny for touchline.com.br and www.touchline.com.br,
rule_touch_line_com_br_owner_maintenance_20261014_hPSlFX, named
TouchLine com.br owner maintenance 20261014. Diff exactly one insert, validtrue.
NOT published by agent; human Publish required. No DNS, email, credentials,
account, SQL, deployment or application changes. Recovery is disable this exact
rule, human publish, then verify both host responses. Direct deployment URLs and
background workers are not contained by this hostname-only rule.
Earlier QA hold now live v6, no draft before this new insertion; QA HTTP403,
Production HTTP307 observed before new staging. Remaining migration preconditions
include draining localhost/service-role writers outside WAF and backend separation.

Resume audit after owner's explicit request: Vercel project identity and stable QA
alias freshly rechecked. Still READY dpl_BFCqPT1n3Xtn7hTsZyuXPb9wo7h5,
Git qa SHA14ae584ef4b9ba3dfc0a8880dd246951d8ae7ab9; current local WIP is not deployed.
Firewall diff still contains exactly one pending update of the QA hold. Its
environment=preview condition covers ALL project Previews, not solely the stable
QA hostname. Human publication and human publication of its eventual disable
remain required. No remote mutation, migration, commit or deployment performed.

Independent plan/retired-checkout tests rerun:13PASS/0FAIL/0SKIP. Sources verified
in working tree and current hosted SHA: Standard EUR49.90/year, Pro EUR89.90/year,
Master EUR169.90/season, Beta free; ClubOwner VIP price pending. These are UI
offer texts, NOT proof of active Stripe Price configuration. The historical
GBP29.90/month validator remains for legacy processing, but the subscription
entry route returns410 LEGACY_GBP_CHECKOUT_RETIRED after authentication and cannot
create checkout. Existing subscriptions remain untouched. No price, partnership,
courtesy or50percent-discount implementation authorized by the commercial simulation.
Current full-suite/build/rollback evidence preserved; git diff --check passed.

HUMAN GATE: staged only the existing QA hold rule
`rule_qa_touch_line_migration_hold_rehearsal_20261011_HAYi7a`, enabled false -> true,
condition environment=preview, action deny, project prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM.
Not published; Production is excluded by the condition. Firewall skill requires
human publication, not agent CLI/UI publication. Reverse by disabling that exact
rule and publishing after coordinated recovery; no other rules may be bundled.
Do not migrate until live hold is independently verified and fresh counts/hashes
rechecked. Cron jobs5/6 inactive, quota workerqa_fixture_sync disabled; RPC ACLs
postgres/service_role only. This is not proof of external writer containment.

Exact QA preimages captured read-only: `/tmp/touchline-qa-finite-budget-preimages-20261014.sql`.
Guarded compensation: `/tmp/touchline-qa-finite-budget-rollback-guarded-20261014.sql`.
Local exact-preimage apply/restore/replay-rejection **1PASS/0FAIL**, log
`/tmp/touchline-finite-exact-qa-guarded-rehearsal.log`. Independent review approves
only immediate compensation under uninterrupted hold/no intermediate writes;
recheck metadata and new confirmed/locked rows before any rollback. No SQL applied remotely.

Read-only standalone snapshot probe: 80 QA GET requests, no errors, eleven players,
2851ms, `/tmp/touchline-qa-snapshot-readonly.log`; transport rejects writes/other hosts.
Not browser timing or remote-release proof. Native Safari refresh retained the XI,
VIP221M and ar-SA. Down/up scroll returned to0 with continuous purple top canvas.
Cold-start failure was not reproduced by these checks; root cause remains unproven.

Continuation verification: corrected XI browser run **20PASS/0FAIL/3SKIP**,
`/tmp/touchline-xi-budget-flow-corrected.log`. The three excluded cases are the
separately executed Arena matrix and two optional keyboard/mount diagnostics.
Native-keyboard sequence explicitly checks coach -> formation summary -> Arena;
independent review approved the test-only adjustment without forced focus.
Remaining opt-in theme/portrait-error/push-rehearsal browser group **26PASS/0FAIL/0SKIP**,
`/tmp/touchline-remaining-browser-gates.log`. These are controlled local browser
proofs, not hosted QA receipts or real notification deliveries.
Native Safari still renders the authenticated customer's XI, finite VIP balance,
large coach alongside eleven formation tiles; closed market remains enforced.
No new product edit, commit, remote configuration, migration or deployment.

Final exact-focus build **exit0**, `/tmp/touchline-exact-focus-build.log`.
Local compiled server now96978 on localhost3321. Opt-in locale/Live/register
browser tests **21PASS/0FAIL/0SKIP** (`/tmp/touchline-locale-live-optin-final.log`),
synthetic HTTP only: this proves UI contracts, not remote provider recovery.
Fresh persona preflight passed. First cold native ClubOwner read returned
temporary-unavailable; manual reload recovered VIP/221M/11 players without
account changes. QA configuration REST probe returned200 in164ms. Root cause
of the cold snapshot failure remains unproven; do not claim performance complete.
Opt-in XI budget/indicator/replace/readback run started in
`/tmp/touchline-xi-budget-flow-final.log`.

Exact-focus complete gate finished **exit 0**: 5282 tests, 5268 passed,
0 failed/cancelled, 14 skipped, 904225ms. TypeScript passed; ESLint 0 errors,
8 warnings. Readiness explicitly remains LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL.
Evidence: `/tmp/touchline-exact-focus-release-gate.log`. Final build now running
in `/tmp/touchline-exact-focus-build.log`; only owned local server85104 stopped.
Native Safari customer navigation ClubOwner -> rankings retained ar-SA and
rendered all three awards. Field images initially incomplete then loaded after
scrolling; performance remains an open observation, not a full visual PASS.

Fresh deployment metadata (read-only): stable QA deployment
`dpl_BFCqPT1n3Xtn7hTsZyuXPb9wo7h5` is Git `qa` at
`14ae584ef4b9ba3dfc0a8880dd246951d8ae7ab9`. Production `.com.br` is
`dpl_GDToS5PAGRRD7UhmNEZjKXAS8LzU`, Git `main` at
`437b318e08c04c1e11f8e290cf652482a4f6a98d`. Neither contains current WIP.
Production source at that exact SHA still creates an unguarded Sportmonks
provider. Fresh firewall read shows the legacy observation rule enabled with
action **log**, not deny; it is not proof of containment. No firewall drafts,
remote changes or provider calls were made. Shared-quota activation remains
blocked on safe containment evidence; local verification continues independently.

Arena matrix now PASS:55 formation/device combinations across desktop, phone
landscape844/667, tablet and1920-wide screen;137.9s, no failures/skips. Includes
initial Close focus, visual tile selection, return focus, XI geometry/collisions,
no lineup writes. Evidence:/tmp/touchline-arena-tiles-layout-final.log.
Focused Arena/workflow32/32PASS. New complete exact-focus gate running in
/tmp/touchline-exact-focus-release-gate.log; not yet full-suite approval.

Continuation: native Safari ar-SA rendered the large coach next to all eleven
formation tiles; the same coach's existing zoom opened and closed successfully.
Market-closed tiles remained disabled; no lineup writes. Arena DOM verification
found hidden-first-button focus: initial focus now explicitly targets Close Arena,
the focus trap includes summary, and return focus targets the actual opener in
both page layouts. Independent review found no further blocking delta.
Complete run /tmp/touchline-final-large-coach-release.log finished exit1:
5282 total,5266 pass,2 fail,14 skip,0 cancelled. Both failures were scheduling-
dependent avatar tests, now made deterministic without changing production
timeouts or guards; focused pair40/40PASS. Full exact-tree rerun still required.
The 55-mount Arena matrix exceeded120s while overlapping the suite; its matrix
budget is now300s with individual assertions unchanged. Serial rerun is
/tmp/touchline-arena-tiles-layout-final.log, not yet a PASS.
Fresh QA read: latest migration remains20261011015000; Sportmonks scope remains
disabled, not unknown-blocked, no active lease/cooldown. No remote changes.

Mac lock cleared; native Safari accessible and canonical customer UUID observed
in local preferences response. Locale restored to pt-BR earlier, then owner
selected ar-SA; preserve current owner selection. Original gradient restored,
fixed pseudo-layer addresses Safari upward-scroll top strip. Build with large
coach beside formation tiles passed (/tmp/touchline-build-large-coach.log).
Canonical coach zoom preserved. Independent review found no new P1/P2.
Latest completed full run5282total/5263pass/5fail/14skip had five outdated
formation-workflow tests. Updated actual rendered control assertions and
same-formation no-op coverage:22/22PASS. New full run41903 in
/tmp/touchline-final-large-coach-release.log is ongoing, not yet a PASS.
Local compiled server85104 at localhost3321. Remote gates below remain open.
Overall NÃO PRONTO; old Mac-human-blocker status below is SUPERSEDED.

## Scope and boundary

Single current candidate in `qa`, baseline `14ae584ef4b9ba3dfc0a8880dd246951d8ae7ab9`.
Existing WIP preserved; no commit, push, deployment, remote write, migration,
provider request, cleanup or Production change in this continuation.
One Git-native QA build authorized; zero consumed here.

## Verified locally

- Eight-locale optimized local build succeeded before the final podium fixes.
  Local compiled runtime: localhost:3321, QA database, not Production.
- Safari account dropdown exposed all eight options. French selection succeeded
  and ClubOwner navigation retained fr-FR. Restore the original pt-BR preference
  after finishing the language matrix. This is not all-page/eight-locale proof.
- QA canonical customer persona preflight passed using the QA-only environment.
- Latest focused awards/navigation/localization regression: 34 passed, 0 failed,
  0 skipped, including independent award slots and snapshot-bound goals authority.
- Independent review approved both P2 corrections: scorer podium now consumes
  the same immutable card-goals snapshot as shared cards; missing best-player
  data no longer suppresses the coach or scorer.
- The discarded intermediate TTL Golden Boot loader is NOT the chosen source.
  Current page uses cardGoalsLeaderIds from its catalogue's ranking snapshot.
- Complete release gate still running when this checkpoint was written:
  /tmp/touchline-final-gate-20261014.log. Do not claim aggregate PASS until exit.
  TypeScript and ESLint completed before the last snapshot-wiring edit; rerun
  those and build after the suite. Lint had zero errors/eight warnings.

## Verified remote read-only

- Vercel project prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM:
  fifa-agent-plataform/touchline-arena-official.
- Stable QA alias remains
  https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app .
- Existing Ready Preview: dpl_BFCqPT1n3Xtn7hTsZyuXPb9wo7h5,
  https://touchline-arena-official-48u9fj7f0-fifa-agent-plataform.vercel.app .
  It does not contain the current uncommitted changes. Its SHA was not freshly
  established by this read; never equate it with this WIP.
- QA Supabase xgxbwqxjssxxuihuwmgy is ACTIVE_HEALTHY.
- Central scope touchline_sportmonks_football_starter is disabled;
  blocked_unknown=false, no lease/cooldown; QA worker qa_fixture_sync disabled.
  Only that worker is registered. Zero attempts/zero pending. This does not
  establish the external account's remaining quota or Production containment.
- QA lineage latest migration 20261011015000. Finite-budget migration
  20261013173813 has not been applied. Current lineup counts: DRAFT3, FINAL1,
  LOCKED1, CONFIRMED0. Recheck immediately before any authorized migration.
- Metadata-only Vercel env list: site locales flag absent from Preview and qa
  branch scope. Do not mistake local process flag for remote configuration.

## External blocker

Safari automation reports: Mac is locked and automatic unlock could not unlock
it. User must unlock the Mac. No attempt to bypass lock or change OS settings.
Cannot complete native visual/customer/admin inspection while locked.

## Remaining work, no scope dropped

Finish full tests + exact-tree typecheck/lint/build; full visual/mobile/eight
language and authenticated navigation matrix; final login/origin regression;
market complete XI/budget and profile/avatar checks; safe finite-budget SQL
preflight/hold/rollback on QA; configuration gates; shared Sportmonks consumer
containment, admission/receipt/quota and end-to-end persisted data/recovery;
exact manifest/immutable SHA/one Git deployment/alias/log/browser verification.
Do not publish or label ready while those gates remain open.

## Final results in this continuation

Complete gate exit1: 5281 total, 5255 pass, 11 fail, 1 cancelled, 14 skipped.
SQL finite-budget test exceeded original30s; other failures were stale projection/
position test contracts and missing goals-authority harness import.
Those contracts were corrected. Serial rerun with real PGlite and unchanged30s
deadline:36 pass,0 fail/cancelled/skipped,13763ms.
Evidence:/tmp/touchline-final-failures-recheck.log. This is isolated recovery,
not a subsequent whole-suite PASS. Post-review TypeScript0, focal lint0errors/
1warning, diff-check0. Whole-suite rerun and exact-tree build remain required.
No new SHA, commit, push, deployment or remote writes.

Status: BLOQUEADO POR AÇÃO HUMANA for native browser inspection, overall NOT READY.
