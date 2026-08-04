# TouchLine Vercel Preview smoke — 2026-08-04

Scope: non-financial Preview validation for the real TouchLine application.
No production alias, payment flow, wallet, Stripe configuration or data mutation was changed.

## Deployment identity

- Project: `touchline-arena-official` (`prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`)
- Team: `Fifa Agent Plataform`
- Deployment: `DqWfCWs2FVhNgrJ2ey13KHsv6Tj5`
- Commit: `ab1f7663e3d71122e5baa0f672d3d48c74a5c291`
- Branch: `safety/touchline-2026-06-28-wip`
- Preview: `https://touchline-arena-official-git-safety-cee89f-fifa-agent-plataform.vercel.app`
- Vercel status: `Ready` (3m02s)

## Public smoke results

Browser validation, through the authorized Vercel Preview session, confirms the
root renders the real localized TouchLine Arena login, not the temporary Audit
Mode. The Manchester United ClubHub route renders the expected real ClubHub
content: predicted line-up, 33 TouchLine cards, full squad, canonical standings
pending state and next-match state.

The browser smoke matrix produced the expected result for every tested route:

| Surface | Result |
| --- | --- |
| `/`, `/login`, `/register`, `/forgot-password` | Real localized Arena authentication surfaces render. |
| `/arena`, `/market-transfer`, `/admin` | Redirect to the localized login with a preserved return path when no product session exists. |
| `/live`, `/touchline-tables`, `/touchline-player-card-rankings` | Real public Match Centre and ranking/table surfaces render. |
| ClubHub and Player Profile | Real public football content renders. |
| `/club-owner/demo` | Safe 404 boundary renders; no demo ClubOwner is exposed. |

An unauthenticated transport request to the Preview is redirected to Vercel SSO.
That is Preview deployment protection, not a TouchLine route failure. It means
anonymous HTTP checks cannot substitute for the browser-authorized Preview
matrix; production aliases were not affected.

The Portuguese Match Centre route also renders the real data surface with its
upcoming-fixture list, localized kickoff times, canonical source status and the
explicit next-match state. No presentation-only audit substitute was used.

## Production protection

`touchline.com.br` and `www.touchline.com.br` remain Production aliases. This
Preview has not been promoted and must not be promoted until the remaining
controlled non-financial persona and native-browser smoke checks pass.

## Remaining Preview validation

- controlled non-financial ClubOwner personas;
- native WebKit/device matrix;
- authenticated navigation and coach-first persistence once the separate
  migration gate is resolved.
