# QA-native manual rebase — integration input

Base: `00bb6bdc8d8b703c2481d7f3cd533c2b664c4f08` (detached disposable worktree).

This package ports only the reviewed candidate behaviours while preserving the
QA baseline's Arena 4-3-3/video-slot contract and ranking `player_scoring_v3`
coverage contract:

- explicit fail-closed player-leadership metadata and crown overlay;
- card-tier component tokens (v1 factors remain `1`);
- position-aware goalkeeper saves/glove presentation;
- Arena full-envelope containment for wide/lower and **rail-only** safety for
  side-sweep.

The four prior conflicts were manually rebased in dependency order:
ranking v3, card tokens/crown/GK, then the Arena adapter. No candidate patch
was applied wholesale to either QA-owned component.

Verification performed locally:

- `pnpm exec tsc --noEmit --incremental false` — PASS
- 22 focused unit tests — PASS
- focused ESLint — 0 errors; 3 warnings pre-existing in `ArenaClient.tsx`
- `git diff --check` — PASS
- Chromium 1440 harness without a URL — intentionally SKIPPED

Runtime is still blocked. Wide/lower need a no-write candidate URL run; the
third side-sweep perspective is rail-safe only and has no approved four-line
polygon. Desktop/mobile captures and the 20-club audit remain unperformed.
This is not a release-clean candidate and does not authorize QA deployment.
