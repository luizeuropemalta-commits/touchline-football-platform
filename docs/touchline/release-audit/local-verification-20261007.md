# Local verification — 2026-10-07

## Confirmed completed checks

- Final complete `.test.mts` suite after QA seam/framing: **4,732 PASS, 0 FAIL, 0 cancelled, 0 skipped, 0 todo**, 15 suites, 297075.414708 ms. Root pipeline58997 exit0, including subsequent canonical TypeScript and ESLint. Earlier baseline15350 was4729PASS and is retained as historical evidence, not the final source result.
- All three disposable SQL runtime variables enabled; locale and rehearsal browser tests enabled; XI mode `all` includes normal and diagnostic cases in the same run, with no name filter.
- Local Playwright tooling and ClubHub CSS/component-host matrix: **32/32 PASS** across the eight configured browser/viewport projects, session6925 exit0. This is not a complete authenticated site audit.
- Fresh post-final-edits TypeScript (`--noEmit --incremental false`) and full ESLint checks: final pipeline58997 exit0, zero errors, four existing `<img>` optimization warnings. Earlier82883 also passed.

Canonical HEAD is `d84d19181606baa898d468510d8e4750a2525d4f` with preserved, uncommitted working-tree changes. These results are local working-tree evidence, not a clean committed release candidate or deployment approval.

## Reproducible test configuration

Runtime used: `@electric-sql/pglite@0.5.8` at `/private/tmp/touchline-test-runtime-20261007.1UPtcv/node_modules/@electric-sql/pglite/dist/index.js`.

Set `TOUCHLINE_FANTASY_PGLITE_MODULE`, `TOUCHLINE_STUDIO_PGLITE_MODULE` and `TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE` to that path. Set `TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1`, `TOUCHLINE_RUN_REHEARSAL_BROWSER_TESTS=1`, `TOUCHLINE_RUN_XI_BROWSER_TESTS=1`, `TOUCHLINE_DIAGNOSE_XI_KEYBOARD=all`, `TOUCHLINE_XI_BROWSER_SCOPE=full`.

Run `node --test --test-concurrency=1 --test-timeout=180000 --experimental-strip-types --test-reporter=spec --test-reporter-destination=<new-log-path> tests/*.test.mts` from the canonical repository. No environment file or real provider/account credential is required for this run.

Durable local log: `artifacts/local-verification-20261007/full-local-all-modes.log`, SHA-256 `56535b005ac753ea97d15b15de2c1e8ec76994474697173028f948baf4ffc12d`.

Final superseding log: `artifacts/local-verification-20261007/full-local-final-qa-seam.log`, SHA-256 `a91bb8815487ffc01dc68125a9888dfb0af60b162cd9577691098d946bf1f718`.

## Environment incident and recovery

An earlier run stalled importing a PGlite file in Documents. `ls -lO` confirmed `hidden,compressed,dataless`; owned parent67452 and child67801 were terminated, and that run is not counted as passing. The exact cached package integrity was read from the local pnpm store. A separate temporary package/lock restored it with `pnpm install --offline --frozen-lockfile --ignore-scripts`: reused1, downloaded0. Repository package/lockfiles and macOS cloud services were not changed. Fresh SQL composition5/5PASS preceded the final complete run.

## What changed within this test closure

- Real module dependencies and aliases restored in browser fixtures, retaining network, identity, consent and one-shot assertions.
- Locale browser assertions now distinguish confirmed stored English restoration from an unconfirmed pending Portuguese change, instead of incorrectly expecting empty storage.
- XI keyboard diagnostics use an independent native control to choose the navigation key before product mounting; target focus remains mandatory. An explicit `all` mode executes both matrices without skips.
- Obsolete ClubHub test markup replaced with an explicitly bounded reusable-component host and current fixture/table topology; no product CSS changed to satisfy tests.
- AuthLayout Arabic marketing/footer/aside direction repaired locally without reversing the page grid. Arabic registration notice uses logical `text-start`, with RED-to-GREEN regression coverage.
- Earlier linguistic and historical-test-contract repairs remain part of the tested working tree; historical missing baselines were not fabricated or rehashed as recovered evidence.

## Still separate from this result

