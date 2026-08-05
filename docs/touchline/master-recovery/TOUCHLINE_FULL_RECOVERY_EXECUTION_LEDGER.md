# TouchLine Full Product Recovery — Durable Execution Ledger

Authoritative mission: `FULL PRODUCT RECOVERY, CONSISTENCY AND PREMIUM COMPLETION` in `/Users/luizlopez/.codex/attachments/14d41325-a252-4ecc-8a6e-0ce47146f59b/pasted-text.txt`.

Checkpoint: `74fe6cae` (subsequent safe commits are recorded below). Safety: no Live Stripe, real payment, monetary wallet, financial migration, legal/tax decision, destructive production data change, or service-role disclosure. Resume protocol: read this file and `touchline-full-recovery-state.json`, inspect Git, then execute the first non-`COMPLETE` block whose next action is not an external or Luiz gate.

## Reconciliation — 2026-08-04

The original ledger used `TESTED` as an informal completion label. It is now
normalized to the durable-goal state model: a block is `COMPLETE` when its
authorised implementation and required local/Preview evidence are finished;
it is `EXTERNAL_HARD_GATE` only when the remaining work is specifically an
external source, controlled device/persona, approved remote migration or a
deliberate production promotion. This preserves the evidence history below
while making the 37-block total auditable.

