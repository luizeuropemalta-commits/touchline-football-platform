# 2026-08-10 — Quick Substitution readiness hotfix

## Purpose

Replace the opaque black handoff and empty standalone substitution board with
an explicit, non-fabricated readiness state for the authenticated ClubOwner.

## Confirmed cause

- `/club-owner/me/substitution` previously authenticated and redirected a
  second time on the server. During that handoff the global black
  `app/loading.tsx` could be shown.
- The current signed-in production account has no saved matchday roster:
  `0/11` starters and `0/9` substitutes. The old standalone bench panel still
  rendered, which looked broken and could not contain cards.

## Local implementation

- The edge proxy now sends only the authenticated self route
  `/club-owner/me/substitution` directly to that owner's canonical substitution
  URL, preserving locale/query/cookies.
- Both substitution routes now have a route-local, readable loading shell.
- `resolveTouchlineQuickSubstitutionReadiness` is a pure gate. It opens the
  board only after both roster reads settle and the matchday is **exactly**
  `11` starters plus `9` substitutes. It rejects missing and overfull sheets.
- An incomplete sheet shows its real counts, a Market Transfer action, and no
  invented player, contract, value, card, or bench slot.
- Local visual fixture:
  `/visual-qa/quick-substitution-readiness?lang=pt-BR&scenario=setup` for the
  empty state; omit `scenario=setup` for static `11 + 9` demo proof. Both are
  local-only visual fixtures and do not authenticate, read an account, or
  persist a roster.

## Validation evidence

- Focused route/readiness/durable-protocol suite: **20 passed, 0 failed**.
- TypeScript and ESLint passed; `git diff --check` passed.
- Browser QA on local fixture observed no horizontal overflow at `390`, `768`,
  and `1280` CSS pixels. The empty state rendered `0/11`, `0/9`, explicit copy
  and actions. The ready demo rendered 11 field cards and 9 bench cards.

## Boundaries and remaining gate

- No database, sync, roster mutation, value import, card economy, provider,
  migration, deployment, or production data was changed by this local hotfix.
- This improves the entry and empty-state UX only. The current visual bench
  interaction is not yet the separately specified durable match-substitution
  integration; it must not be presented as completed match authority.
- Native Safari/iOS/Android verification remains an external device gate.
