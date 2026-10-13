# ClubOwner — compact plan selector / QA checkpoint

Date: 2026-10-13. Status: **BLOCKED / EXTERNAL — not published**.

## Identity, scope and authority

- Repository: `/Users/luizlopez/Developer/touchline-release-candidate-20261007`.
- Remote: `git@github.com:luizeuropemalta-commits/touchline-football-platform.git`.
- Branch: `qa`; implementation baseline: `62c054990f0baea7eda56c896f0a310bfe09867c`.
- Observed local `origin/main`: `32d64b2a6401968c60338c475f4fe24e5741d509`; not a freshly fetched remote claim.
- Owner authorized the ClubOwner change and QA publication. Remote build budget: **1 Git-native QA build; 0 consumed for this delta**.
- Correct Vercel account: `luizeuropemalta@gmail.com`; project `touchline-arena-official`, scope `fifa-agent-plataform`, project ID `prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`, team `team_P1d7YNrmUObvbJJTJRlGcXoz`.
- The owner explicitly clarified that `admin@touchline.com.br` is not the Vercel hosting account. Do not create another project/account or transfer hosting to resolve the login blocker.
- Non-goals: Production, provider synchronization, migrations, entitlement/payment activation, avatar-retention activation, email operations, automations and Mac/iCloud cleanup.

## Implemented contract

The five-card gallery below the cover is removed. The right cover panel contains one plan card with five compact tabs, previous/next arrows, a comparison and a details dialog. The selected preview updates the secondary ClubOwner panel lines and cover lighting: Beta ruby, Standard blue, Pro gold, Master green, VIP purple. TouchLine's outer green perimeter, gold money, player-card tier frames and pitch artwork remain unchanged.

The account's real name, photo, membership badge, available XI budget and paid-plan expiry are independent of preview selection. VIP remains named only VIP, without renewal or purchase activation. Existing not-ready messaging is retained for eligible plan-interest actions. Missing account/plan information is not turned into a fictitious active membership.

Automatic Beta enrollment already exists in the embedded ClubOwner flow (`TouchlineBetaEnrollment autoStart={embedded}` with server confirmation). This delta does not change it or claim new remote proof of enrollment. Photo capability flags and retention controls are also unchanged; this checkpoint does not declare photo upload active.

## Explicit final manifest

Product (6):

- `app/clubowner/market-game.module.css`
- `app/fantasy/fantasy.module.css`
- `components/touchline/ClubOwnerMarketHeader.module.css`
- `components/touchline/ClubOwnerMarketHeader.tsx`
- `components/touchline/ClubOwnerPlanShowcase.module.css`
- `components/touchline/ClubOwnerPlanShowcase.tsx`

Tests (4):

- `tests/touchline-club-owner-avatar-ui.test.mts`
- `tests/touchline-clubowner-market-header.test.mts`
- `tests/touchline-clubowner-plan-showcase.test.mts`
- `tests/touchline-clubowner-page-theme.test.mts`

Evidence (3):

- `CURRENT_STATE.md`
- `CURRENT_EXECUTION_LEDGER.md`
- `docs/touchline/release-audit/CLUBOWNER_PLAN_SELECTOR_QA_2026-10-13.md`

No dependencies, lockfile, environment file, credentials, generated output, database or deployment configuration belongs to this manifest.

## Verification and corrections

