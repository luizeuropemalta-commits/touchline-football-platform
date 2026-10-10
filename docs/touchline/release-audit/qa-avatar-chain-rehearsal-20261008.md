# QA avatar chain rehearsal — 8 October 2026

Status: **QA chain and private bucket installed and verified; customer activation and release still pending**.

## Exact scope

- Repository: `/Users/luizlopez/Developer/touchline-release-candidate-20261007`, detached `8cd7eae73a584c2781aea3b2a446410189c80429` plus the preserved working-tree changes.
- Only target: QA `xgxbwqxjssxxuihuwmgy`, PostgreSQL 17.6, executor `postgres`, `rolsuper=false`, `rolcreaterole=true`.
- Generator: `scripts/build-qa-avatar-installation.mjs`; generated SHA-256 `aef084b5afba235d4df15ebf5215c574a4dd4c197519cc21e20af6a20b97b4eb`.
- Four input SQL files are hash-pinned by the generator. Business function bodies remain byte-identical. No Storage bucket, history entry, upload or provider call is included.
- Independent read-only reviewer `mobile_black_audit` gave GO only for a single-session, single-transaction ROLLBACK rehearsal; no COMMIT or release approval.

## Execution and recovery

Fresh PGlite tests `touchline-qa-avatar-installer.test.mts` and `touchline-avatar-migration-capability.test.mts` ran with the installed PGlite module: **3 PASS, 0 FAIL, 0 SKIP**. These include synthetic commit, ACL, operation publication, rollback and late failure; they do not replace the full QA057 compatibility matrix.

Fresh hosted preflight confirmed no avatar writer/creator/schema, zero active cron, and predecessor function hashes:

- Owner scenario apply: `87c394d2aab5fab5245afbabe395d880`.
- Owner scenario rollback: `220269105527672ca229726640809e04`.

CLI executes all SQL as one argument using `supabase db query --linked --project-ref xgxbwqxjssxxuihuwmgy`. Two preliminary invocations failed argument validation before SQL execution (leading SQL comment interpreted as a flag; missing `--linked`). Corrected invocation completed with exit 0.

The actual rehearsal strips only leading comments and adds a final observation SELECT before the existing ROLLBACK. Its SHA-256 is `1d63f68f76530abdffd926f3a3603fd1316b8edeae3e8a62aa3a16ae64e37729`.

Observed inside the transaction: executor postgres, **13 private helpers**, **0 writer memberships**, public publish v2 EXECUTE denied to anon/authenticated and allowed to service_role. The generator also asserts private-helper ownership, no anon/authenticated execution, no remaining creator and no writer schema CREATE.

Independent postflight through the Supabase connector at 18:12 UTC: writer/creator/schema all NULL, added avatar/QA057 columns count 0, both predecessor hashes unchanged, active cron 0. Thus the full DDL chain was undone, not installed permanently.

## Remaining gates

### Additional local proofs at 18:21 UTC

The real QA057 compatibility harness (`scripts/avatar-qa-compatibility-harness.mjs`) loads 17 unchanged business migrations, QA001/003/057 and the canonical compatibility matrix. The only platform shim is synthetic Auth; checkout/release/profile-trigger business functions are real. Fresh execution of `touchline-avatar-qa-compatibility-runtime.test.mts` with `TOUCHLINE_AVATAR_QA_COMPATIBILITY=1` and the existing PGlite runtime passed **4/4, zero skipped**. Before/after digests of 12 business tables matched. This is not hosted Storage or authenticated-browser proof.

The independently scoped disposable PostgreSQL runner `outputs/card-review-20260921/verify-avatar-recovery-postgres-20261008.mjs` (in the coordination workspace) ran against the current checkout and cached PostgreSQL 17.6 image `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`. **15 groups passed**: executor capability, canonical recovery matrix, public-role denial, service-role direct-table denial, writer minimum privileges, five deterministic two-connection races, lost begin/fence/publish response recovery, and real signup profile trigger/service upsert. Race checks observed the expected locks. Source hashes stayed unchanged. The owned disposable container was verified absent after cleanup; all 94 child processes closed. No ports, network, bind mounts or hosted user writes were used. Connection-loss recovery is not server-restart durability proof.