| # | Block | Status | Routes/modules | Defects/files | Tests / production validation | Blocker | Next executable action |
|---:|---|---|---|---|---|---|---|
| 1 | Global application shell and navigation | COMPLETE | shell, proxy, public routes | return paths audited | 42 route tests; public smoke | none (native WebKit is consolidated in Block 29) | regression-only |
| 2 | Authentication | COMPLETE | login/register/recovery | safe callback flow | auth regression tests | none (real email/OAuth belongs to final controlled-persona evidence) | regression-only |
| 3 | Personas, authorization and access | COMPLETE | protected routes/Admin | server guards | 24 isolation tests | none (remaining persona journey evidence is consolidated in Block 35) | regression-only |
| 4 | Coach-first onboarding | EXTERNAL_HARD_GATE | Arena/Market coach gate | `74fe6cae` | local controlled validation and remote schema verification | controlled ClubOwner persona/device session | Validate reload, logout/login and second-browser persistence; do not substitute local storage evidence |
| 5 | Migration 047 | EXTERNAL_HARD_GATE | Supabase coach persistence | `coach_provider_id` is applied remotely and database persistence is verified | migration and coach contract tests; controlled remote write/read | controlled ClubOwner browser session | Verify the real user journey across login and device; migration application itself is complete |
| 6 | Unified card economy | COMPLETE | Market/cards | GBP nominal tiers | economy tests | none | regression-only |
| 7 | Coach reputation engine | COMPLETE | coach registry | pending historical classification is intentionally represented as pending, not fabricated | catalog tests | none | consume a future audited source only as a data update |
| 8 | Player and coach card presentation | COMPLETE | cards/profiles | canonical card surfaces | visual desktop + tests | none (native matrix is consolidated in Block 29) | regression-only |
| 9 | Card states | COMPLETE | card components | state consistency | component tests | none | regression-only |
| 10 | Squad builder | COMPLETE | ClubOwner/Arena | roster limits | squad tests | none (controlled account journey is consolidated in Block 35) | regression-only |
| 11 | Market | COMPLETE | Market Transfer | auth before team validation | Market tests | none (controlled account journey is consolidated in Block 35) | regression-only |
| 12 | Club Hub | COMPLETE | ClubHub | official table checkpoint `2653a0c8` | 614 suite + desktop | none (responsive matrix is Block 29) | regression-only |
| 13 | Training Centre | COMPLETE | `/club-owner/[owner]/substitution`, ClubOwner training summary, Arena bench surface | Confirmed this is the production Training Centre / substitution flow, not the audit-only mirror. Route identity, private squad sections, lineup, bench and reserve-vault states remain intact. | Focused 41/41 route/navigation/visual-contract tests pass; local desktop route validation recorded. | none (Coach-first remote persistence remains Block 4/5) | regression-only |
| 14 | Renewals, history and substitutions | COMPLETE | renewal/history/substitution | server-owned boundaries | renewal/history tests | none; financial fulfillment is outside this recovery scope | regression-only |
| 15 | Frozen Club experience | COMPLETE | ClubOwner lifecycle | frozen predicates | lifecycle tests | none (controlled account journey is consolidated in Block 35) | regression-only |
| 16 | Arena | COMPLETE | Arena | coach gate/carousel | Arena tests | none (migration 047 is Block 5) | regression-only |
| 17 | Shared canonical match state | COMPLETE | fixture state | canonical fixture selection | match tests | none | regression-only |
| 18 | Card event language | COMPLETE | cards/live | event labels | event tests | none | regression-only |
| 19 | Match Centre | COMPLETE | `/live` | fixture deep links | public Preview validation | none (native matrix is Block 29) | regression-only |
| 20 | Player Profile | COMPLETE | player profiles | GBP display and server-rendered localisation | profile tests and authorized Preview | none (production promotion is Block 35) | regression-only |
| 21 | Coach Profile | COMPLETE | `/touchline-coaches/[coach]` | checkpoint `ca182d1d` | focused tests + desktop | none (native matrix is Block 29) | regression-only |
| 22 | Club Profile | COMPLETE | ClubHub | roster/loading | ClubHub tests | none (native matrix is Block 29) | regression-only |
| 23 | Competition table | EXTERNAL_HARD_GATE | ClubHub | checkpoint `2653a0c8` | 614 suite + desktop | no official finished-fixture dataset exists to validate a final public table | await official finished fixtures then validate without simulated standings |
| 24 | Rankings and statistics | EXTERNAL_HARD_GATE | Tables rankings/statistics | Removed fabricated ClubOwner, England and player rankings; absent audited publication now has an explicit localized pending state. Files: `app/touchline-tables/page.tsx`, client/CSS, rankings i18n, `tests/touchline-rankings-publication.test.mts`. | TypeScript, ESLint, focused 6/6, full 618/618 and production build pass; local desktop + mobile visual evidence saved under `audit/2026-08-03/screenshots/recovery-local/`. | first audited published ranking snapshot unavailable | validate the first immutable audited snapshot; do not reintroduce simulated standings |
| 25 | Top 11 | EXTERNAL_HARD_GATE | Tables Top 11 | `a42ef0ec`, `4a88b974` | 617 suite + local desktop | first audited ranking snapshot unavailable | validate after the immutable snapshot exists |
| 26 | TouchLine Central, Inbox and notifications | COMPLETE | Inbox/API | `28b17b0f`; migration 043 applied remotely | 10/10 Central/Inbox tests; controlled draft/localisation/receipt read-persistence exercise; RLS/index/trigger verification | none | regression-only |
| 27 | Admin | COMPLETE | Admin routes | isolation | admin tests | none (controlled admin persona is consolidated in Block 35) | regression-only |
| 28 | Localisation | COMPLETE | i18n, ClubHub and Player Profile cards | Preview smoke found and corrected partial `pt-BR` card labels, English card-discipline labels, English country-fallback text and a server-rendering language flash in nested Player Profile feed cards. Commits `78b5af5d`, `918d90c8`, `b3b2e418`, `5fb122e8`, `a0c80dac`. The authorized branch Preview now immediately reports 2 Portuguese disciplinary groups, 3 `Clube atual` labels and zero English fallbacks. | focused 2/2; TypeScript; ESLint; full 625/625; production build pass; authorized Preview immediate DOM pass | none | regression-only |
| 29 | Responsiveness | EXTERNAL_HARD_GATE | responsive surfaces | CSS verified; real ClubHub confirmed in native Safari/WebKit desktop locally and browser-authorized Preview at 1280px and 656px. Gold Polish `195be033` unifies the field and reduces cards without changing responsive data contracts. | static + desktop + local native WebKit evidence; 631/631 suite; Preview ClubHub geometry pass | controlled phone portrait/landscape and remote-Preview WebKit under Vercel SSO | run the controlled cross-browser/device matrix; do not infer phone results |
| 30 | Accessibility | EXTERNAL_HARD_GATE | shared pitch/card modal/global controls | Added labelled semantic pitch groups; restored visible keyboard focus for textarea, select and tabindex controls; card zoom now transfers focus to Close and returns it to its trigger. Files: `TouchlinePitchSurface.tsx`, `TouchlineCardZoom.tsx`, global CSS, accessibility contract test. | TypeScript, ESLint, focused 6/6, full 621/621 and production build pass. Browser keyboard automation did not advance focus in the local in-app browser. | controlled native WebKit/assistive-technology matrix unavailable | validate keyboard and screen-reader behavior after controlled device access |
| 31 | Performance | COMPLETE | public routes: Arena, Live, Market, Tables, ClubHub, Player Profile | Warm local production reads completed with gzip. No critical local route failure or uncompressed client chunk issue found. ClubHub's 1.08 MB uncompressed streamed HTML is 91.6 KB over gzip because it renders real card markup; this remains a monitored payload, not a safe candidate for content removal. Evidence: local performance report. | Three warm reads per route: all HTTP 200; TTFB 3–11 ms; totals: Live 228–506 ms, ClubHub 290–381 ms, Player Profile 245–279 ms; production JS route chunks are 9–24 KB. | none (production observability is a post-promotion measurement) | regression-only |
| 32 | Error and loading states | COMPLETE | ClubHub/Arena | safe empty/error states | 70 tests | none (native visual evidence is Block 29) | regression-only |
| 33 | Testing | COMPLETE | suite | Added a deterministic ClubHub delivery contract: the first six visible squad cards may load eagerly while all remaining squad and lineup card art is deferred. File: `tests/touchline-club-hub-resilience.test.mts`. | TypeScript, ESLint, focused 8/8, full 625/625 and production build pass. | none (controlled account E2E is Block 35) | regression-only |
| 34 | Deployment | COMPLETE | GitHub/Vercel | Dedicated SSH publishing key registered under the authorized GitHub account; branch pushed; Vercel project `touchline-arena-official` (`prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`) connected to `luizeuropemalta-commits/touchline-football-platform`. Authorized branch Preview is serving the current commit. | Local build; Vercel Preview and real-application smoke pass. | none (production promotion is Block 35 acceptance) | regression-only |
| 35 | Final real-product audit | EXTERNAL_HARD_GATE | Vercel Preview / later `touchline.com.br` | Authorized Preview matrix confirms the real application, not Audit Mode: login/register/recovery surfaces, expected protected-route returns, Live, tables, card rankings, ClubHub and Player Profile all render; the retired demo ClubOwner route reaches the safe 404 boundary. Browser validation confirms real Manchester United ClubHub data at 1280px and 656px, and opening/closing the real card-detail dialog returns focus to its trigger. Gold Polish Preview `dpl_B6W2KLFqMw8T6xwzAUthiQKn9rSL` confirms the canonical 11-card ClubHub field inside `1102 × 660` bounds. Native Safari/WebKit desktop on the local production build confirms the real lineup and approved dual player-name presentation (inside and above cards). Screenshots are retained locally. | focused localization 3/3; Coach-first recovery 5/5; TypeScript; ESLint; full 631/631; production build pass; authorized Preview locale and responsive smoke; local native Safari/WebKit visual pass. | controlled non-financial owner/admin personas, real-email confirmation, native phone portrait/landscape, remote-Preview WebKit and deliberate production promotion remain unavailable. Migrations 043, 047 and 048 are now applied; 047 cross-session UI validation still requires the persona gate. | Resume only when a controlled persona/device or the deliberate production-promotion gate is available; do not promote while any acceptance result is unresolved. |
| 36 | Acceptance standard | NOT_STARTED | all blocks | — | evidence review | depends on prior blocks | evaluate after 1–35 |
| 37 | Final report | NOT_STARTED | reports | — | consolidated evidence | depends on acceptance | generate only at completion |

