# TouchLine QA Blocks 9–10 and Final Visual Audit — 2026-08-23

## Scope and safety

- Environment: QA Preview only.
- Stable QA alias: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Runtime SHA under test: `2e4fb07216593e64fd3da1d46287a10e761f06cb`.
- Deployment: `dpl_HNKZrjAPqtfVCqq3cQaUbRgset21` (`READY`).
- Production: **NOT TOUCHED**.
- Existing user changes in `CURRENT_STATE.md`, the canonical persona audit, the final-product ledger, and `tsconfig.tsbuildinfo` were preserved and not staged.

## Canonical status

- Blocks 5–8: previously GREEN; not reopened without a demonstrated regression.
- Block 9: GREEN. The single official table renders 20 clubs, canonical shared sports ranks (`1=`, `1=`, `3=`), tied accessibility, P/W/D/L/GF/GA/GD/PTS, live-state support, and no second table.
- Block 10 automated and rendered gates: GREEN in Chromium, WebKit, and Firefox across desktop, tablet, phone landscape, and the wider responsive matrix.
- Native Safari gate after the final formation geometry change: `BLOCKED / EXTERNAL — the Mac is locked and Computer Use cannot unlock it`. No login, logout, session switch, cookie/storage change, or credential operation was attempted.
- Ranking player/card: `BLOCKED / EXTERNAL DATA COVERAGE — 164 published cards still lack the complete official provider facts required for a publishable snapshot`. No partial snapshot was published and missing facts were not converted to zero.

## Findings repaired

1. Official standings tied-position targets were below the 44px touch minimum. Repaired in `292dba46eb353d668ad2ad3be1b421e769f35dea`.
2. The Club Hub player-card ranking link was 42px high. Repaired to 44px in the same commit.
3. A persisted `4-2-3-1` label was rendered as a collapsed `1+4+5+1` geometry because midfield tactical sub-lines were aggregated. Repaired in `709a122c2cc412fe9027ea763c12ded879bef6e4` with canonical columns `1+4+2+3+1`.
4. Outer cards at `y=86%` extended beyond the painted pitch. Repaired in `2e4fb07216593e64fd3da1d46287a10e761f06cb` by the shared Club Hub/Market safe span `20%–80%`.

## Verification evidence

### Code and release

- Focused geometry/Club Hub tests: 16/16 PASS after the final repair.
- Complete suite: 1244/1244 PASS.
- TypeScript: PASS.
- ESLint: 0 errors; 5 unchanged legacy warnings.
- Production build: PASS, 136 pages.
- `git diff --check`: PASS.
- Mission governance: PASS.
- TouchLine release-readiness local check: READY (not Production approval).
- Security diff scan: N/A for the final pure geometry/test delta; no API, auth, RBAC, persistence, DTO, secret, or mutation surface changed.

### Rendered formation proof

- 9/9 PASS: Chromium, WebKit, Firefox × 1440×900, 1024×768, 844×390.
- Formation: `4-2-3-1`.
- Cards: 11.
- Exact columns: GK `x=9` (1), defenders `x=34` (4), midfield line 1 `x=52` (2), midfield line 2 `x=70` (3), forward `x=88` (1).
- Exact safe vertical coordinates: `20/40/60/80` for four-player lines, `20/50/80` for three-player lines, `20/80` for two-player lines, and `50` for single-player lines.
- Every card trigger and player assembly remained inside the pitch; no global overflow, loader, console error, page error, or request failure.
- Local artifact root: `outputs/final-lineup-geometry-2e4fb07/` in the Codex task workspace.

### Overlay, controls, and transitions

- 6/6 PASS: Chromium, WebKit, Firefox × desktop and 844×390.
- Card overlay opened from the real Club Hub trigger, remained inside the viewport, closed, restored focusable content, and retained all 11 cards.
- Isolated real client transitions to Live, TouchLine Tables, and Club directory returned complete content without white screen, global loader, overflow, console error, page error, or network failure.
- Local artifact root: `outputs/final-transitions-overlay-2e4fb07-isolated/`.

### Full-site audit

- 441 rendered route/viewport/browser checks: 21 routes × 7 viewports × Chromium/WebKit/Firefox.
- 90 deep route checks: 15 routes × 2 viewports × 3 browsers.
- 174 safe button interactions and 63 internal links.
- Zero navigation failures, server errors, horizontal-overflow failures, network failures, no-effect buttons, click failures, or broken internal links.
- Six WebKit page-error entries in the reload-heavy discovery harness were reproduced as in-flight RSC prefetch cancellation noise; the stable isolated transition run completed 6/6 with zero page errors.
- Artifact roots: `outputs/block10-global-visual-488163d/` and `outputs/deep-interaction-audit-292dba4/`.

### Canonical P0C regression

- 3/3 PASS: Chromium, WebKit, Firefox.
- Arsenal 3–0 Coventry, Full Time.
- Confirmed XI: 11 cards.
- Bukayo Saka: current match 6, cumulative 6, 1 goal, 0 assists, 0 yellow cards, 0 red cards.
- Official table: ready, 20 clubs, no live rows at test time, top ranks Arsenal `1=`, Brentford `1=`, Everton `3=`.
- Player/card ranking remained fail-closed; coach ranking remained available and correct.
- Artifact: `outputs/final-regression-2e4fb07/p0c-public-proof.json`.

### Observability

- Latest QA deployment traffic: 1251 HTTP 200, 198 HTTP 307, 10 HTTP 204 in the observed window.
- 4xx: none.
- 5xx: none.
- Warning/error/fatal runtime logs: none.
- Runtime error clusters: none.

## Preserved state

The QA pre-image and read-only proof retained the CUSTOMER account's `4-3-3`, 11-player saved XI, coach, 35 active contracts, and saved layouts. The final changes were presentation-only and introduced no write path. Save → deploy → refresh state therefore remained authoritative and unchanged.

## Remaining external gates

1. Unlock the Mac, then validate the already-open normal Safari CUSTOMER session and Private Safari ADMIN session without changing either identity. Recheck the final formation geometry, overlay, console/network, and state preservation once.
2. Wait for complete official provider coverage for the 164 blocked published player/card ranking sources; only then rebuild and publish an audited complete snapshot.

Until those external conditions change, no safe local, QA database, automated-browser, deployment, or observability work remains for this checkpoint.
