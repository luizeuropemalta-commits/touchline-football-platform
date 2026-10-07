# Remaining-site localization review — 2026-10-07

## Latest owner workflow supersession

Owner explicitly requested the next page, Cadastro/register. This supersedes the instruction to finish Live before proceeding. Live remains PARTIAL with its running capture and independent findings; it is not approved by changing priority. Current task is read-only reconciliation of registration evidence, no second browser/server/process. See `register-visual-review-20261007.md`. Administration stays EN/PT and unchanged.

## Owner scope supersession and current execution handoff

Later owner decision supersedes the broad historical plan below: Administration (its login and12pages) stays existing EN/PT and is excluded from eight-language review. Exact user-facing scope16 pages: login, register, forgot, reset, intro, Live, club directory, club profile, coach profile, player profile, rankings, card rankings, ClubOwner, football-search, inbox, notifications. Technical QA/audit/rehearsal routes are not separate eight-language product pages. Shared errors/loading/navigation belong to the relevant user page. Do not infer separate My Club/fantasy page coverage beyond current ClubOwner flow without reconciling owner list.

Page-by-page rule: finish Live before selecting another page. Earlier22-image proposal below is SUPERSEDED by prepared120 captures: all8 × desktop1440×900/phone844×390/tablet1024×768 × empty/selected/stale/loading/error. Guest match-detail/events/lineups and notification-dialog states remain explicitly outside this first transport-state capture set and must be reconciled before any whole-page approval. Login prior sample is owner-accepted; other auth pages are not treated complete merely from samples.

The3 approved new fixture/data/capture files below are prepared. Sole no-env dev server is Ready at3217, session87688, remote network denied by process sandbox;3audio source files were synchronized by root before start. No canonical UI source edit. Parent launches finite capture via Codex Process Jobs because its skill requires parent process ownership; no browser launched by this subagent. Pending screenshots are not PASS. After capture this agent inspects every image and records exact remaining page criteria. Administration remains unchanged.

## Result and scope

PARTIAL. Read-only reconciliation, not a site-wide localization PASS. The latest ledger records 4682 passing local tests after legacy retirement; that is not rendered eight-language proof. No server, browser, build or test was started in this preparation. No public draft gate, account, media or product source changed.

Reviewed CURRENT_STATE/CURRENT_EXECUTION_LEDGER, the owner eight-language plan in workspace outputs/card-review-20260921/site-eight-language-plan-20261002.md, canonical local-verification receipt, and durable auth incremental/linguistic receipts under artifacts/local-verification-20261007. Historical plan implementation gaps are not assumed current: current route/component seams were inspected.

## Real coverage matrix

All-eight means en-GB, pt-BR, es-ES, it-IT, fr-FR, ar-SA, tr-TR, de-DE. U = rendered proof still missing in this reconciled evidence, not a demonstrated defect.

| Current surface/state | Eight-locale evidence | Remaining requirement |
|---|---|---|
| Login initial and limited error/RTL recheck | Prior rendered samples; do not repeat | Public locale routing, persistence/account transitions, comprehensive error/a11y/device matrix |
| Register/forgot initial | Prior desktop samples | Five locales lack responsive secondary-auth matrix; submit/pending/error/completion not covered |
| Reset checking/invalid/ready | All-eight desktop; AR/FR/DE responsive sample | Pending/mismatch/complete/503, portrait, keyboard/zoom; actual recovery is separate |
| Live empty/current/stale/finished/detail/alerts | U in all eight | Selected match, freshness, long labels, dates/timezone, RTL, rail selection and guest states |
| Rankings and player-card rankings loading/empty/published | U in all eight | Podium/cards/tables/tooltips/counts and private authority-safe fixtures |
| Club directory and club profile | U in all eight | Names, navigation, fixture preview, squads/coaches and unavailable states |
| Player and coach profiles | U in all eight | Stats, positions, dates, season choices, no-card/no-history/error states |
| ClubOwner/Market, My Club, fantasy | U in all eight | Selection/swap/lineup/bench/navigation and errors without real allocation writes |
| Football search | U in all eight | Idle/query/loading/results/empty/error and accessible result names |
| Inbox/notifications/rehearsal | U in all eight | Guest/account/empty/error/read states; consent and real delivery separately gated |
| Intro and shared navigation/audio/locale controls | No full-eight current-flow proof | Current intro must remain intact; audio is another agent's active ownership |
| Error/404/offline/metadata/PWA and customer-visible admin | U in all eight | Document language, role boundaries, status variants and formatting |