## Active Block 35 validation note — 2026-08-04

Commit `68709bd3` is on the authorized GitHub branch and fixes the only
remaining Portuguese Player Profile fallback observed during this pass: the
canonical unavailable market-value sentinel `Pending` now renders as
`Pendente`. The current local production server confirms four Portuguese
pending values, zero English `Pending` values and no browser-console warnings.
Focused localisation checks pass 3/3, the full suite passes 626/626, and the
production build passes.

The branch Preview continued serving the previous deployment during this check;
the authenticated Vercel deployments page reported an SSR dashboard-fetch
warning and did not expose the new deployment row. This is recorded only as a
remote-Preview validation dependency for `68709bd3`; it does not reclassify the
already validated code or authorize a production promotion. Independent public
route and responsive validation continues while it resolves.

The same public-route pass reproduced a separate Coach-first UX defect: an
unauthenticated visitor could see the coach-offer rail remain in a permanent
loading state because the unauthenticated principal intentionally never starts
the authenticated offers request. Commits `61bfecd6` and `09c1a64d` bound a
real authenticated request to 10 seconds and make the signed-out state say
that sign-in is required, rather than claiming it is loading. The new local
production check has one signed-out guidance message, zero loading messages and
zero console warnings. This preserves Coach-first and does not create a demo
coach or persist any selection.

