# Cadastro — bounded local eight-language closure

2026-10-07. Supersedes the `PARTIAL` state of `register-linguistic-review-20261007.md` and `register-visual-review-20261007.md` **for this local page slice only**. No public draft-language gate, account, email, provider, payment, QA or production change.

## Exact changes

- `components/auth-form.tsx`: during register pending, retain the localized Create account text instead of an icon-only button; mark spinner decorative. Announce register errors with `role="alert"`. Increase the register terms disclosure from 10px to 12px and use a lighter text color, without changing its wording or checkbox requirement.
- `tests/touchline-register-pending-accessibility.test.mts`: narrow source contract for busy/error accessibility.
- `tests/touchline-register-states-browser.test.mts`: real AuthForm mounted in a network-denying Playwright harness. Eight draft display locales exercise native required/email/terms blocking, password show/hide, pending accessible name, provider failure message, confirmation without session, resend failure/success and return to cleared form. In-memory provider result only; zero real signup/resend requests.

## Evidence

- Focused register/auth set: 10/10 PASS, zero fail/skip. The expanded browser interaction test reran after extra validation assertions: 1/1 PASS, zero fail/skip. TypeScript `npm run typecheck` exit 0 after the form accessibility change; scoped ESLint and `git diff --check` exit 0 after the final source change. The complete candidate suite is not claimed here.
- Disposable source snapshot `/private/tmp/touchline-retirement-build-20261007.KkL7Mm` had no `.env*` and was refreshed with the current AuthForm. The private fixture route explicitly opted into draft display locales; the canonical public register renderer still defaults those six locales OFF. Localhost only, one server at a time, stopped after captures.
- Final idle/error screenshot matrix: 27 screenshots under `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/register-2026-10-07T12-51-41-443Z`, plus the missing Turkish phone-landscape view under `register-2026-10-07T12-54-09-700Z` and four German views under `register-2026-10-07T12-54-35-616Z`: 32 total unique combinations. Eight locales × desktop/tablet/phone-landscape idle; eight locales × desktop unavailable-error. Each completed capture reported no page error, horizontal overflow or unexpected request. Earlier interrupted/diagnostic capture directories are not counted as final evidence.
- Final confirmation screenshot matrix used a fixture-only in-memory Supabase replacement in the disposable snapshot, limited to the exact local fixture route. Seven desktop locales under `register-2026-10-07T12-55-41-462Z`, German desktop under `register-2026-10-07T12-56-57-047Z`, and Arabic/French/German phone-landscape under `register-2026-10-07T12-57-12-549Z`. The initial seven-locale pass had a transient German hydration wait timeout; German was rerun successfully, with no unexpected requests. The images prove rendering of the confirmation state, **not** actual email dispatch or receipt.
- Root directly inspected Arabic phone idle and confirmation, German tablet idle and phone confirmation, French phone idle/error and confirmation, Spanish phone idle, Turkish phone idle, and EN desktop idle. No clipping or physical-layout reversal observed in these samples. Full-page vertical scroll on phone-landscape is intentional. Terms text is more legible after the scoped change.

## Boundary

This closes **Cadastro local** for the tested language, form, error and confirmation states. Native device/screen-reader testing, actual account creation or email delivery, hosted locale persistence, independent candidate review, full consolidated suite and QA are separate release gates. Do not treat synthetic confirmation as delivery and do not release the six draft languages or deploy from this receipt alone. Next user-facing page may proceed in the agreed one-page-at-a-time sequence.
