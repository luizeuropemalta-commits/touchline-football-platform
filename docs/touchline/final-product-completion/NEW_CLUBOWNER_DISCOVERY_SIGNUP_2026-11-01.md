# New ClubOwner discovery — local candidate

Scope: email/password registration plus explicit first-access completion for OAuth and accounts without a discovery profile. The form asks for a dedicated public name and explains discovery, private email/balance, separate photo consent and the ability to hide the profile. It submits version 1 intent in signup metadata; no fallback uses email or legal registration names.

On initial authenticated access, existing callback/login/access routes call ensureTouchlineArenaAccess. Before the server-controlled access flag is granted, a service-only RPC validates persisted signup intent and confirmed, non-anonymous, unbanned identity. It inserts a published profile with photo consent false. ON CONFLICT DO NOTHING preserves all existing names, public IDs, private choices and photo consent. Failure does not mark access ready, permitting retry. Existing access fast path remains untouched. No backfill is included.

The migration does not activate discovery gates. Profile persistence can precede gate activation; actual search still uses its existing gate, ranked directory and privacy filtering. This is not a claim that all registered accounts are discoverable today.

OAuth first-access implementation is now local: the existing ClubOwner page mounts the shared smoky dialog only after a successful self-profile read confirms absence and discovery is enabled. The user supplies a dedicated public name, sees the disclosure, and explicitly saves. Closing defers publication. Existing profiles, including private profiles, do not mount the dialog. Read failure is never treated as absence. A dedicated authenticated, insert-only RPC accepts intent version 1, checks confirmed identity and access/gates, and preserves any profile created concurrently. No provider fullname or email is prefilled. This also lets previously registered users without a public profile choose their name; it never auto-publishes them. Callback/recovery code remains unchanged. Hosted OAuth signup and first-access integration remain unvalidated.

No QA writes or deployment performed. Both new migrations must be applied to QA before publishing their consumers; then validate fresh registration, email confirmation, first login, name search and visibility from the second customer account. Photo remains hidden until separately authorized. Do not use existing test accounts alone as proof of fresh-signup behavior.

Validation: parser and PGlite tests cover rejected email/control/length input, versioning, unconfirmed/anonymous/banned users, insert, repeat, preserved private state/public ID and RPC permissions; access-order test covers failure/retry and no writes for existing access. Global and hosted results must be recorded by the integration owner.

## Local checkpoint

- `node --experimental-strip-types --test tests/clubowner-signup-discovery.test.mts tests/touchline-existing-access-local.test.mts`: 3 PASS, 0 FAIL.
- `node --experimental-strip-types --test tests/clubowner-signup-access-order.test.mts`: 1 PASS, 0 FAIL.
- ESLint for auth-form, auth-i18n, discovery-registration and touchline-arena-access: exit 0.
- `git diff --check`: exit 0.
- `npx tsc --noEmit --incremental false --pretty false`: exit 0.
- No browser fresh-registration proof, QA migration application, QA signup write, or deploy included in this checkpoint.

Independent-review follow-up: SQL test now applies the real discovery and avatar-consent migrations before the new migration. Added direct invalid/absent-name, published:false, absent-intent and nonexistent-user cases; preserved existing photo consent; and access-grant-failure followed by retry. Combined focused run: 4 PASS, 0 FAIL (replaces overlapping earlier runs; do not sum).

## First-access increment checkpoint

- New migration: `20261101171000_touchline_people_first_access.sql`; existing first increment migration remains `20261101162000_touchline_people_signup_intent.sql`. Neither applied to QA by this task.
- New modal: `components/touchline/social/ClubOwnerDiscoveryOnboarding.tsx`, wired once in `app/clubowner/page.tsx`; shared dialog/focus/scroll lock/styles reused.
- Dedicated PUT route: `app/api/account/public-profile/onboarding/route.ts`; shared handler authenticates and rejects unknown/actor fields. No automatic write retry: ambiguous outcome requires own-profile GET; malformed or failed GET keeps writes blocked.
- Focused run (first-access SQL/handler/render, signup SQL/order, existing access and public handler): 21 PASS, 0 FAIL. Real discovery/avatar migrations applied in local PGlite. Concurrent calls on one PGlite engine verify idempotent repeated execution, not a two-connection database race; insert-on-conflict enforces preservation at SQL level.
- ESLint onboarding/handler/route/ClubOwner page: exit 0. TypeScript global `--noEmit --incremental false`: exit 0.
- Independent reviewer found no concrete blocker; requested real browser proof of mount/close and ambiguous-write reconciliation. Browser fixture added; initial execution stopped at memory capacity gate before browser launch. Subsequent isolated Chromium run with the user-authorized local memory exception passed: 1 PASS, 0 FAIL, 0 SKIP; disk gate remained enforced. Three real-DOM scenarios: mount/focus/Escape without writes; committed PUT with 503 then failed GET keeps submit disabled, successful GET closes and refreshes once; already-private profile response remains private.
- Browser command: `TOUCHLINE_RUN_FIRST_ACCESS_BROWSER=1 TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE=1 node --experimental-strip-types --test tests/clubowner-first-access-browser.test.mts`.
- Limit: browser fixture uses synthetic HTTP and refresh observer, not hosted auth/SQL/RSC proof. New OAuth account -> first access -> second-account discovery remains a QA gate. Photos remain opt-in, no private profile republish, no production action.
