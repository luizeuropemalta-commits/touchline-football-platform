# TouchLine Card Engine — Block 4A QA verification

Date: 2026-08-22
Scope: QA project `xgxbwqxjssxxuihuwmgy` only. Production was not queried, changed, deployed, or promoted.

## Preserved checkpoint

- Existing QA logical pre-change snapshot: `qa-prechange-snapshot-2026-08-18.md`.
- No player, contract, formation, profile, card, or authentication record was written during this verification.
- The QA audit ledger already contains two batch creations, one approval, one override publication, one market-value publication, and one `batch_reverted` event. This is evidence that the protected batch rollback path has been exercised without deleting source history.

## Data and authority checks

- Active Sportmonks memberships: 581 across 20 clubs; 580 carry a persisted detailed position. The single missing detailed position remains pending data-quality review rather than receiving an invented role.
- Exact-position aggregate includes CB 104, RB 49, LB 45, DM 43, Centre Forward 65, Right Wing 48 and Left Wing 42. The P0B position suite separately covers Estêvão provider ID `37701999` as `Right Wing` and verifies Arena maps that official label to the forward role.
- Active contracts with a missing player: 0. Card Engine data is protected by an editorial batch/override boundary and does not mutate provider facts; its effective view and server-side readers are the intended source for Market, Arena, profile, Club Hub, formation, and Quick Sub consumers.
- QA grants and RLS review found the Card Engine tables/functions limited to `service_role` (and database owner), with no `anon` or `authenticated` grants or public policies.

## Security remediation and verification

- Removed the browser-side SheetJS/XLSX parser and its `xlsx@0.18.5` dependency. The editor now accepts bounded CSV/TSV text only; binary XLSX parsing is not bundled.
- Added a streaming request-body limit of 260 KiB before JSON parsing for the privileged Card Engine API.
- Recorded the two privileged API methods in the QA route-audit manifest as `ADMIN` / `OWNER_ADMIN`.
- Final security diff scan: 0 reportable findings. `pnpm audit --json`: 0 vulnerabilities at every severity after patch-level lockfile overrides for `brace-expansion`, `js-yaml`, and `nanoid`.
- Local verification passed: focused Card Engine tests (4/4), full test suite (1,048/1,048), TypeScript, lint (0 errors; five pre-existing warnings), release-readiness check, build, and `git diff --check`.

## Remaining Block 4A gates

- Create a scoped QA commit, produce clean-worktree release-preflight evidence, and deploy only to the QA Vercel target.
- Run the non-authenticated remote smoke/browser matrix and read-only QA observability checks against that QA deployment.
- `SAFARI AUTHENTICATED: BLOCKED / EXTERNAL — sessão atual não é a persona QA canônica e a automação não pode validá-la sem alterar login/sessão.` No account, cookie, credential, or session action is permitted; this gate is not PASS.

This checkpoint is not a Block 4A GREEN declaration.
