# Public locale integration — checkpoint 2026-10-07

## Authority and scope

Owner authorized continuing the new site release, QA first. Integration checkout is `touchline-release-candidate-20261007`, baseline `30419c494911112f7b793ad8881e5b8e36c4f553`; original worktree remains preserved. No immutable release commit yet. One Git-native QA build budget; zero consumed. Production remains unchanged.

## Fresh verification

- Initial public integration suite: 4681 PASS / 95 FAIL / 0 SKIP. Failures preserved in `artifacts/release-integration-20261007/public-locales-all-modes.log`.
- Three exclusive test-harness repair batches reported 63, 60 and 112 focused passes. Root Live mounted browser rerun: 5 PASS / 0 FAIL / 0 SKIP, exit 0, `live-interactions-public-release.log`.
- Integrated rerun: 4808 PASS / 4 FAIL / 0 SKIP, exit 1, `public-locales-integrated-repaired.log`. Four failures were in three harness files after the protected-auth-return fix: two extracted helpers lacked `hasProtectedAuthReturn`; the persistence regex expected the prior condition.
- Root added the real extracted helper/dependencies and required the new protected-return predicate. Focused run of persistence, preview sanitization, public locale, proxy integration and coordinated presentation: 33 PASS / 0 FAIL / 0 SKIP, exit 0.
- Final complete all-mode suite in `public-locales-final.log` was interrupted by root when free disk fell to 259 MiB. Exit 1 after SIGINT: 3065 PASS / 1 FAIL / 306 cancelled / 0 SKIP; this is incomplete, not approval. Typecheck/lint chained after it did not execute. Free space returned to 2.3 GiB after process exit. No files deleted; candidate `.next/cache` currently reports 892 MiB and needs new cleanup authorization if selected. Source/test writes were frozen during the run.
- Independent source review found no concrete defect in protected auth return normalization and EN/PT document handling; no new browser evidence claimed by that review.

## QA read-only preflight

- Remote qa still baseline above; main `437b318e08c04c1e11f8e290cf652482a4f6a98d`. Vercel project listing returns only `touchline-arena-official` in the configured team; this alone does not certify all external hooks.
- QA migration history reconciles 26 local October files with 15 absent versions after recognizing Golden Boot local `20261001194607` as hosted `20261001233034`. Do not repeat it or apply all remaining files indiscriminately.
- Direct schema read confirms `notification_preferences` lacks `game_locale` and `game_locale_revision`, and no `touchline_set_game_locale` function exists. Existing RLS is enabled, own-user INSERT/SELECT/UPDATE policies remain, two existing update/enrollment triggers remain, one row counted without retrieving private contents.
- No quota/prequery authority tables found. Binding and initial authority state are not established; do not invent quota state or enable provider calls.
- Both QA cron jobs returned inactive. No scheduler changed.
- Locale/revision and quota/prequery need a reviewed minimal deployment/recovery plan. Reminders, rehearsal and avatar have separate gates; no silent activation is authorized by this checkpoint.

## Decision

Not ready to push or deploy. Finish integrated tests/static/build evidence, review the exact manifest, resolve QA schema and binding safely, consolidate immutable SHA, then apply the release gate. No remote SQL writes, environment changes, notification sends, billing activation, commit, push or deploy performed in this continuation.
