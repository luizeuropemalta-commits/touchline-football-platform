# TouchLine Current State

Verified: 2026-08-21
Canonical repository: `/Users/luizlopez/Developer/touchline-football-platform`
Active QA worktree: `/Users/luizlopez/Developer/touchline-football-platform-sportmonks-round`
Active source branch: `codex/sportmonks-round-arena-rail` (pushed only to `qa`)
Active validated QA product SHA: `8348baff38025e11cb6e94ad43b649d61b1f6a74` (`fix(cards): show pending editorial state`).

## QA and release

- Stable QA URL: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Validated product deployment: `dpl_ECAKWupNJqnTrYn3Z6oWYaAt5zM8`, product commit `8348baff38025e11cb6e94ad43b649d61b1f6a74`, status READY. The stable QA alias is `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app` and was confirmed on this exact product SHA before the final Safari proof.
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

- **Tables / My Club 404: CLOSED.** The global navigation now distinguishes an authenticated ClubOwner from the platform administrator before exposing `/club-owner/me`. The canonical self route remains session-owned and redirects the QA ClubOwner to `/club-owner/luiz-lopes`; authenticated RSC requests return `200`, anonymous requests return the expected login redirect, and no `404` is reproducible.
- **Authenticated Tables summary: GREEN.** Native Safari on the stable QA alias shows `1` ClubOwner, `35` tracked active contracts and `£171` of currently publicable editorial card value. Two tracked contracts (Anthony Patterson and Rio Cardines) are intentionally excluded from the effective value because their publication memberships are inactive; no provider, sync or database mutation was made in this mission. Preseason ranking order remains neutral until an audited published round exists.
- **Analytics clean navigation: CLOSED.** After clearing native Safari Console and Network, an authenticated reload of Tables and forward navigation through canonical My Club (`/club-owner/luiz-lopes`) to Arena produced only successful `POST /api/touchline-analytics` requests. Safari Console recorded zero new `403` and zero new `404`; deployment-scoped Vercel logs recorded no `4xx` after the clean-run timestamp and only analytics `200` responses in the Tables, My Club and Arena observation windows.
- **Market account metrics / Club Construction header: GREEN.** The authenticated Market header now uses the same server-owned public editorial-price authority as Tables and shows `TouchLine Credits 0`, `Squad card value £171`, `Active contracts 35/35` and `Clubs represented 14`. `Contract Slots` and the decorative non-action `Enter Arena` step are absent; the real `Back to Arena` link remains. Native Safari passed 1440x900, 1280x720, 1024x768 and 844x390 with a clean Console/Network reload. Chromium, WebKit and Firefox passed the expected anonymous login boundary at desktop, tablet-landscape and phone-landscape with no console/page error or horizontal overflow.
- **Club Construction formation switching: GREEN.** On the authenticated QA owner, `4-3-3 → 4-4-2` keeps the page on the pitch, preserves ten eligible starters, moves one forward safely to reserves, exposes one midfielder vacancy and filters the on-pitch picker to eligible midfielders only. Completing the slot persists a valid `1/4/4/2` XI after reload. `4-4-2 → 4-3-3` exposes one forward vacancy and the forward-only picker restores a valid `1/4/3/3` XI. The final QA row matches the pre-test backup for `user_id`, formation, all 11 lineup objects, coach and saved layouts; only `updated_at` changed. Native Safari passed 1440x900, 1280x720, 1024x768 and 844x390. Chromium, WebKit and Firefox passed the expected anonymous login boundary in the same viewports with no console/page error or error overlay.
- **Shared card overlay / Admin exact-record shortcut: GREEN.** Every migrated real-card surface uses the shared zoom overlay and preserves the underlying page/scroll. The authenticated owner sees `EDIT IN CARD ENGINE` with the exact canonical player UUID; the shortcut opened Dermot Mee's Card Engine record and Inbox finding directly. Anonymous browser sessions never received the Admin action.
- **Incomplete-card premium contract: GREEN.** A real incomplete player remains a complete TouchLine card in grayscale and never becomes a generic square. Native Safari proved Dermot Mee across desktop, tablet landscape and 844x390: `CARD PRICE / PENDING`, `CARD STATUS / Review pending`, exact `MISSING FIELD / Market Value`, nationality, position and Admin shortcut. The Card Engine Inbox showed Dermot Mee with exactly one missing field (`Market Value`). Chromium, WebKit and Firefox returned HTTP 200, rendered the same pending/review state and produced zero console/page errors. No Dermot value or other editorial data was written.
- **Browser and runtime evidence:** Chromium passed desktop/tablet/phone-landscape; WebKit and Firefox passed desktop/phone-landscape with no `/club-owner/me` 404 or horizontal overflow. Native Safari Web Inspector showed no 404 after a clean reload. Vercel Observability reported no runtime errors for `/touchline-tables` or `/club-owner/me` in the observed hour.

