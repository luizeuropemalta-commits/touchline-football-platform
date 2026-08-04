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
| 4 | Coach-first onboarding | EXTERNAL_HARD_GATE | Arena/Market coach gate | `74fe6cae` | local controlled validation | migration 047 remote | Apply reviewed non-financial migration then cross-device validate |
| 5 | Migration 047 | EXTERNAL_HARD_GATE | Supabase coach persistence | reviewed migration | local review | production DB privilege | apply/rollback/verify under controlled access |
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
| 26 | TouchLine Central, Inbox and notifications | EXTERNAL_HARD_GATE | Inbox/API | `28b17b0f` | 611 suite + local desktop | migration 043 remote | apply migration then validate durable receipt |
| 27 | Admin | COMPLETE | Admin routes | isolation | admin tests | none (controlled admin persona is consolidated in Block 35) | regression-only |
| 28 | Localisation | COMPLETE | i18n, ClubHub and Player Profile cards | Preview smoke found and corrected partial `pt-BR` card labels, English card-discipline labels, English country-fallback text and a server-rendering language flash in nested Player Profile feed cards. Commits `78b5af5d`, `918d90c8`, `b3b2e418`, `5fb122e8`, `a0c80dac`. The authorized branch Preview now immediately reports 2 Portuguese disciplinary groups, 3 `Clube atual` labels and zero English fallbacks. | focused 2/2; TypeScript; ESLint; full 625/625; production build pass; authorized Preview immediate DOM pass | none | regression-only |
| 29 | Responsiveness | EXTERNAL_HARD_GATE | responsive surfaces | CSS verified; real ClubHub confirmed in native Safari/WebKit desktop locally and browser-authorized Preview at 1280px and 656px. | static + desktop + local native WebKit evidence | controlled phone portrait/landscape and remote-Preview WebKit under Vercel SSO | run the controlled cross-browser/device matrix; do not infer phone results |
| 30 | Accessibility | EXTERNAL_HARD_GATE | shared pitch/card modal/global controls | Added labelled semantic pitch groups; restored visible keyboard focus for textarea, select and tabindex controls; card zoom now transfers focus to Close and returns it to its trigger. Files: `TouchlinePitchSurface.tsx`, `TouchlineCardZoom.tsx`, global CSS, accessibility contract test. | TypeScript, ESLint, focused 6/6, full 621/621 and production build pass. Browser keyboard automation did not advance focus in the local in-app browser. | controlled native WebKit/assistive-technology matrix unavailable | validate keyboard and screen-reader behavior after controlled device access |
| 31 | Performance | COMPLETE | public routes: Arena, Live, Market, Tables, ClubHub, Player Profile | Warm local production reads completed with gzip. No critical local route failure or uncompressed client chunk issue found. ClubHub's 1.08 MB uncompressed streamed HTML is 91.6 KB over gzip because it renders real card markup; this remains a monitored payload, not a safe candidate for content removal. Evidence: local performance report. | Three warm reads per route: all HTTP 200; TTFB 3–11 ms; totals: Live 228–506 ms, ClubHub 290–381 ms, Player Profile 245–279 ms; production JS route chunks are 9–24 KB. | none (production observability is a post-promotion measurement) | regression-only |
| 32 | Error and loading states | COMPLETE | ClubHub/Arena | safe empty/error states | 70 tests | none (native visual evidence is Block 29) | regression-only |
| 33 | Testing | COMPLETE | suite | Added a deterministic ClubHub delivery contract: the first six visible squad cards may load eagerly while all remaining squad and lineup card art is deferred. File: `tests/touchline-club-hub-resilience.test.mts`. | TypeScript, ESLint, focused 8/8, full 625/625 and production build pass. | none (controlled account E2E is Block 35) | regression-only |
| 34 | Deployment | COMPLETE | GitHub/Vercel | Dedicated SSH publishing key registered under the authorized GitHub account; branch pushed; Vercel project `touchline-arena-official` (`prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`) connected to `luizeuropemalta-commits/touchline-football-platform`. Authorized branch Preview is serving the current commit. | Local build; Vercel Preview and real-application smoke pass. | none (production promotion is Block 35 acceptance) | regression-only |
| 35 | Final real-product audit | IN_PROGRESS | Vercel Preview / later `touchline.com.br` | Authorized Preview matrix confirms the real application, not Audit Mode: login/register/recovery surfaces, expected protected-route returns, Live, tables, card rankings, ClubHub and Player Profile all render; the retired demo ClubOwner route reaches the safe 404 boundary. Browser validation confirms real Manchester United ClubHub data at 1280px and 656px, and opening/closing the real card-detail dialog returns focus to its trigger. The player-profile sweep corrected all card SSR localisations, including the nested feed card. The current branch Preview immediately reports 2 Portuguese disciplinary groups and 3 `Clube atual` labels with zero English fallbacks. Native Safari/WebKit desktop on the local production build confirms the real lineup and approved dual player-name presentation (inside and above cards). Screenshots are retained locally. A repository search found no safely reusable provisioned test mailbox, credential fixture or account-seeding command. Unauthenticated HTTP is intentionally redirected by Vercel Preview SSO, so it is not treated as a product route failure. Evidence: `audit/2026-08-04/TOUCHLINE_VERCEL_PREVIEW_SMOKE_2026-08-04.md`. | focused 2/2; TypeScript; ESLint; full 625/625; production build pass; authorized Preview immediate locale smoke pass, including real card-detail interaction; local native Safari/WebKit visual pass. | Full journeys A–F require isolated controlled account credentials and real-email confirmation; native phone portrait/landscape and remote-Preview WebKit require a controlled device/browser matrix. The official-domain pass requires deliberate production promotion after those Preview gates pass. | Continue independent Preview public-route smoke and accessibility-static checks; do not promote while any controlled-persona or device result is unresolved. |
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

Latest safe commits after checkpoint: `eb79bb12`, `ca182d1d`, `ab608662`, `88bc9f35`, `28b17b0f`, `2653a0c8`, `a42ef0ec`, `4a88b974`, `470d9593`, `b1491c1c`, `c4e47484`, `f2bc14cb`, `7940994b`, `eac3e1da`.