Independent review rejected treating hosted `apply_migration` as proven atomic for DDL plus history. Installation must use the explicit single-session BEGIN/payload/history INSERT/COMMIT envelope, with a failing-history-insert regression and exact pre/postflight. No automatic retry after an ambiguous response.

1. Local real QA057 and PostgreSQL recovery/profile-trigger proofs above passed; preserve their scope limits and include the new tests in the final integrated run.
2. DONE below: reviewed atomic installation/history envelopes and private bucket installed only in QA, with rehearsal and independent postflight.
3. Validate actual authenticated upload and preservation/recovery before enabling the feature.
4. Final integrated suite/build, exact clean candidate and hosted release/browser proof remain separate gates.

## Permanent QA installation, 18:35 UTC

The reviewed `build-qa-avatar-history-envelope.mjs` passed two real PGlite tests with no skips, including a failure raised by the final history INSERT. Its hosted rehearsal passed and an independent SELECT confirmed zero new schema/roles/columns/history, with original predecessor hashes intact. The same SQL with only final ROLLBACK changed to COMMIT then installed version `20261008183200`, name `touchline_qa_avatar_atomic_install`.

- Rehearsal SHA: `d6720797194f426712ebb5ef24ae79210e780daf2753f9274038d77c4b385a75`.
- COMMIT envelope SHA: `64d727db04b8414a9a1596cf5adaab2cc1448a38e7558d88f9300f637e1615df`.
- Stored payload SHA: `c690f30ee423affe8774c876f4e1e5566e04dc83f911b5c2bb557b696d33576e`.

Users and QA scenarios were locked and compared by complete ordered-row digests, excluding only the three newly added columns. All revisions were zero. Independent postflight confirmed the exact history hash, 13 writer-owned helpers, zero memberships, no creator, no writer schema CREATE, no anon/authenticated helper or public-RPC execution, service-role RPC execution, zero receipts/operations and zero active cron. New QA057 function hashes are `b2ec1de447878dcec22d22a2fa5eec5a` and `d5158f470a643641d4bd169f49842bcd`.

## Bucket installation and actual Storage probe

`build-qa-avatar-bucket-envelope.mjs` received independent conditional review and passed two PGlite tests, including history-insert failure recovery. Hosted ROLLBACK plus independent absence checks passed before COMMIT. Version `20261008085216` preserves its original source identity; it was deliberately installed after the later-numbered chain prerequisite. Future migration reconciliation must account for this non-chronological installation, not blindly replay files.

- Bucket source SHA: `1a5a7c9609c9d5cb5a0636ad01e0885799c5ce574a12850497521a18348bc7a0`.
- Bucket payload SHA: `80723154be919bec0a51d8d9282f9f2dd81553cf696087f37118404bf3009fdf`.
- ROLLBACK envelope SHA: `b4535739358028ff18ea98bcf6e640e80de9eeccdd46214098576359b6e14b76`.
- COMMIT envelope SHA: `ca7b1c09e0db3f7d168781172195ef63e591e9823005142d6cf5189612f1f2c4`.

Independent postflight: private bucket, 5 MiB input ceiling, WebP only; exactly two avatar policies, INSERT/SELECT service_role only. Existing two social-drafts policies unchanged. No user-facing upload flag enabled.

Actual QA REST probe using the real storage adapter exposed two defects absent from mocks: automatic Brotli negotiation made the strict bounded reader reject bucket metadata; duplicate create returned HTTP 400 with `{code:KeyAlreadyExists,error:Duplicate,statusCode:"409"}`. Narrow fixes request identity encoding (still reject a compressed response) and accept only that precise 400 envelope before mandatory exact readback. RED-to-GREEN regressions and all **28 storage tests passed**, zero skips; independent code review found no blocker in this delta. TypeScript passed.

