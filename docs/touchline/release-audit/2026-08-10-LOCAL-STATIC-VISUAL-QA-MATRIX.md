# Local static visual QA matrix — EN/PT

Recorded: 2026-08-10 (Europe/Malta)

Status: LOCAL STATIC FIXTURE QA PASS / NOT A RELEASE OR PREVIEW APPROVAL

## Scope and method

This evidence covers only the admin-gated, static local visual fixtures in a
local production server at `127.0.0.1:3101`. The process used an empty
application environment; it did not use Vercel Preview, a deployed domain,
database credential, provider credential, account session, sync, migration or
deployment.

Each fixture was opened in the local desktop browser at 390px, 768px and
1280px in both `en-GB` and `pt-BR` where it presents copy. The browser check
measured root horizontal overflow, visible text width, DOM order and computed
trace motion. It is intentionally not evidence about live ClubHub, player,
market-value or account data.

## Safe local corrections included

- The card trace, Club Owner trace and initial-official-table fixtures now
  accept the same strict EN/PT query contract as the prior ClubHub and card
  value fixtures. Unknown fixture locales resolve to English.
- Long synthetic shirt/name labels in the static card fixtures were shortened
  to `VERIFIED`, `PENDING`, `ACTIVE`, `TRACE` and `OWNER`. This corrects a
  390px fixture-only crop; no product player name, card art, tier, price,
  contract, market value or ranking changed.

## Observed matrix

| Fixture | EN/PT | 390 / 768 / 1280 | Observed result |
| --- | --- | --- | --- |
| `/visual-qa/clubhub-profile-contract` | Yes | All | PASS — no root horizontal overflow; 11 field names remain readable without width clipping or ellipsis; section order is hero, XI, technical area, outside-match roster, then Official League Table. |
| `/visual-qa/card-value-states` | Yes | All | PASS — the three verified/pending/active-contract fixture cards have readable short shirt labels and no root horizontal overflow. |
| `/visual-qa/card-neon-trace` | Yes | All | PASS — player and coach frame traces plus circular crest traces remain within their surfaces, pointer-inert and uncropped. |
| `/visual-qa/club-owner-portrait-neon` | Yes | All | PASS — fixed TouchLine-green circular trace remains within the portrait surface without root horizontal overflow. |
| `/visual-qa/official-league-table-initial` | Yes | All | PASS — 20 zero-stat initial-table rows render locally, with the approved EN/PT initial-table copy and no horizontal page overflow. |

The EN/PT fixture headings observed in the browser matched the intended local
copy. For example, ClubHub rendered `Confirmed line-up` / `Escalação
confirmada`, `Technical area` / `Área técnica`, `Outside the matchday squad` /
`Elenco fora da partida`, and `Official League Table` / `Tabela Oficial da
Liga` in the approved order.

## Motion and interaction observations

- Card frame, crest and Club Owner SVG run paths report the calm eight-second
  infinite animation. Samples observed a travelling dash, the full-perimeter
  residual state (`dasharray: 100 0`, opacity about `0.28`), an invisible
  reset, and a subsequent travelling pass. This confirms the requested
  pass-pause-restart cycle rather than a hover-only animation.
- Decorative trace paths report `pointer-events: none` and `touch-action:
  auto`; they do not intercept a link/card interaction or impose a zoom-blocking
  touch-action rule.
- Existing source regressions cover fine-pointer hover lift, coarse-pointer
  temporary active lift, focus styling, static reduced motion, and the Arena
  Live compact anti-flicker suppression. The local browser fixture confirms the
  resulting runtime animation; it does not emulate a native touch sequence or
  operating-system reduced-motion setting.

## Explicit non-claims / remaining device gates

- This was a local desktop browser check, not a functional Preview or public
  release test.
- Native Safari/WebKit desktop, iOS Safari and Chrome Android observation
  remain external device gates. Keyboard-focus traversal and real touch input
  also remain to be observed on those surfaces; no synthetic hover was used as
  a substitute.
- The static fixtures do not prove live persisted data, the separate canonical
  public-read boundary, durable Quick Sub behavior, production domain binding,
  or the held market-value UUID/membership application path.

## Validation recorded after the fixture changes

| Check | Result |
| --- | --- |
| Local browser fixture matrix | PASS — 30 EN/PT/viewport visits |
| Calm neon pass / residual pause / restart | PASS — card and Club Owner runtime samples |
| Release-readiness package check | PASS |
| TypeScript package check | PASS |
| ESLint package check | PASS |
| Full package test suite | PASS — 807/807 |
| Production package build | PASS |
| `git diff --check` | PASS |

## Artifact links

- `app/visual-qa/clubhub-profile-contract/page.tsx`
- `app/visual-qa/card-value-states/page.tsx`
- `app/visual-qa/card-neon-trace/page.tsx`
- `app/visual-qa/club-owner-portrait-neon/page.tsx`
- `app/visual-qa/official-league-table-initial/page.tsx`
- `scripts/check-touchline-release-readiness.mjs`
- `docs/touchline/release-audit/2026-08-10-LOCAL-EN-PT-RELEASE-READINESS-CHECKLIST.md`

Persistent checkpoint: pending commit for this visual-QA block.
