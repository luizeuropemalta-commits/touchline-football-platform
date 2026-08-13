# Isolated Preview boundary — local proposal

**Status: LOCAL PROPOSAL / NOT DEPLOYED**

## Evidence-led diagnosis

The current product cannot safely be deployed as a functional generic Preview:

- Public pages can reach server readers that use the admin client, while some
  public GET paths can construct a football provider or persist a snapshot.
- Auth callback/origin logic deliberately falls back to the production domain
  for an unknown Vercel hostname.
- The root layout starts authenticated activity telemetry, and several Arena
  effects can call data endpoints after render.
- No tracked Vercel project binding, effective environment readback, or
  dedicated-project credential evidence exists.

Therefore a different hostname alone does not isolate Preview from production
data, authentication or callbacks.

## Proposed local boundary

1. Introduce one pure deployment-mode contract. Isolated Preview is active
   only when the explicit server and public mode markers both equal
   `isolated-preview`, Vercel reports `preview`, the generated Vercel hostname
   is valid, and injected expected project/team identifiers match the Vercel
   system identifiers.
2. At config-load time, reject a Vercel Preview that lacks the explicit mode
   marker or fails the identity/environment contract. The contract must report
   key *names* only, never values.
3. In isolated mode, the proxy must be the first availability boundary: every
   dynamic application/API/auth/private request receives a no-store, noindex
   Preview-unavailable response with no redirect. It must run before locale,
   Supabase or auth logic.
4. The isolated envelope is intentionally **not a functional product Preview**.
   It is a safe deployment/host verification surface only. It must not render
   ClubHub, Live, Arena, Market, Admin, login, callback or any route that could
   initiate data, authentication, telemetry or provider work.
5. A later functional Preview requires a separate persisted-read-only public
   data boundary and a dedicated Vercel project whose effective environment
   names contain no real production credentials, auth configuration, provider,
   payment, mail, storage, queue, owner or internal-origin settings.

## Risks retained deliberately

- Code cannot prove a Vercel dashboard's environment inheritance or project
  ownership without an external, name-only effective-environment readback.
- A mode guard is not a replacement for removal of current public
  provider/persistence paths. It only prevents them from executing in the
  explicitly isolated envelope.
- The absence of a functional Preview is intentional: pretending to provide
  product QA without credentials/data isolation would be unsafe.

## Local acceptance criteria

- Pure tests reject missing/mismatched Preview mode, Vercel identity, hostname
  and forbidden application-secret keys without printing values.
- Pure tests accept only the expected isolated contract and prove route policy
  returns an unavailable/no-redirect envelope for application, API and auth
  paths.
- Static tests prove the proxy invokes the isolated policy before locale,
  Supabase and auth branches; config loads the verifier.
- `git diff --check` and focused no-network tests pass.
- The block is committed locally. No Vercel deploy, dashboard action, remote
  configuration, browser session or data action is part of acceptance.

## External gate for an actual Preview URL

A dedicated Vercel project, distinct from the production project, must provide
the expected project/team ID binding and a name-only effective variable list.
It must show no production aliases or credentials and deploy from a clean,
committed candidate. The resulting URL can validate only the isolation envelope
until the persisted-only public product boundary is completed.

## Local implementation evidence

Implemented locally in the persistent Preview candidate:

- `lib/touchlinePreview/isolation.ts` validates the explicit mode, generated
  Vercel hostname, project/team bindings and application-level allowlist. It
  reports only reason/key names, never values.
- `next.config.ts` invokes that validation. A Vercel Preview missing the
  contract rejects at config load instead of becoming a normal product build.
- `proxy.ts` resolves the policy before hostname, locale, audit, auth or
  Supabase work. Only exact `/preview` receives the isolated marker; all other
  dynamic paths, including APIs, auth and `/_next/image`, receive no-store,
  noindex, CSP-restricted unavailable responses with no redirect.
- `app/preview` is an inert EN/PT shell and is unreachable without the proxy
  marker. The root layout omits analytics and production canonical metadata
  when the marker is present.

Focused local evidence: `touchline-isolated-preview-boundary.test.mts` passed
4/4; direct config loading passed with a synthetic valid contract and rejected
a synthetic forbidden key without echoing its value; `git diff --check` passed.
No server, browser, Vercel, database, provider, auth or remote environment was
used. This remains an envelope implementation only, not a functional Preview
or proof of a Vercel environment.

## 2026-08-13 functional Preview incident closure

- `FUNCTIONAL_PREVIEW_AUTH = BLOCKED_BY_DESIGN_NO_STAGING_SUPABASE`.
- A normal Vercel Preview without the explicit isolated contract fails at
  configuration load with
  `TL_PREVIEW_AUTH_UNAVAILABLE_NO_STAGING_CONFIGURATION`.
- The explicit isolated contract remains limited to `/preview`; it does not
  expose login, Market, ClubHub, Arena, provider or database routes.
- Production is outside this policy and its Supabase configuration remains
  unchanged. No Production server credential may be copied to Preview.
- A future authenticated Preview requires a separately authorised Supabase
  Staging project, staging users and staging-only credentials.