Fresh hosted probe then passed create, exact readback, duplicate/replay readback and private reader using one synthetic 32px, 80-byte WebP and UUID namespace whose actor was confirmed absent from users. Anonymous authenticated-object and public-object URLs both denied access (HTTP400), after the service positive control. Only the exact synthetic object was deleted through Storage API and absence verified by listing, then SQL independently confirmed objects/operations/receipts all zero. This is not an authenticated customer upload or retention-worker proof.

No production change, synchronization activation, user photo update, new deployment or `.com.br` alias change occurred. Retention authority/worker, customer UI and complete release gates remain open.

## Retention follow-up — 8 October, after 19:00 UTC

Three forward schemas were installed together in QA after independent review and
an explicit hosted ROLLBACK rehearsal. The single transaction includes all three
history inserts. Local PGlite tests injected failure into the third history
insert and proved rollback of prior history and DDL; a successful control passed.

| Migration | Stored payload SHA-256 |
| --- | --- |
| 20261008184109 retention authority | 0558ca6293dc4599646d345139fc8c1a5d47a0ca557d2dd06c5bd8a85f7580a8 |
| 20261008185454 retention journal | bb5e51599ed447665e275230318c15a57b4dd9efc1328d5e55b1b6914c65def1 |
| 20261008190028 retention discovery | 4e9c138cf98d227262da739773a7664d070039ff8d60b1e8b08efe99ef3a2896 |

ROLLBACK envelope: `9f7a57599e94481000404c8dc36908d9b324ede923219581e2eb2aa6c4ef93c8`.
COMMIT envelope: `6980490cb7c5064fcbc0676711e60a54256739dd02067d7e41710bb97c5abc44`.
Postflight verified 14 service-only RPCs, four private RLS tables without direct
anon/authenticated/service-role grants, and all 13 prior writer helpers intact.
Existing users/scenarios were protected by in-transaction ordered-row digests.

The local worker/list/RPC/server and SQL suite passed 41 tests, no skips, before
one further native-HTTP regression was added. Exact synthetic Storage deletion
preserved both neighbouring objects. A cached download initially obscured
absence; metadata and a fresh cache-busted read confirmed removal. Only the
three synthetic keys were cleaned. This is transport proof, not customer proof.

Manual empty QA calls exercised SDK and native RPC/server compositions: HTTP200
with aggregate zero counters, unauthenticated401, zero Storage requests and no
profile writes. The independent postflight then found operations, receipts,
objects, candidates, attempts and scans all zero; discovery claims=3. There are
two existing cron definitions, both inactive (earlier shorthand `cron0` means
zero ACTIVE jobs, not zero definitions). No retention cron exists.

### Native Deno entrypoint proof

`supabase/functions/touchline-avatar-retention/index.ts` is prepared, not deployed.
It defaults OFF, captures only the QA URL/key/flag, rechecks them at each boundary
and retains one handler per isolate. No platform JWT bypass is configured.

Deno2.9.6 was executed through a pinned npm tool outside the repository, with no
manifest/lockfile change. Twelve server/RPC tests passed in that runtime. The
native loopback HTTP probe initially reproduced a real400: Deno represents a
bodyless POST as a stream containing a zero-byte chunk before EOF. The fix
authenticates first and proves EOF within eight zero-byte reads/one second,
rejecting any actual content. Local Node regression10PASS and Deno12PASS.

`scripts/verify-avatar-retention-edge.mjs` then passed five native HTTP modes:
missing/OFF/foreign/invalid-key503 without outbound calls; enabled200 with exactly
two fixture RPCs, unauthorized401, and environment drift503 with no later calls.
External network is prohibited by Deno permissions; only loopback and repository
reads are allowed. No real secret/database is used in this probe. Deno warns
that its legacy request signal aborts after successful responses; internal
deadlines remain necessary and this is not a client-disconnect guarantee.
Independent review gave local composition GO, not hosted activation/release GO.

Remaining: immutable reviewed candidate, hosted function/budget/periodic job
verification, UI selection wiring and authenticated customer upload/persistence,
then complete site release gates and remote smoke. Upload/selection and recurring
cleanup remain OFF; no website deployment or production change.
