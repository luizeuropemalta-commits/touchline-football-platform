# Avatar retention — explicit QA credential binding

Date: 2026-11-01. Owner: `avatar_notifications_finish`. Scope: local critical-engineering fix authorized by root; no remote mutation or credential retrieval.

## Finding and decision

Root reported the diagnostic package deployed as QA Edge v6 with `verify_jwt=true`: gate OFF produced `QA_RETENTION_FLAG_OFF`; the temporary enabled invocation at 23:24:35.758Z produced **`QA_RETENTION_KEY_FORMAT_INCOMPATIBLE`**. Root handles reverting that temporary flag. This subagent did not repeat those remote operations.

The code establishes that the captured built-in value failed the bounded, exact three-segment JWT check. It does not identify whether the value is opaque, contains whitespace, is malformed, or exceeds the length limit. Imports completed far enough to emit this application diagnostic. This is not evidence of an RPC, Storage or browser failure.

Current Supabase documentation still describes the legacy variable separately from the new JSON collections. Custom names cannot start with `SUPABASE_`; the implementation therefore does not attempt to overwrite that reserved variable. [Environment variables](https://supabase.com/docs/guides/functions/secrets).

The new opaque keys are not JWTs and require a different authentication contract. Legacy and new keys can coexist; migration is separately necessary before legacy retirement. Accepting an opaque key by deleting the current project/role checks would not be an equivalent fix. [API-key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

The Markdown changelog index was requested but the web reader rejected its MIME type; the HTML changelog and Edge/breaking-change views were inspected instead. No fetched notice establishes the exact value injected into this project. [Changelog](https://supabase.com/changelog?tags=edge+functions).

## Local change

Only `supabase/functions/touchline-avatar-retention/index.ts` changes production code:

- Read `TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY` first.
- If the variable is **present**, including an empty string, select it. Empty/invalid values fail closed; a valid built-in never rescues an invalid explicit binding.
- Only `undefined` selects the existing `SUPABASE_SERVICE_ROLE_KEY` path.
- The existing exact QA origin, JWT format, QA `ref` and `service_role` validator remains unchanged. So do constant-time bearer comparison, request gates, RPCs, Storage adapter, limits and journal logic.
- Capture selected source and value once. Addition/removal of the explicit binding invalidates a running operation even if the credential value would remain identical. Changes to the selected key, origin or enabled flag also fail before transport.
- A built-in that is not selected is neither read nor an authorization dependency. Rotation of that unused platform variable does not invalidate the explicit binding.
- No key, claims, hash of a credential, source name or exception is newly logged. HTTP remains generic; valid bootstrap remains quiet.

No `config.toml` is present in this candidate. The deployed `verify_jwt` setting is a separate remote configuration: root must keep it **true** when packaging this change. This source patch does not alter platform JWT configuration.

## Verification

Executed with synthetic credentials and fake transports only:

```sh
node --test --test-concurrency=1 --experimental-strip-types tests/touchline-avatar-retention-entrypoint.test.mts tests/touchline-avatar-retention-server.test.mts tests/touchline-avatar-retention-rpc.test.mts tests/touchline-avatar-retention-qa-runner.test.mts
./node_modules/.bin/eslint supabase/functions/touchline-avatar-retention/index.ts tests/touchline-avatar-retention-entrypoint.test.mts scripts/verify-avatar-retention-edge.mjs
./node_modules/.bin/tsc --noEmit --incremental false
node --check scripts/verify-avatar-retention-edge.mjs
git diff --check -- supabase/functions/touchline-avatar-retention/index.ts tests/touchline-avatar-retention-entrypoint.test.mts scripts/verify-avatar-retention-edge.mjs
```

Focused result: **26 PASS / 0 FAIL / 0 SKIP**. ESLint, global TypeScript, probe syntax and scoped diff checks exited 0. Logs are in `artifacts/avatar-notifications-20261031/retention-explicit-binding-{focused,lint,typecheck}.log`. This total supersedes the earlier run of these same files; do not add them together.

The new entrypoint tests execute the actual module and establish:

1. Absent explicit binding preserves existing legacy behavior; read errors fail closed.
2. Empty, opaque, oversized, whitespace-bearing, foreign-project, wrong-role and missing-ref explicit values cannot fall back.
3. A valid explicit QA key boots with an incompatible built-in. A getter that throws if the unused built-in is read proves that it remains unused.
4. Wrong/default bearers are rejected with zero transport; the selected bearer succeeds in an empty synthetic run. Both outgoing RPC headers contain only the selected key.
5. Source addition/removal with identical values, selected-key change, empty replacement, origin and flag drift stop before transport.
6. Existing request/body/Origin, concurrency, uncertainty and runner safeguards remain covered.

The real-Deno loopback probe gained explicit-valid and explicit-empty cases and passed syntax checking. Deno is unavailable on PATH, so those native-Deno cases were **not executed**. No browser, full suite, build, remote POST or secret read occurred in this task.

## Minimum operational continuation for root

1. Review and freeze this delta. Keep client upload/retention-ready gates closed. The new manifest `artifacts/avatar-notifications-20261031/retention-explicit-binding-deploy-manifest.json` contains all 11 Edge files and hashes; only the entrypoint changes relative to the diagnostic package. It labels v6 as root-reported and requires fresh remote source/hash comparison before deployment.
2. Through the approved protected channel, bind an **existing, verified, currently valid QA legacy service-role JWT** to the explicit variable. Do not invent a JWT, mint credentials, use a Production key, rotate shared secrets, or use this report as evidence that any particular key is valid. If no such valid credential exists, stop this path and design the new-key migration explicitly.
3. Preserve the same configured credential for the authorized runner/scheduler caller. Deploy the reviewed function with gate OFF and `verify_jwt=true`; verify target/version/hash and OFF behavior before a controlled new enabled composition.
4. GET 405 proves composition only: the handler checks method before its own bearer authentication. Missing/wrong bearer, Origin and payload gates are separate checks. A successful real POST requires the pre-existing global journal/Storage baseline and can perform deletions; do not use it as a casual readiness probe.
5. Run the existing phased QA fixture procedure: inspect → publish-first → publish-second → wait actual `terminal_at + 5 minutes` → retain once → verify. Preserve current image, remove only eligible old objects, confirm receipts and no unrelated writes. Unknown/lost result requires reconciliation, not blind repetition.
6. Configure and prove protected scheduling separately, with no overlapping invocation. Manual success does not prove automation. Only then consider retention-ready/upload/public-consumer gates, followed by actual client upload and propagation to profile/search/ranking.

Rotation limitation: an explicit secret is a second configured copy of the selected legacy credential and must rotate together with the authorized caller. This is a bounded compatibility repair, not completion of the later platform new-key migration. If rollback is needed, close the retention gate first and return to the reviewed prior package; deleting an invalid explicit value to silently fall back is not an operational repair.

## Mission completion record

- **MISSION / SCOPE:** local explicit QA credential source, retained strict authority and regression proof.
- **WORKTREE / BASE:** `qa-stripe-release-20261029`, detached `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694` with unrelated WIP preserved; no commit by this subagent.
- **FILES:** entrypoint; `tests/touchline-avatar-retention-entrypoint.test.mts`; `scripts/verify-avatar-retention-edge.mjs`; this report and the explicit-binding manifest. Shared state/ledger and validators untouched.
- **LOCAL RESULT:** focused checks above; no full-suite/build claim. Independent static review by `publication_integrity_review` found no defect; reviewed entrypoint SHA-256 `dc8c77f15afcfa695b771146643687b88373b14f5be530d9e39dbc7623b417be`.
- **QA REMOTE:** root-reported v6 diagnostic only; explicit binding not deployed/configured by this subagent. Zero remote builds/mutations/credentials obtained.
- **VISUAL / RESPONSIVE:** not applicable to this backend delta; previous Safari/mobile gates remain pending.
- **SECURITY:** exact QA scope and role, platform JWT intent, internal exact bearer, fail-closed configuration and no-secret logs preserved.
- **OPEN:** real credential binding, deployed checks, retention with real time, scheduling and customer avatar consumers.
- **PRODUCTION:** NOT TOUCHED.