- **Safari stale-deployment incident: CLOSED.** An already-open tab retained assets from deployment `dpl_AMVH4DELGqeVQ3vdg67SQwEj493u` (commit `1130455`) while the stable alias pointed to deployment `dpl_5GCTMjjJnanBgFjWdrkqukuwrkf6` (commit `486e790`). A cache-bypass reload loaded the current asset graph; a following ordinary reload also passed. Server evidence was HTTP 200, `Age: 0`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and `x-vercel-cache: MISS`.
- **P1 responsive Market QA:** complete native/automated observation at 1440, 1280, 768 and 390, including keyboard, touch/scroll, zoom modal and selection persistence.
- **P1 authenticated Arena 4-3-3 video QA:** complete for desktop, tablet landscape and phone landscape in native Safari. The three camera loops retain the 1/4/3/3 formation on the pitch; anonymous Chromium, WebKit and Firefox smoke tests returned HTTP 200 with no console errors. Browser engines do not carry the native authenticated QA session.
- **P1 authenticated Arena Quick Sub HUD:** complete in native Safari at 1440×900, 1280×720, 1024×768 and 844×390. The rail keeps all 11 field controls visible and one intact `4 + coach + 5` bench row; client-side close restores the score rail without a document reload. A live 1280×720 observation caught and corrected the clipped tenth tile before final QA deployment. Chromium, WebKit and Firefox reached the expected login boundary with no console/page error or overflow; their anonymous sessions do not substitute for Safari owner evidence.
- **P1 security backlog:** checkout quota race, mutating starter-sync GET/CSRF boundary, tenant-pivot/RLS and SECURITY DEFINER grants remain separately gated findings; none is being silently changed during visual QA.

## Next executable action

Blocks 1 through 4 of the premium Market / Club Construction programme are closed on QA. The next executable action is Block 4B only: implement the canonical coach-contract lifecycle, immutable cancellation/replacement history and versioned `coach_scoring_v1` Home/Away points without retroactive scoring. Do not reopen Sportmonks authentication, fixture sync, Matchweek, Tables/My Club or analytics without new regression evidence. Production remains forbidden until the complete release manifest and explicit promotion gate pass.

Canonical programme addendum registered on 2026-08-21: in Block 3, preserve both Admin paths (`Card Engine Inbox` and the exact-record `Edit in Card Engine` card-overlay shortcut); in Block 4, apply the complete premium grayscale/PENDING/Card Engine review contract; immediately afterward execute Block 4B for coach contracts, cancellation/replacement history and versioned Home/Away TouchLine Points. Final regression must include one real official Live match when observable, provider-to-TouchLine latency/status/event/HT/FT/archive consistency, Live/Arena agreement, fail-safe reconciliation and saved user-state preservation across a new QA deployment. For the subjects it explicitly covers, it supersedes earlier programme wording.

The permanent Codex environment is ready for product work. Do not continue environment optimization unless a new material environment blocker appears.

For detailed immutable evidence, use `CURRENT_EXECUTION_LEDGER.md`.