Secondary-auth incremental capture completed exit0: 37 images, including 18 reset-state captures in six locales and 19 Arabic banner/AR-FR-DE landscape images. Two independent reviewers inspected all37: Arabic logical alignment confirmed, no visible clipping/control collision or concrete blocking linguistic defect in this sample. Turkish CTA register consistency remains an optional P3 editorial suggestion, not a demonstrated error. Six synthetic GET401 console messages were individually correlated with the intended invalid-recovery state; zero unexpected console errors, page errors, writes, blocked requests or horizontal-overflow candidates. Private-fixture HTML stays English; this evidence does not prove document-wide locale accessibility or public locale routing.

Credential-free technical build **PASS, session94200 exit0**, in `/private/tmp/touchline-build-20261007.rkmXk3`, copied from current canonical source with no experimental auth fixtures or environment files. Next16.2.11 webpack compilation23.7s, TypeScript11.0s, static generation140/140, trace collection completed. Existing public/node_modules/artifacts shared through symlinks; process sandbox denied network and writes into canonical repository. Canonical `.next` preserved. Post-build checksum comparison found no input differences except this report, updated during the build. This is not a deployable target-configured artifact: shared dependency/asset tracing and absent target public environment differ from release packaging.

Fresh read-only mission-governance check PASS and release-readiness check `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL`, both exit0. Remaining-browser audit corrected an earlier assumption: frame-decode/crown use an existing genuine-localhost route exemption and can run locally without admin credentials; three legacy Arena specs instead have outdated route/DOM expectations, not an inherent hosted-QA requirement. They remain unapproved pending explicit contract reconciliation and execution.

### Subsequent browser findings — not included in the earlier green suite

- Frame decode supported projects: 2/2 PASS, zero skips; guarded localhost GET/HEAD-only ledgers clean.
- Crown initial matrix: 5 unique-leader failures and 5 nominal tied passes. All10 made zero ranking API requests, so tied absence is vacuous and is not accepted negative-control evidence. Real parser independently accepts the unique mock and rejects tie eligibility. Existing `/visual-qa` inherited-leadership denial prevents this old fixture consuming its ranking. Narrow explicit fixture repair under independent review; shared inherited-authority guard must remain unchanged.
- Public-launch test updated to current `/intro` and guest ClubOwner→login contract, independently source-reviewed. Initial Chromium execution95494: 3 PASS, 1 failure on post-skip URL; captured dev UI says Compiling. Cause/recovery remains under investigation, not waived or counted PASS.
- Two deeper retired Arena tests (canonical-club registry and mobile dynamic containment) still require an explicit prospective coverage decision. Do not substitute static geometry or guest redirects for their former authenticated/live acceptance. Owner asked asynchronously whether to replace them with documented current-flow contracts; no response presumed.

### Follow-up correction and production-mode validation

- Explicit crown QA input added only for exact `/visual-qa/player-leader-crown`, non-editable cards and the real ranking parser/eligibility chain; default absent, inherited-leadership guards unchanged. Fixture GET is abortable, replay-safe and clears stale authority while refreshing. Shared Button used. New focused tests RED3/3 then GREEN3/3; with authority tests9/9PASS. Independent code/React review found no blocker, bounded to this seam.
- Public launch warmed dev rerun62626:11PASS1FAIL0skip. WebKit4/4 and Firefox4/4; Chromium3/4, with trace showing completed ClubOwner RSC, delayed login RSC and pending login JavaScript. No test deadline increase or forced navigation used. Browser-production recheck pending.
- Updated local technical build15169 **PASS**, webpack14.5s/TypeScript13.1s/static140of140. Reused isolated snapshot, synchronized only task-owned source/tests; network and canonical writes denied. Stopped root-owned dev7083 cleanly. Production-mode server44908 now serves the updated snapshot at127.0.0.1:3217, no credentials and outbound restricted to localhost. Initial sandbox profile rejected numeric IP syntax before server launch; corrected to supported localhost selector, no restriction removed.
- Crown/frame browser recheck delegated serially; final integrated suite must be repeated because the shared card source changed after the original4729PASS evidence.

### Latest bounded outcomes

