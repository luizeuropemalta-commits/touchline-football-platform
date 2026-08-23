# TouchLine QA Blocks 9–10 and Final Visual Audit — 2026-08-23

## Scope and safety

- Environment: QA Preview only.
- Stable QA alias: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Runtime SHA under test: `a27081eefdcb25a8db44ba0dbbf3c9f7924f456c`.
- Deployment: `dpl_6f2KDnM59fbyvBZi6M9DZbbhG7KH` (`READY`, Preview).
- Production: **NOT TOUCHED**.
- Existing user changes in `CURRENT_STATE.md`, the canonical persona audit, the final-product ledger, and `tsconfig.tsbuildinfo` were preserved and not staged.

## Canonical status

- Blocks 5–8: previously GREEN; not reopened without a demonstrated regression.
- Block 9: GREEN. The single official table renders 20 clubs, canonical shared sports ranks (`1=`, `1=`, `3=`), tied accessibility, P/W/D/L/GF/GA/GD/PTS, live-state support, and no second table.
- Block 10 automated and rendered gates: GREEN in Chromium, WebKit, and Firefox across desktop, tablet, phone landscape, and the wider responsive matrix.
- Native Safari CUSTOMER and ADMIN gates: GREEN. The normal CUSTOMER window remained authenticated as `jl_nenelopes10@hotmail.com`; the Private ADMIN window remained authenticated as `admin@touchline.com.br`. Neither session was logged out, switched, cleared, or otherwise modified.
- Ranking player/card: `BLOCKED / EXTERNAL DATA COVERAGE — 164 published cards still lack the complete official provider facts required for a publishable snapshot`. No partial snapshot was published and missing facts were not converted to zero.

## Findings repaired

1. Official standings tied-position targets were below the 44px touch minimum. Repaired in `292dba46eb353d668ad2ad3be1b421e769f35dea`.
2. The Club Hub player-card ranking link was 42px high. Repaired to 44px in the same commit.
3. A persisted `4-2-3-1` label was rendered as a collapsed `1+4+5+1` geometry because midfield tactical sub-lines were aggregated. Repaired in `709a122c2cc412fe9027ea763c12ded879bef6e4` with canonical columns `1+4+2+3+1`.
4. Outer cards at `y=86%` extended beyond the painted pitch. Repaired in `2e4fb07216593e64fd3da1d46287a10e761f06cb` by the shared Club Hub/Market safe span `20%–80%`.
5. The authenticated ClubOwner profile displayed `33/35` capacity because it counted only renderable/published player cards, while Market correctly used all 35 authoritative active contracts. Repaired in `a27081eefdcb25a8db44ba0dbbf3c9f7924f456c`: private capacity now uses `ownedContractCount`; playable roster remains 33 (`11` XI + `22` bench); failed/expired authoritative reads render unavailable instead of demo or partial data.

## Verification evidence

### Code and release

- Focused affected tests: 27/27 PASS after the final repair.
- Complete suite: 1245/1245 PASS.
- TypeScript: PASS.
- ESLint: 0 errors; 5 unchanged legacy warnings.
- Production build: PASS, 136 pages.
- `git diff --check`: PASS.
- Mission governance: PASS.
- TouchLine release-readiness local check: READY (not Production approval).
- Security diff scan for `3b06c44..a27081e`: complete coverage, 0 findings. Authenticated capacity remains scoped to the server-derived ClubOwner identity; timeout/error remains fail-closed; no private roster/wallet fallback or new mutation surface was introduced.

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

### Native Safari CUSTOMER

- Arena: PASS, no global loader or white screen; the same 11 saved card triggers rendered after the one authorized normal reload and again after the final QA deployment.
- Formation/state: `4-3-3`, 11-player XI and coach Unai Emery preserved; no card, contract, formation, or session reset occurred.
- Overlay: Álvaro Rodríguez card opened and closed successfully.
- Private profile: PASS, `VERIFIED PRIVATE AREA`, `35/35` club capacity, `100%` slots used, `0` contract slots, `35` active contracts, `11/11` Starting XI and unified bench `22` (1 GK, 5 DF, 8 MF, 8 FW).
- Console: clean; only the Safari `Console opened` marker was present.
- Network/runtime: profile, Arena, roster, state, coach, inventory and squad reads returned expected successful Preview responses; no 4xx/5xx was observed. Vercel's deployment-specific 5xx query returned no records.
- Final focused location: Arena in the normal Safari window.

### Native Safari ADMIN

- Private Safari remained authenticated as `admin@touchline.com.br` on protected Card Inventory.
- RBAC/render: PASS; `Owner protected`, `Luiz Lopez TouchLine Owner`, and 120 published cards rendered without loader or white screen.
- Console: 0 application errors. Two benign Safari CSS preload advisories referenced an older cached deployment and did not reproduce as a runtime/product failure.
- Network: 24 resources, 2 domains, 0 redirects, no unexpected failure.
- No save, logout, account switch, cookie/storage clear, or Admin data mutation was performed.

### Observability

- Final QA deployment `dpl_6f2KDnM59fbyvBZi6M9DZbbhG7KH`: Preview and stable alias both resolved READY.
- Deployment-specific traffic captured the authenticated Safari proof: `/club-owner/me`, `/arena`, `/api/touchline-arena/roster`, `/api/touchline-arena/state`, coach, Market inventory, Premier squad and Live endpoints returned expected 200/204/206 responses.
- 5xx query: none.
- Unexpected 4xx, warning/error/fatal runtime logs, and runtime error clusters: none.

## Preserved state

The QA pre-image and native Safari proof retained the CUSTOMER account's `4-3-3`, 11-player saved XI, coach Unai Emery, 35 authoritative active contracts, 33 currently renderable player cards (`11` XI + `22` bench), zero free contract slots, and saved layouts. The capacity repair introduced no write path. Save → deploy → refresh state remained authoritative and unchanged.

## Remaining external gates

1. Wait for complete official provider coverage for the 164 blocked published player/card ranking sources; only then rebuild and publish an audited complete snapshot.

That external data-coverage gate does not reopen Blocks 5–10 or the final regression and must not be bypassed with a partial snapshot or missing-as-zero data.
