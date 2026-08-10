# 2026-08-10 — Quick Substitution self-route loop hotfix

## Purpose

Repair the authenticated Safari redirect loop reported at
`/club-owner/me/substitution` without changing roster, contract, match,
market-value or other gameplay data.

## Confirmed cause

For the authenticated ClubOwner whose canonical slug is `luiz-lopez`, the
previous readiness release created this loop:

`/club-owner/me/substitution` → `/club-owner/luiz-lopez/substitution` →
`/club-owner/me/substitution`.

The first redirect was the intended self-route canonicalisation. The second
was a legacy alias rule that still treated the canonical Luiz pathname as an
alias for every authenticated ClubOwner. Safari correctly stopped the cycle as
"Too many redirects".

## Local correction

- The access boundary now permits `/club-owner/luiz-lopez/substitution` as the
  private canonical route only when the authenticated ClubOwner's own slug is
  exactly `luiz-lopez`.
- The legacy static route that shadows the dynamic `[owner]` route now performs
  the same authenticated identity check as the dynamic route and renders the
  substitution surface only for that identity.
- Other ClubOwners retain the existing self-scoped alias redirect; signed-out
  visitors go to login. No public owner surface is exposed.

## Validation

- Focused ClubOwner/self-route and Quick Substitution suite: **13 passed, 0
  failed**.
- `pnpm typecheck`, `pnpm lint`, production `pnpm build`, and `git diff
  --check` passed.
- The regression matrix covers the exact Luiz self-route, a different
  ClubOwner's legacy alias, and signed-out access.

## Boundary

This fixes entry routing only. It does not alter the current `0/11` / `0/9`
roster state and does not claim durable match substitution. The separate
match-state protocol keeps a substituted-out player out of the available bench
but is not yet wired to a server-owned match snapshot.
