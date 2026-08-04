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

The current continuation deployment is also Ready:

- Deployment: `96CqP1LRyEQtJ5kWVwKPh9ywVfY6`
- Commit: `c4e47484cf8ffdd9644382c1c0f2acd0fb308add`
- Preview: `https://touchline-arena-official-git-safety-cee89f-fifa-agent-plataform.vercel.app`
- Vercel status: `Ready` (2m28s)

The audit-evidence continuation deployment is also Ready and was smoke-tested
after the push:

- Deployment: `A5a8aKbr4qgdSkXT6R9afE4S8uE8`
- Commit: `eac3e1da694a7a90cc18bf5ed1deb49727c96879`
- Preview: `https://touchline-arena-official-a4y8xwgr5-fifa-agent-plataform.vercel.app`
- Vercel status: `Ready` (2m32s)

Its real Manchester United ClubHub route rendered in Portuguese at `1280x720`
with the same live roster, 33 cards and predicted line-up. It contained no
Audit Mode substitute.

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

The ClubHub card-detail interaction was also exercised on the authorized
Preview: opening the real Amad Diallo card created its dialog, the Close control
removed it, and focus returned to the same card trigger. This verifies the
actual interactive component rather than a static screenshot.

## Available responsive evidence

The available browser surfaces validated ClubHub at `1280x720` and `656x756`.
Both completed the initial loading state and rendered the real Manchester United
hero and card/squad summary without a horizontal error state or an incomplete
surface. Screenshots are stored locally, not embedded in chat:

- `screenshots/vercel-preview/clubhub-desktop-1280x720.png`
- `screenshots/vercel-preview/clubhub-compact-656x756.png`

Native WebKit, a phone-width viewport and landscape mobile remain part of the
separate native-device gate; they are not inferred from this evidence.

## Native WebKit evidence

Native Safari/WebKit was checked against the local production build at
`127.0.0.1:3100/touchline-clubs/manchester-united?lang=pt-BR`. The real
ClubHub roster and pitch render with the approved player-card presentation:
the player identity is visible inside the card and also above it for quick
line-up scanning. No audit-only substitute was involved. Evidence is stored
locally, not embedded in chat:

- `screenshots/vercel-preview/clubhub-safari-local-webkit.png`

This confirms the desktop WebKit rendering of the real product locally. It
does not claim remote-Preview WebKit validation: the Preview remains protected
by Vercel SSO, and native phone portrait/landscape still require a controlled
device matrix.

## Production protection

`touchline.com.br` and `www.touchline.com.br` remain Production aliases. This
Preview has not been promoted and must not be promoted until the remaining
controlled non-financial persona and native-browser smoke checks pass.

## Remaining Preview validation

- controlled non-financial ClubOwner personas;
- native phone portrait/landscape and remote-Preview WebKit/device matrix;
- authenticated navigation and coach-first persistence once the separate
  migration gate is resolved.
