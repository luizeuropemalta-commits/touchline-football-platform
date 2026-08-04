# TouchLine Full Product Recovery — Durable Execution Ledger

Authoritative mission: `FULL PRODUCT RECOVERY, CONSISTENCY AND PREMIUM COMPLETION` in `/Users/luizlopez/.codex/attachments/14d41325-a252-4ecc-8a6e-0ce47146f59b/pasted-text.txt`.

Checkpoint: `74fe6cae` (subsequent safe commits are recorded below). Safety: no Live Stripe, real payment, monetary wallet, financial migration, legal/tax decision, destructive production data change, or service-role disclosure. Resume protocol: read this file and `touchline-full-recovery-state.json`, inspect Git, then execute the first non-`COMPLETE` block whose next action is not an external or Luiz gate.

| # | Block | Status | Routes/modules | Defects/files | Tests / production validation | Blocker | Next executable action |
|---:|---|---|---|---|---|---|---|
| 1 | Global application shell and navigation | TESTED | shell, proxy, public routes | return paths audited | 42 route tests; public smoke | Native WebKit controlled validation | Continue independent blocks; retain WebKit evidence hold |
| 2 | Authentication | TESTED | login/register/recovery | safe callback flow | auth regression tests | real email/OAuth configuration | Validate controlled callback once configured |
| 3 | Personas, authorization and access | TESTED | protected routes/Admin | server guards | 24 isolation tests | full controlled persona matrix | Run remaining matrix safely |
| 4 | Coach-first onboarding | EXTERNAL_HARD_GATE | Arena/Market coach gate | `74fe6cae` | local controlled validation | migration 047 remote | Apply reviewed non-financial migration then cross-device validate |
| 5 | Migration 047 | EXTERNAL_HARD_GATE | Supabase coach persistence | reviewed migration | local review | production DB privilege | apply/rollback/verify under controlled access |
| 6 | Unified card economy | TESTED | Market/cards | GBP nominal tiers | economy tests | none | regress only if shared change |
| 7 | Coach reputation engine | TESTED | coach registry | pending historical classification | catalog tests | audited historical source | consume source when available |
| 8 | Player and coach card presentation | TESTED | cards/profiles | canonical card surfaces | visual desktop + tests | native WebKit evidence | independent visual validation |
| 9 | Card states | TESTED | card components | state consistency | component tests | none | regression-only |
| 10 | Squad builder | TESTED | ClubOwner/Arena | roster limits | squad tests | controlled complete-squad journey | validate when account fixture exists |
| 11 | Market | TESTED | Market Transfer | auth before team validation | Market tests | controlled real account | validate journey without payment |
| 12 | Club Hub | TESTED | ClubHub | official table checkpoint `2653a0c8` | 614 suite + desktop | mobile/WebKit evidence | inspect controlled responsive surface |
| 13 | Training Centre | TESTED | `/club-owner/[owner]/substitution`, ClubOwner training summary, Arena bench surface | Confirmed this is the production Training Centre / substitution flow, not the audit-only mirror. Route identity, private squad sections, lineup, bench and reserve-vault states remain intact. | Focused 41/41 route/navigation/visual-contract tests pass; local desktop route validation recorded. | Coach-first overlay correctly prevents a coach-less owner from progressing; durable cross-device coach confirmation remains Block 4/5 remote-migration gated. | Regression-only; validate the completed-squad journey after controlled Coach-first persistence is available. |
| 14 | Renewals, history and substitutions | TESTED | renewal/history/substitution | server-owned boundaries | renewal/history tests | financial fulfillment hold excluded | test controlled nonfinancial views |
| 15 | Frozen Club experience | TESTED | ClubOwner lifecycle | frozen predicates | lifecycle tests | controlled frozen account | validate view only |
| 16 | Arena | TESTED | Arena | coach gate/carousel | Arena tests | migration 047 cross-device | validate after migration separately |
| 17 | Shared canonical match state | TESTED | fixture state | canonical fixture selection | match tests | none | regression-only |
| 18 | Card event language | TESTED | cards/live | event labels | event tests | none | regression-only |
| 19 | Match Centre | TESTED | `/live` | fixture deep links | public production validation | WebKit evidence | native validation later |
| 20 | Player Profile | TESTED | player profiles | GBP display | profile tests | production publish credentials | publish pending external gate |
| 21 | Coach Profile | TESTED | `/touchline-coaches/[coach]` | checkpoint `ca182d1d` | focused tests + desktop | responsive/WebKit evidence | validate native devices |
| 22 | Club Profile | TESTED | ClubHub | roster/loading | ClubHub tests | responsive/WebKit evidence | validate native devices |
| 23 | Competition table | CODE_COMPLETE | ClubHub | checkpoint `2653a0c8` | 614 suite + desktop | production publish + responsive | await official finished fixtures then production validate |
| 24 | Rankings and statistics | CODE_COMPLETE | Tables rankings/statistics | Removed fabricated ClubOwner, England and player rankings; absent audited publication now has an explicit localized pending state. Files: `app/touchline-tables/page.tsx`, client/CSS, rankings i18n, `tests/touchline-rankings-publication.test.mts`. | TypeScript, ESLint, focused 6/6, full 618/618 and production build pass; local desktop + mobile visual evidence saved under `audit/2026-08-03/screenshots/recovery-local/`. | A first audited published ranking snapshot is required before production data validation. | Validate against the first immutable audited snapshot after it is published; do not reintroduce simulated standings. |
| 25 | Top 11 | CODE_COMPLETE | Tables Top 11 | `a42ef0ec`, `4a88b974` | 617 suite + local desktop | first audited snapshot / publish | production validate after snapshot exists |
| 26 | TouchLine Central, Inbox and notifications | EXTERNAL_HARD_GATE | Inbox/API | `28b17b0f` | 611 suite + local desktop | migration 043 remote | apply migration then validate durable receipt |
| 27 | Admin | TESTED | Admin routes | isolation | admin tests | controlled admin account | validate matrix |
| 28 | Localisation | TESTED | i18n | EN/PT checks | localisation tests | native visual evidence | validate native devices |
| 29 | Responsiveness | EXTERNAL_HARD_GATE | responsive surfaces | CSS verified | static + desktop | native WebKit/browser tooling | controlled cross-browser run |
| 30 | Accessibility | CODE_COMPLETE | shared pitch/card modal/global controls | Added labelled semantic pitch groups; restored visible keyboard focus for textarea, select and tabindex controls; card zoom now transfers focus to Close and returns it to its trigger. Files: `TouchlinePitchSurface.tsx`, `TouchlineCardZoom.tsx`, global CSS, accessibility contract test. | TypeScript, ESLint, focused 6/6, full 621/621 and production build pass. Browser keyboard automation did not advance focus in the local in-app browser, so native assistive-technology validation remains separate. | Native WebKit/assistive technology matrix | Validate native keyboard and screen-reader matrix after deployment access. |
| 31 | Performance | TESTED | public routes: Arena, Live, Market, Tables, ClubHub, Player Profile | Warm local production reads completed with gzip. No critical local route failure or uncompressed client chunk issue found. ClubHub's 1.08 MB uncompressed streamed HTML is 91.6 KB over gzip because it renders real card markup; this remains a monitored payload, not a safe candidate for content removal. Evidence: local performance report. | Three warm reads per route: all HTTP 200; TTFB 3–11 ms; totals: Live 228–506 ms, ClubHub 290–381 ms, Player Profile 245–279 ms; production JS route chunks are 9–24 KB. | Production CDN/device/network profiling unavailable locally. | Re-measure after deployment; keep ClubHub card rendering intact unless real-device LCP data proves a bottleneck. |
| 32 | Error and loading states | TESTED | ClubHub/Arena | safe empty/error states | 70 tests | native visual evidence | verify controlled states |
| 33 | Testing | TESTED | suite | Added a deterministic ClubHub delivery contract: the first six visible squad cards may load eagerly while all remaining squad and lineup card art is deferred. File: `tests/touchline-club-hub-resilience.test.mts`. | TypeScript, ESLint, focused 8/8, full 622/622 and production build pass. | Native WebKit plus controlled production-account E2E matrix | Run controlled production matrix after publish; retain all route-level contracts in every regression suite. |
| 34 | Deployment | EXTERNAL_HARD_GATE | GitHub/Vercel | local commits ready | local build passes | GitHub/Vercel credentials | publish reviewed commits |
| 35 | Final real-product audit | NOT_STARTED | touchline.com.br | — | full matrix | controlled accounts/deployment | run after publish/access |
| 36 | Acceptance standard | NOT_STARTED | all blocks | — | evidence review | depends on prior blocks | evaluate after 1–35 |
| 37 | Final report | NOT_STARTED | reports | — | consolidated evidence | depends on acceptance | generate only at completion |

Latest safe commits after checkpoint: `eb79bb12`, `ca182d1d`, `ab608662`, `88bc9f35`, `28b17b0f`, `2653a0c8`, `a42ef0ec`, `4a88b974`.