Auth receipts explicitly limit private fixture HTML to English, synthetic recovery, non-native-device viewports and no authenticated persistence. They cannot approve document-wide language accessibility or the remaining site.

## Selected next slice: Live / Match Centre

Highest-value safe independent slice: current owner-priority Live UI, rendered with the real `components/touchline/match-centre/TouchlineMatchCentre.tsx` and its real CSS. Existing props at lines47–59 accept initial fixtures, fixed time/timezone, locale, guest context, metadata and explicit draft opt-in. This avoids `app/live/page.tsx` SSR authentication and schedule/season/detail loaders (lines68–100). Public renderer remains false-default (lines44–48).

Initial matrix: desktop1440×900 empty + selected-stale for all8 =16; selected-stale Arabic/French/German at phone844×390 and tablet1024×768 =6; total22. Empty is a positive localized-message assertion, not absence-only. Selected has two synthetic eligible fixtures with clearly artificial names, allowing first→second→first selection on the real rail before capture. No official result is invented or published. Native touch, portrait, details/events/lineups, live-upcoming-finished variants and alert dialogs remain later slices.

Network contract: install interception before goto; exact GET `/api/football-data/fantasy/livescores?snapshot=1` fulfilled with `{ok:true,data:[synthetic fixtures],state:"partial-persisted-schedule",degraded:true,fetchedAt:<fixed ISO>}`. Component validates metadata and merges data at lines366–394. Positive readiness requires the response ledger, visible localized degraded state and a real rail selection transition; empty requires exact localized noFixtures text and zero fixture buttons. `canReadMatchDetail=false` prevents detail GET (line316). Fixture alert GET occurs only after opening its dialog; do not open or change subscription (TouchlineFixtureAlerts.tsx21–26). Block every other API, non-GET/HEAD method, non-local request and navigation outside the fixture. Any unexpected attempt fails the harness, never silently reaches a backend. No submit, notification, cookie authority or permission changes.

Draft locale evidence: assert the real language select value and independently expected localized currentFixtures/noFixtures labels, rather than adding fake lang/dir onto the actual component. The Match Centre main currently has no own lang/dir (line442), toolbar/header deliberately LTR (443/447). Record inherited document direction honestly and visually inspect Arabic before classifying it. Query `fixtureLocale` is necessary because public proxy normalizes draft `lang`; do not alter proxy. Locale-menu navigation itself is outside this fixture's scope.

## Proposed exact artifact manifest and serial execution

Approved preparation only; no execution slot yet:

1. `/private/tmp/touchline-retirement-build-20261007.KkL7Mm/app/locale-live-fixture-local/page.tsx` — new snapshot-only page importing real Match Centre.
2. Same directory `fixture-data.ts` — new typed, explicitly synthetic fixtures and fixed clock, no provider or DB.
3. `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-localization-capture.mjs` — new external capture harness, one Chromium/context, serial22, fresh cleared guest state, screenshots/report/request ledger.
4. This receipt only in canonical repository.

After root grants slot and serves the updated isolated snapshot: `node /private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-localization-capture.mjs`. No browser installation, second server or implicit production environment. Existing production build cannot discover a new fixture without root-controlled refresh/build or dev-mode choice. Root must synchronize the separately owned audio change first because real PageControls includes AuthAmbientAudio; this agent does not edit/mock it. Inspect all22 PNGs after runtime completion and hand text subset to the independent linguistic reviewer.

## Mission gate

MISSION: remaining-site evidence reconciliation and bounded visual plan. SCOPE: read-only product; receipt plus separately approved future local fixtures. QA branch/commit/deployment: not selected. Remote budget/consumed:0/0. Functional/visual/responsive/a11y results: NOT RUN for new Live slice. Security: no credentials/accounts/data or external actions. Tests/build: none repeated. Observability: planned exact request ledger and console/page errors; not yet evidence. Open finding: full-site coverage incomplete; APPPROVAL REQUIRED for execution slot. Production: NOT TOUCHED. Code-verification skill loaded and its evidence matrix applied to source/artifact review, not claimed browser execution.