Vercel Preview `F9QwQJnBPHb9xf2CBkrP4kbDrxvG` for `09c1a64d` is Ready. Its
public Portuguese Player Profile again verifies four `Pendente` values, zero
English `Pending` values and zero console warnings. The authenticated
Coach-first journey itself remains correctly external-gated because no isolated
ClubOwner persona or confirmation mailbox is provisioned.

Latest safe commits after checkpoint: `eb79bb12`, `ca182d1d`, `ab608662`, `88bc9f35`, `28b17b0f`, `2653a0c8`, `a42ef0ec`, `4a88b974`, `470d9593`, `b1491c1c`, `c4e47484`, `f2bc14cb`, `7940994b`, `eac3e1da`.

## Active external-gate requirement — canonical player-season statistics — 2026-08-04

**Status:** `CODE_COMPLETE` locally; real historical data publication is an `EXTERNAL_HARD_GATE`. This is an additional mandatory acceptance requirement for Blocks 20, 22–25, 31 and 35. It does not re-open their completed UI work or authorize a production promotion.

| Item | Evidence / status |
|---|---|
| Canonical read model | Implemented as server-owned season, fixture, membership and coverage records in reviewed non-financial migration `048_touchline_player_season_statistics_read_model.sql`. Player Profile now consumes `loadTouchLinePlayerStatisticsReadModel`; it no longer derives season totals from the legacy profile snapshot. |
| Dataset separation | Previous completed season, current season, last five, and current/selected fixture are separately typed and rendered. Unknown data is unavailable; incomplete coverage renders exactly `Partial data — X of Y eligible fixtures synchronised`. |
| Integrity audit | Read-only audit script `scripts/audit-touchline-england-player-season-statistics.mts` inspected 568 active England players. There are 0 incorrect player mappings, 0 finished fixtures of 29, no stored prior completed season and no production canonical table. Thus 0 complete, 0 partial and 568 unavailable historic profiles are accurately represented. |
| Haaland | Player ID `a1e3b920-4b73-4588-bd08-ff19e70a74fc`, external ID `154421` are valid. The former 4/3/1/232/3 display was a legacy aggregate labelled 2025/26 with external season 25919, but that season is absent from the local canonical season mapping and has no fixture coverage. It is treated as unverified/unavailable, never as last five or a completed season. |
| Public provider wording | Reviewed public Player Profile, Coach Profile, Club Hub, Match Centre, Arena and data-response wording now uses TouchLine branding. Provider identity remains internal metadata/diagnostics only. |
| Validation | TypeScript, ESLint, 631/631 tests, production build and local production browser validation pass. Details: `docs/touchline-arena/audit/2026-08-04/TOUCHLINE_PLAYER_SEASON_STATISTICS_INTEGRITY_AUDIT_2026-08-04.md`. |
| Remaining external action | Backfill verified prior-season memberships/fixtures/lineups from an authoritative historical source, execute canonical sync and audit coverage before any historical total is published. Then validate all shared consumers against the one read model. |

Production schema application is now verified for migrations `043`, `047` and `048` in `vxireiswggllwhbsmdcj`. Central messages/receipts persist under RLS, `coach_provider_id` persists in the owner state, and the three server-only player-season read-model tables exist. The remaining gates are controlled browser/persona evidence, historical football coverage and deliberate production promotion — not missing schema.