| Gate | Observed result / evidence |
|---|---|
| Final release gate | PASS, exit 0: 5263 total, 5249 pass, 0 fail/cancelled, 14 skipped, 198.63 seconds. TypeScript passed; ESLint 0 errors/7 existing warnings; governance and Vercel-input checks passed. Log: `/private/tmp/touchline-clubowner-release-final-20261013.log`. Readiness reports `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL`, not hosted clearance. |
| Local production build | PASS, exit 0; 139/139 pages. `/private/tmp/touchline-clubowner-build-20261013.log`. Product code unchanged after this build; later changes are test-fixture improvements. |
| Focused regression repair | 49/49 PASS across budget vocabulary, avatar capability forwarding and header tests. |
| Scoped fixture file | 10/10 PASS (six static tests and four browser tests), exit 0, with Chromium/WebKit coverage; `/private/tmp/touchline-scoped-final-20261013.log`. |
| Final transition assertions | Re-execution of a two-test subset, 2/2 PASS, exit 0, after waiting for both cover pseudo-elements' final colors; not two additional distinct tests. `/private/tmp/touchline-scoped-settled-20261013.log`. |
| Sibling panel theme | 1/1 PASS, Chromium/WebKit at 1440/844; original page/Fantasy styles in a synthetic DOM; player frame, pitch, currency and other-route signatures unchanged. |
| Independent review | No unresolved P0/P1/P2 in product delta. Second read-only checkpoint review confirmed manifest, test boundaries and no credential/generated paths. |
| Diff whitespace | PASS before evidence-document changes; recheck exact staged manifest before commit. |

The first full gate failed (5263 total / 5247 pass / 2 fail / 14 skip). Both failures were investigated rather than hidden: the real-budget accessible name regained its protected `TouchLine Credits` wording; the avatar unit-test fixture gained the React `useState` seam required by the now-interactive header. Identity, retention and recovery assertions remain intact. The prior failure log is `/private/tmp/touchline-clubowner-release-gate-20261013.log`.

The canonical `verify:release` runner deliberately excludes 12 local audit/media artifact replay files. It is the complete configured release suite, not a claim that every file selected by `pnpm test` was executed. Browser opt-ins are tested separately above.

The browser fixture compiles CSS Modules with the installed Next webpack naming pipeline, avoiding the original raw-class collision. Plain-name aliases are inert test selectors only. Tests exercise real components, but mock image/avatar integration and do not run a full authenticated Next page. Earlier unscoped-fixture screenshots are superseded.

Inspected scoped desktop and phone captures include `/private/tmp/touchline-scoped-settled-20261013-active-vip-1440.png` and `/private/tmp/touchline-scoped-settled-20261013-active-vip-390.png`. They show Master preview with a preserved actual VIP badge/budget and green outer line. Fixture widths include 390, 768, 1280 and 1440; the separate sibling-style test includes 844. Eight locales, tab/arrow/compare/detail interactions, keyboard focus, reduced-motion behavior and overflow checks have local coverage. Native Safari, actual devices and full-page hosted behavior remain pending.

## Exact external blocker and next action

The connected Vercel MCP and CLI identity is the administrative account, not the personal project owner. Owner login through both GitHub and Google reaches Vercel's authenticator challenge. The owner reports no authenticator code and no other already-authenticated browser session. No security reset, credential change, recovery request or account transfer was performed.

Next access step: the owner must complete the official Vercel recovery flow or use a valid recovery code privately. Do not request passwords or one-time codes in chat and do not attempt to bypass the challenge.

After access is restored:

1. Reconfirm the committed candidate, clean tree, project/team and `qa` branch.
2. Inspect required Preview/`qa` variable **names and scope only**, Git triggers, concurrency and spend-protection metadata. Separately confirm the effective QA backend identity with a read-only check, without exposing credential values; variable names alone do not prove the target. Preserve existing flags; no provider/retention activation is implied.
3. Resolve the previous deployment's exact SHA and rollback suitability. Confirm candidate is not already queued/building/ready.
4. Trigger the single approved Git-native QA build by pushing `qa` only; no parallel CLI deploy, hook, force or Redeploy.
5. Require successful canonical GitHub CI (`.github/workflows/touchline-qa-release.yml`) for the exact candidate SHA, exact-SHA Vercel READY and stable alias, then customer-persona browser checks, console/network/runtime logs, account invariants, refresh and regression. Preview itself is intentionally ephemeral and must not modify membership or persisted profile.

