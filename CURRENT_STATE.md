# TouchLine Current State

Verified: 2026-08-18
Canonical repository: `/Users/luizlopez/Developer/touchline-football-platform`
Active QA worktree: `/Users/luizlopez/Developer/touchline-football-platform-qa`
Active branch: `qa`
Active validated QA SHA: `7474e2e` (`fix(arena): fit quick sub rail at 1280`).

## QA and release

- Stable QA URL: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Current QA deployment: `dpl_AZaGsRg3QfQgt8pGegpF4EWsBwvC`, commit `7474e2e`, status READY. Its stable QA alias is `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- The representative seven-tier QA scenario, protected 4-3-3 video coordinate source and Quick Sub premium responsive HUD are deployed and visually verified. Production remains excluded.
- Market P0 patch removed a redundant client auth precheck and bounds the Arena-state request to 8 seconds. Full Vercel release build passed: TypeScript, ESLint with 0 errors/4 pre-existing warnings, 948/948 tests, and 133/133 generated pages.
- Native Safari Market now passes a cache-bypass reload and a subsequent ordinary reload. The page renders the authenticated 35-player QA scenario and current card catalogue.
- Production, `touchline.com.br`, DNS, payments, Production database and card-publication gate were not changed by the QA mission.

## QA database

- Isolated QA project: `xgxbwqxjssxxuihuwmgy`.
- Representative run `bf476289-c6df-47a6-878e-7dc8c40f3f91` contains 20 clubs, 588 canonical players/memberships, 562 published cards, 35 active contracts, coach `455907`, 11 starters, 9 substitutes, 15 outside the matchday squad and 20 reversible QA fixtures. Its active canonical tier distribution is ruby-red `6`, sapphire-blue `4`, amethyst-purple `6`, radiant-gold `6`, emerald-green `6`, clear-diamond `3`, diamond-gold `4`.
- The package is deterministic, rollback-proven and replay-idempotent. Rollback restored 35 prior cards with an unchanged ledger, and the next apply returned `already_applied`; all 35 active contracts have valid published canonical price/tier metadata. Production data and credentials were not copied or changed.
- New authenticated QA work must pass the canonical-persona preflight: QA project `xgxbwqxjssxxuihuwmgy`, owner `jl_nenelopes10@hotmail.com`, UUID `072900f3-27fc-41a5-9881-6913a486754e`, and the stable `qa` branch alias. The former technical account is a **HISTORICAL QA ACTOR** only and is blocked from new test selection.

## Security correction in validation

- QA migration `058_football_provider_metadata_server_boundary.sql` has been applied only to project `xgxbwqxjssxxuihuwmgy`. It removes browser-role access to `football_provider_mappings` and `football_data_sync_runs`; the latter can contain raw provider payloads. Only `service_role` retains table privileges.
- `/api/football-data/foundation` continues to expose only its explicit sanitized sync-run projection, now read through the server admin client after request authentication. No football, card, contract, auth or Production data changed.
- Focused boundary tests `4/4`, full suite `996/996`, TypeScript, scoped ESLint and production build (133 routes) passed. The QA database privilege query confirmed only `postgres` and `service_role` retain access.

## Active P0/P1 gates

- **Safari stale-deployment incident: CLOSED.** An already-open tab retained assets from deployment `dpl_AMVH4DELGqeVQ3vdg67SQwEj493u` (commit `1130455`) while the stable alias pointed to deployment `dpl_5GCTMjjJnanBgFjWdrkqukuwrkf6` (commit `486e790`). A cache-bypass reload loaded the current asset graph; a following ordinary reload also passed. Server evidence was HTTP 200, `Age: 0`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and `x-vercel-cache: MISS`.
- **P1 responsive Market QA:** complete native/automated observation at 1440, 1280, 768 and 390, including keyboard, touch/scroll, zoom modal and selection persistence.
- **P1 authenticated Arena 4-3-3 video QA:** complete for desktop, tablet landscape and phone landscape in native Safari. The three camera loops retain the 1/4/3/3 formation on the pitch; anonymous Chromium, WebKit and Firefox smoke tests returned HTTP 200 with no console errors. Browser engines do not carry the native authenticated QA session.
- **P1 authenticated Arena Quick Sub HUD:** complete in native Safari at 1440×900, 1280×720, 1024×768 and 844×390. The rail keeps all 11 field controls visible and one intact `4 + coach + 5` bench row; client-side close restores the score rail without a document reload. A live 1280×720 observation caught and corrected the clipped tenth tile before final QA deployment. Chromium, WebKit and Firefox reached the expected login boundary with no console/page error or overflow; their anonymous sessions do not substitute for Safari owner evidence.
- **P1 security backlog:** checkout quota race, mutating starter-sync GET/CSRF boundary, tenant-pivot/RLS and SECURITY DEFINER grants remain separately gated findings; none is being silently changed during visual QA.

## Next executable action

Block 3 is closed. Do not begin Live work from this checkpoint. Any later Arena change must preserve the verified 4-3-3 `formation + loop + viewport` source and the Quick Sub `4 + coach + 5` responsive rail, then repeat native Safari plus browser-engine QA. Production remains forbidden until the complete release manifest and explicit promotion gate pass.

The permanent Codex environment is ready for product work. Do not continue environment optimization unless a new material environment blocker appears.

For detailed immutable evidence, use `CURRENT_EXECUTION_LEDGER.md`.