## Continuing audit regression note — 2026-08-05

Checkpoint `67dd5cd2` restores the intended ClubOwner commercial boundary without reopening the economy design: a card sourced from an active server-side inventory/contract retains its stored tier colour and displays the approved current England nominal number. The audit found all 600 inventory cards have a valid tier; 595 still carry the explicitly retired `2026-07-tc-v2` marker. That retired marker is recognized only for an already-owned card and maps to the replacement 0/1/2/4/7/10/15 policy; its former numeric values are never displayed. An unknown table or missing tier remains unavailable. Public Market and ClubHub offers still require a verified current football value and therefore remain `Pendente`/`Pending` when it is absent. This was validated with 30 targeted tests, the full 640-test suite, TypeScript, ESLint and production build. Visual confirmation with a controlled persisted ClubOwner remains part of Block 35 and does not use a real-user account.

Latest safe checkpoint: `766f0d78` — applied-migration evidence plus Gold Polish canonical field, card-spacing and unified bench validation, all Preview-only.

## Preview deployment observation — 2026-08-04

The `touchline-football-platform` sibling Vercel project failed after a successful build because its `api/players/search-and-build-card` function measured 711.82 MB uncompressed, exceeding Vercel's 250 MB function limit. This is a deployment configuration/bundle gate specific to that project, not a product-code test failure; the approved `touchline-arena-official` Preview is still deploying. No production alias was changed. Next executable action: inspect the official deployment result first, then remove the oversized route dependency or apply the project-scoped Vercel large-functions setting only after confirming it targets the intended non-production project.

## Market Value Engine — 2026-08-05

**Status:** `CODE_COMPLETE`, local migration and workflow only; remote migration and licensed values remain deliberately unapplied.

Migration `050_touchline_market_value_engine.sql` defines the TouchLine-owned canonical current-value table, immutable player-value history, import runs/items, pending/mapping queue, job definitions/runs and service-role-only RLS. It preserves the earlier card-economy history by renaming it, and removes legacy triggers that changed card classifications during a generic football-data update. The approved 30-day annual refresh, seven-day delta check, daily transfer-window roster detection, and manual one-player import are recorded as inert job definitions. CSV parsing is native; spreadsheet parsing and licensed-source retrieval are injected server-side interfaces with no enabled default. The protected owner UI is `/admin/market-values`; public profiles and authoritative ClubOwner roster reads accept only verified canonical values, otherwise `Market Value Pending`.

Local evidence: TypeScript pass, ESLint pass, full test suite `646/646` pass. No data was scraped, no external source was activated, no remote migration was applied and no production alias changed. Template and migration safety review: `docs/touchline-arena/market-values/`.

Visual validation of the current local production build passed at 1280px,
768px and 390px: the Player Profile has no horizontal overflow and renders an
honest pending market-value state. The new owner route redirects an
unauthenticated visitor to the existing login route. Screenshot evidence is
stored locally under the 2026-08-05 audit evidence folder.

## Card Engine continuity — 2026-08-05

Checkpoint `67b8c727` closes a shared-state regression in the active-card
path. The authoritative roster client, Arena canonical state, browser roster
serialization and the exact-card renderer now preserve the explicit
`active-contract` authority marker. An owned card therefore continues to use
its stored, approved in-season tier after a later verified market-value
refresh; an unowned public offer still needs a current verified TouchLine
market value. Browser persistence format V5 preserves that marker while V1–V4
values remain readable. The Arena matchday bench now selects availability by
football status but presents both the matchday bench and Reserve Vault in the
stable goalkeeper / defender / midfielder / forward order; market value, tier
and nominal price cannot influence that order.

Validation: TypeScript, ESLint, full `651/651` test suite and local production
build pass. Local visual evidence is saved under
`audit/2026-08-05/evidence/`; the unauthenticated production route correctly
stops at Coach-first rather than rendering a demonstration squad. This does
not create market values, enable an external source, apply migration 050, or
promote the official domain.

The ClubHub lineup zoom now consumes the same active-contract boundary. Its
stored tier and approved England nominal price therefore remain aligned with
the exact card itself; only public, unowned cards remain subject to the
verified-value read model. Latest safe checkpoint: `18134f7f`.