Stable QA URL: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/clubowner?lang=pt-BR` — **existing version, not this delta**.

Last observed existing preview: `dpl_HvuGnEgXAGsMN2R5G81kGMh1VT7p`, `touchline-arena-official-dfz3yzyfa-fifa-agent-plataform.vercel.app`, READY. Its precise source SHA and rollback qualification remain unverified in this checkpoint; do not infer clearance from READY alone.

## Rollback and remaining boundaries

Local rollback basis is the six product files at baseline `62c054990f0baea7eda56c896f0a310bfe09867c`, through a reviewed forward revert if needed, never a destructive reset. No migration or data rollback is introduced. Hosted rollback must target the revalidated last-known-good QA deployment before publication; no executable remote rollback command is approved while that target is unresolved. For a post-publication P0, stop further changes, preserve logs and roll back first to that previously qualified QA target before further repair; do not touch Production.

## Mission completion gate

- **MISSION:** ClubOwner compact selector and page-scoped plan preview.
- **SCOPE:** Six product files, four regression files and three evidence files above.
- **QA BRANCH:** `qa`.
- **QA COMMIT:** Local candidate is the commit containing this report and explicit manifest; its parent is the baseline above. Record its resolved SHA in the handoff and revalidate it before any push. No new hosted QA commit is claimed.
- **QA DEPLOYMENT:** None for this delta; EXTERNAL/BLOCKED.
- **REMOTE BUILD BUDGET / CONSUMED:** 1 / 0.
- **STABLE QA URL:** Existing URL above, not updated by this work.
- **FILES CHANGED:** Explicit 13-file manifest above.
- **FUNCTIONAL RESULT:** Local component/contract tests passed; hosted customer flow pending.
- **VISUAL RESULT:** Scoped fixture inspected; not a full-site visual PASS.
- **RESPONSIVE RESULT:** Local fixture matrix only; native-device/hosted checks pending.
- **ACCESSIBILITY RESULT:** Local keyboard/focus/names/reduced-motion checks; full assistive-technology audit not claimed.
- **SECURITY RESULT:** No entitlement/payment/data mutation, no secrets or environment paths in delta; access blocker preserved.
- **BROWSER MATRIX:** Chromium/WebKit local; native Safari, Firefox and devices pending.
- **TESTS:** Final configured release suite 5249 pass / 0 fail / 14 skip; separate scoped fixture evidence in gate table.
- **BUILD:** Local PASS, 139 pages; no remote build.
- **OBSERVABILITY:** Fixture page-error/overflow checks only; hosted console/network/logs pending.
- **OPEN FINDINGS:** Personal Vercel 2FA, environment/rollback/duplicate-build audit and hosted verification. Explicit staging, documentation-only checks and clean-tree proof must complete the local checkpoint. Avatar/provider/other queued work is not closed by this UI delta.
- **PRODUCTION:** NOT TOUCHED.

| TOOL / PLUGIN | RELEVANT | LOADED | EXECUTED | RESULT | EVIDENCE |
|---|---|---|---|---|---|
| Git, Node/pnpm, local build | Yes | Yes | Yes | Local gates/build and manifest inspection | Logs and identity above |
| Chromium/WebKit fixture | Yes | Yes | Yes | Scoped component interactions; limited, not hosted proof | Browser logs/captures above |
| Independent code reviewer | Yes | Yes | Yes | No unresolved P0/P1/P2 | Product and checkpoint reviews |
| Vercel MCP/CLI | Yes | Yes | Yes, read-only inspection | Connected identity is wrong for hosting; target metadata incomplete | Account inspection and existing preview record |
| Safari computer use | Yes | Yes | Yes, normal sign-in | Correct owner challenged for 2FA through Google/GitHub | Login challenge; owner reports no other session |
| Plugin management | Yes | Yes | Yes, discovery only | Vercel already installed/enabled; no duplicate installed | Installed connector inspection |
| Supabase/SQL/provider writes | No for this delta | Not used for new work | No | No schema/data/flags changed | Product-only manifest |

The TouchLine and Vercel preflight skills were applied to hold publication until exact-target gates can be proved. Mission is not complete: local evidence alone never substitutes for hosted browser, logs and persistence/regression proof.