- Public launch on production-local build: session32577, **12/12 PASS, no skips**, Chromium/WebKit/Firefox. Original dev failures remain recorded; no timeout relaxation.
- Crown final framing: session12453, **10/10 PASS, no skips**, all five applicable Chromium viewports. Each positive case consumes three responses (unique→tie→unique), each initial tie one; same page/document and zero writes/remote requests/console or page errors. Independent reviewer inspected all five PNGs; root additionally inspected desktop1280. Card bottom and crown fully visible, real frame/crown centers aligned. Final geometry assertions now prevent the previously observed wrapper shrink and clipping.
- Latest production-mode local build50254: **PASS**, compile10.0s, types11.3s, static140/140. Final server97409 bound only127.0.0.1:3217; previous server44908 stopped before rebuild/restart.
- Frame2/2 and tooling/ClubHub32/32 remain valid within their documented scope. Combined distinct applicable standalone browser cases approved so far: **56**. Two other standalone legacy specifications remain unresolved, not skipped or approved.
- Final all-mode suite and canonical types/lint pipeline session58997 **completed exit0**:4732PASS0FAIL0SKIP; types clean, lint0errors4existingwarnings. Durable final log and hash above. `git diff --check` also passed.

## Mission completion gate — partial verification, not mission completion

MISSION: close local test and scoped language/visual defects. SCOPE: documented auth/localization/test-fixture fixes and read-only isolated validation; no release mutation.

QA BRANCH / QA COMMIT / QA DEPLOYMENT / STABLE QA URL: no new candidate selected, committed or deployed. Canonical detached HEAD plus preserved existing dirty work remains; a clean release manifest is not established.

REMOTE BUILD BUDGET / CONSUMED: no remote build initiated in this verification; consumed0. All builds above are local.

FILES CHANGED: prior scoped localization/auth/test changes documented above; latest closure adds optional exact-route QA ranking seam in `components/touchline/cards/TouchlineEliteExactCard.tsx`, `app/visual-qa/player-leader-crown/page.tsx`, new `PlayerLeaderCrownFixture.tsx`, new QA-seam regression test, and the two named crown/public-launch browser specs. Shared leadership provider/guard, real accounts, data and publication flags unchanged. Do not stage unrelated working-tree changes or generated evidence blindly.

FUNCTIONAL RESULT: scoped automated cases and synthetic recovery chains as recorded; no real account/password/notification mutation proof.
VISUAL / RESPONSIVE RESULT: reviewed login, secondary-auth37 and crown5 captures; not all-site eight-language acceptance.
ACCESSIBILITY RESULT: public-launch keyboard focus, portrait inert/rotation and labels exercised; full screen-reader/contrast/native-device audit not established.
SECURITY RESULT: disposable SQL and synthetic browser identities; no credentials copied, provider/payments/notifications enabled or inherited-authority restriction relaxed. No claim of broad security certification.
BROWSER MATRIX: applicable Chromium phone/tablet/desktop/TV; public launch also WebKit/Firefox; native iPhone/Safari receipt not established.
TESTS: final integrated4732PASS0FAIL0SKIP; separate standalone56applicable casesPASS; two legacy standalone specs unresolved. BUILD: latest technical local buildPASS; target-configured deploy artifact not produced.
OBSERVABILITY: process exit codes, preserved failed and passing traces/JSON ledgers, screenshot inspections, source hashes and independent receipts.
OPEN FINDINGS: two retired Arena contract replacements await owner direction; full-site eight-language audit, exact clean candidate, correctly isolated QA environment, hosted smoke/logs/persistence and release policy gates remain. Device notification consent/receipt remains separate. Production publication not authorized by these results.
PRODUCTION: NOT TOUCHED.

| Tool / skill | Relevant | Loaded | Executed | Result / evidence |
|---|---|---|---|---|
| Code work / code verification | Yes | Yes | Scoped fixes, test execution and independent agent reviews | Reports and exact checks above |
| React best practices | Yes, multi-TSX QA seam | Yes | Hooks/fetch/default/abort/derived-state review; shared Button retained | crown-explicit-qa-review.md and final PNGs |
| Local shell / process sandbox | Yes | Yes | Serial tests/builds, egress denial, checksums | Sessions and logs above |
| Browser / image inspection | Yes | Yes | Applicable Playwright matrices and actual PNG reviews | auth-incremental/ and crown-final/ under artifacts |
| Release preflight / Vercel gate | Context boundary | Yes | Local governance/readiness only; no remote deployment action | Not a release PASS |

Eight-language full-site approval is not complete. Login RTL and the37 incremental secondary-auth captures were inspected in local synthetic-guest fixtures. No public draft language gate was enabled. Remaining browser contracts/execution, real-device notifications, hosted database concurrency, target-configured build, exact candidate review and release gates remain separate. Remote protected visual-QA pages require legitimate QA authorization/session; existing genuine-localhost fixtures do not. No deployment or real notification was performed.
