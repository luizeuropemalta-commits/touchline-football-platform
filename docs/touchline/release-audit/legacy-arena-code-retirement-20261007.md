# Legacy Arena code retirement — 2026-10-07

Authorized by root from user's explicit retirement request. Exclusive code manifest: four orphan modules, four dedicated test files, and two mixed test files. Main agent owns the separate camera/browser batch; it is NOT included here.

## Changes / consumer recheck

Immediately before archival, searches in app/components/lib/scripts/tests confirmed all four modules were referenced only by their dedicated tests and the two identified mixed test consumers. After removal, the same roots had no filename references to arena-save-intent, arena-account-sync, arena-club-registry-adapter, formation-transition or searched legacy symbols resolveArenaAccountSync/createArenaSaveIntent/TOUCHLINE_ARENA_CLUBS. No active consumer found, so authorized removal proceeded.

Removed via apply_patch:

- lib/touchlineArena/arena-save-intent.ts
- tests/touchline-arena-save-intent.test.mts
- lib/touchlineArena/arena-account-sync.ts
- tests/touchline-arena-account-sync.test.mts
- lib/touchlineArena/arena-club-registry-adapter.ts
- tests/touchline-arena-canonical-club-registry.test.mts
- lib/touchlineArena/formation-transition.ts
- tests/touchline-formation-transition.test.mts

Surgical mixed edits:

- tests/touchline-score-points-v2-distribution.test.mts: removed obsolete accountSync file read and its two old merge assertions. Renamed that test to authoritative roster readers; retained both real authoritative-roster V4 season/settlement source assertions and all other settlement/ranking/coach/backup checks. Eight tests remain.
- tests/touchline-live-coaches.test.mts: removed only obsolete Arena adapter import and its exclusive Arena selector test. Retained seven current identity/snapshot/coach-selection/ranking tests, including every selectable current England club having its own coach.

No source replacement, dead-code mocking, skips or new financial/product rule introduced. Shared geometry, player/coach data, registry, position eligibility, roster readers, persistence namespaces, intro/media/onboarding and current Market untouched.

## Recovery / hashes

All ten exact originals were copied preserving relative paths into **/Users/luizlopez/.Trash/touchline-legacy-arena-code-20261007-VXOHMZ**, created uniquely with mktemp. Each copied file's bytes were compared to canonical original before deletion. SHA manifest also saved inside archive as SHA256-MANIFEST.md. Lixeira was not emptied. No recursive deletion occurred.

To recover: review the requested relative path from this exact archive, verify its SHA below, and copy that file back to the same canonical relative path. For mixed tests, diff before restoring because subsequent work may exist; never blindly overwrite newer changes. Directory must remain retained until owner decides otherwise.

| Original relative path | Preimage SHA-256 |
| --- | --- |
| lib/touchlineArena/arena-save-intent.ts | e76ea02a5f6ff5a47ed9a56020b69664f28c4f6253d53de82a2003720805ce11 |
| tests/touchline-arena-save-intent.test.mts | bcbc0873859d448181c7b43c68bc7fb8e78fee7c4675ac0a1f38acd3896cd3d6 |
| lib/touchlineArena/arena-account-sync.ts | ce5130561d9cb533e8661ae4d41352e0377130372dbe75308a5a42601d937275 |
| tests/touchline-arena-account-sync.test.mts | e2d6bb9b06fe5bf0b2bca0c33788c0aa81a6f1f03c54fcc2b2fa85a25fd11535 |
| lib/touchlineArena/arena-club-registry-adapter.ts | f4719df1ba880f59ee927bb34a66afdff3ea18c287dd264a99385f70edd92619 |
| tests/touchline-arena-canonical-club-registry.test.mts | 6b348e64bb147e83bf9613012be054ef0e72800d71f5128f6d751a4d7f98c049 |
| lib/touchlineArena/formation-transition.ts | 48b8503dc3688a174909799f2c9d14b53dbf7cc6db5defa3b01db4cc6ae6fbbb |
| tests/touchline-formation-transition.test.mts | 2b30b32005ac0cc1f227cf7a790da5fc565e6875e31705732279555cf2a1cd79 |
| tests/touchline-score-points-v2-distribution.test.mts | 3843d8610323986037cb22a5be5410c7649473fdc63560f93a2148cca99492ea |
| tests/touchline-live-coaches.test.mts | e3539da0392a3cb15468115873a1f0bef3513015d59ae8cd84ffc6c3b18b4e82 |

## Honest test retirement counts

Dedicated removed tests: save-intent5; account-sync11 tests across2 describe suites; canonical-club adapter4; formation-transition4. One additional mixed live-coaches Arena-only test removed. **Total intentionally retired25 tests and2 suites** for this batch. The eight score-points test count is unchanged (one test narrowed/renamed to its surviving reader). This reduction is removal of obsolete behavior, not a claim those scenarios passed elsewhere. Archive retains exact historical names/assertions.

## Verification

With root's explicit serial slot, executed:

`node --test --experimental-strip-types tests/touchline-score-points-v2-distribution.test.mts tests/touchline-live-coaches.test.mts`

Exit0: **15tests,15PASS,0FAIL,0cancelled,0skipped,0todo;148.7305ms**. Current coach suite7 and score/provenance suite8 all passed. Slot immediately released to root.

`git diff --check -- tests/touchline-score-points-v2-distribution.test.mts tests/touchline-live-coaches.test.mts` passed. Full integrated suite, typecheck/lint/build and independent review after the combined removal batch remain root-owned and pending. No browser/server/database/full suite run by this agent.

## Completion gate

MISSION: scoped authorized orphan Arena code retirement. QA branch/commit/deployment: not established. REMOTE BUILD BUDGET/CONSUMED:0/0. FILES CHANGED: eight deletions/two mixed test edits above plus this receipt; ten recovery originals and manifest in unique Trash directory. FUNCTIONAL RESULT: focused surviving tests15/15; no full-site claim. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not performed. SECURITY: no credentials read; no hosted writes. OBSERVABILITY: exact command results and archival hashes. OPEN FINDINGS: combined independent/integrated gates pending. PRODUCTION: NOT TOUCHED. Tools: code-work and code-verification-guided scoped search, archival byte verification, apply_patch and authorized focused Node tests.
