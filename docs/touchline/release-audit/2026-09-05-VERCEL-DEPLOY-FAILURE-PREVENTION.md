# TouchLine — Vercel deployment-failure prevention review

**Date:** 2026-09-05  
**Scope:** QA branch only (`qa`)  
**Production:** not changed

## Evidence reviewed in Vercel

Project: `touchline-arena-official` (`prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`)  
Team: `fifa-agent-plataform`

The review used Vercel deployment metadata, failed-build logs, and Preview runtime logs.

## Confirmed failures

| Deployment | Commit | Vercel result | Root cause | Required prevention |
| --- | --- | --- | --- | --- |
| `dpl_88mbg16omEqUNSVWVHmzyFkMeFYt` | `741a4257` | Build failed | A source-contract test still prohibited the intentionally scrollable league rail. | Update the focused contract test in the same change as the UI behaviour; run the full release suite before push. |
| `dpl_29jUdWE4CAxR5e7ucXtYJkroXMDD` | `85cf2486` | Build failed | A page composition test still expected the previous stadium prop contract. | Test page composition and component contract together; do not ship a component API change without its test update. |
| `dpl_daErmJjKZwzKWhLoaoiwhBvQxGBW` | `8b6b551d` | Build failed | The visual change removed the required unavailable-squad recovery copy. | Keep resilience states as release requirements; test happy, unavailable, and recovery states before release. |
| `dpl_BoWLUuFnu4iysCBM4MvJB8RpBTdv` and earlier previews | Runtime instability | Public requests and `.avif` assets invoked Supabase identity refresh in middleware, producing Supabase `504` and concurrent refresh `409` errors. Club loaders then waited up to 295 seconds and hit Vercel runtime timeout. | Public requests and static assets bypass identity lookup. Authentication remains restricted to protected routes. This was fixed by `31dbac28` (`fix(proxy): skip auth for public requests`). |

## Runtime evidence

Vercel logs showed all of the following on the earlier Preview:

- `AuthRetryableFetchError` from Supabase Auth, HTTP `504`.
- `Too many concurrent token refresh requests`, HTTP `409`.
- Public `.avif` trophy assets passing through middleware identity work.
- `viewer-access` waits of approximately 58 s, 70 s, and 111 s.
- club data loaders exceeding 160–295 s and Vercel runtime timeout at 300 s.

## Mandatory QA release gate

No QA deploy is allowed unless every item is green:

1. `git diff --check` has no output.
2. TypeScript validation passes.
3. Focused ClubHub tests pass, including visual contract, fixture, lineup, resilience, and profile-order suites.
4. Full `vercel-build` / release test suite passes locally.
5. A visual reviewer checks the intended ClubHub route in Safari-sized desktop viewport, with no clipped cards, no static replacement for interactive cards, and no malformed matchup alignment.
6. Before promotion, inspect Preview runtime errors for Supabase auth `504`, refresh `409`, middleware timeout, and route-loader latency.
7. Deploy only after an explicit user approval of the reviewed QA result. Production is never implicit.

## Ownership rule

Every change must update its applicable source contract and its visual/resilience test in the same batch. A failed Vercel build is a blocking result, not a candidate for manual approval.

