# TouchLine Final Zero-Defect Audit — Execution Ledger

Status: IN PROGRESS  
Scope: full commercial-release audit requested on 2026-08-05.  
Production: read-only validation only; no production promotion is permitted for this audit.

## Audit sequence

| Area | Product walk-through | Code/data review | Responsive/browser matrix | Defects reproduced | Revalidated |
| --- | --- | --- | --- | --- | --- |
| Entry, authentication and recovery | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| ClubOwner, coach-first and squad builder | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS |
| Market and contracts | IN PROGRESS | NOT STARTED | NOT STARTED | IN PROGRESS | IN PROGRESS |
| Arena, Match Centre and live states | IN PROGRESS | NOT STARTED | IN PROGRESS | NOT STARTED | IN PROGRESS |
| Player, coach and club profiles | IN PROGRESS | NOT STARTED | IN PROGRESS | NOT STARTED | IN PROGRESS |
| Tables, rankings and Top 11 | IN PROGRESS | NOT STARTED | IN PROGRESS | NOT STARTED | IN PROGRESS |
| TouchLine Central, Inbox and notifications | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS |
| Admin, permissions and observability | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS |
| APIs, data integrity, migrations and security | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | IN PROGRESS |
| Assets, localisation, accessibility and performance | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |

## Evidence rules

- A route is not accepted on an HTTP status alone: rendered state, navigation, errors and empty/loading states must be observed.
- A shared visual defect is corrected at its shared source and rechecked across every consumer.
- Demonstration and audit-only routes are not evidence for product functionality.
- No football value is invented to make a screen look complete.
- Screenshots, route traces and detailed findings remain under this local audit directory; the final report will link to the packaged evidence.

## Recorded observations

| UTC+2 | Surface | Observation | Classification | Follow-up |
| --- | --- | --- | --- | --- |
| 2026-08-05 09:42 | Authenticated entry | An account without a confirmed coach is gated at **Escolha seu treinador**; no player-selection action was invoked. | Expected coach-first state | Complete the workflow in a controlled persona. |
| 2026-08-05 09:45 | Public and protected routes | Public profile, club, coach, table, ranking, live and auth pages returned 200 anonymously. Protected operational routes returned 307 to authentication anonymously. | Initial route boundary pass | Validate rendered content, error states and all alternate viewports. |
| 2026-08-05 10:03 | England roster read model | Production data review found 565 active members scoped to TouchLine England plus 21 legacy active rows without `competition_id` across the same 20 clubs. The public snapshot was therefore able to return 586 instead of the canonical 565. | Confirmed data-integrity defect | Local server read is now competition-scoped; migration 049 repairs only the 21 unscoped rows when separately approved for remote application. |
| 2026-08-05 10:13 | England roster revalidation | Local production build served all 20 persisted competition-scoped squads: 565 unique players, valid profile links and no duplicate provider IDs. | Local fix validated | Keep production read-only. Run remote migration preflight/application only in the approved external-gate workflow. |
| 2026-08-05 10:16 | ClubHub commercial cards | A public Manchester United lineup displayed a Ruby fallback as `£0` while the same verified player profile could display a different canonical price. The fallback was a visual default, not verified economy data. | Confirmed commercial-data presentation defect | Shared card now labels unavailable economics as `Pendente`/`Pending`; £0 remains possible only for a verified numeric zero. |
| 2026-08-05 10:18 | ClubHub commercial revalidation | Local production build rendered the Manchester United predicted lineup with 11 visible `PREÇO DO CARD PENDENTE` states and no `£0` fallback. | Local fix validated | Check all card consumers and responsive variants in the remaining visual matrix. |
| 2026-08-05 10:21 | Registration and recovery forms | Before hydration, the client-side registration/recovery forms used the browser default GET method; an early native submission could place credentials in the address bar. | Confirmed defensive auth-flow defect | Every auth form now declares POST. Hydrated registration/recovery behavior is unchanged; an early submission cannot leak credentials via URL. |
| 2026-08-05 10:24 | Public fixture API boundary | Anonymous fixture and live-score JSON responses expose internal provider identifiers in `id`, `provider` and nested `source` fields. The visible UI uses TouchLine branding, but the public transport DTO does not yet meet the branding boundary. | Confirmed public metadata defect | Create a provider-free public fixture DTO and adapt client hydration without altering internal database/source metadata. |
| 2026-08-05 10:30 | Public fixture API revalidation | New server-owned DTO retains stable numeric fixture/team IDs, score, schedule, crest and TouchLine verification time while removing provider name/source fields from both public schedule and snapshot endpoints. Local Match Centre remained interactive after client refresh. | Local fix validated | Include this endpoint class in the full public API metadata sweep. |
| 2026-08-05 10:33 | Anonymous API sweep | Public football and Arena reads returned the expected public or fail-closed responses. Tested responses contained no Sportmonks, API-Football or Transfermarkt branding. Owner/mutation endpoints returned 401/403/405 without disclosing technical payloads. | Initial API boundary pass | Continue authenticated mutation and admin persona coverage. |
| 2026-08-05 10:39 | Public player-card ranking | Unverified player records correctly rendered `Pendente` inside the shared card but ranking summary, list and contract zoom independently derived the visual fallback tier and exposed `£0`. | Confirmed commercial presentation defect | Reuse the verified-economy boundary for every public price consumer; do not add unavailable values to aggregates. |
| 2026-08-05 10:44 | Player profile contract state | An unverified player profile could display `Pendente` while still offering a visible `Contratar jogador` action and an `Disponível` feed state. The Market itself correctly disallows an unpriced selection, so the profile promise was inconsistent. | Confirmed UX/commercial-state defect | Suppress the contract action until a verified card offer exists and identify the feed state as updating. |
| 2026-08-05 10:50 | Match Centre mobile | At 390 px the 29-fixture selector rendered before the selected fixture and required traversing the whole group before seeing match detail. | Confirmed responsive UX defect | Show the selected match first at tablet/mobile widths and return focus/viewport to it after mobile fixture selection. |
| 2026-08-05 10:54 | Match Centre mobile revalidation | The 390×844 viewport now opens with the selected fixture and its state, countdown and information panels first; the fixture rail remains available below as a horizontal selector. | Local visual fix validated | Continue representative tablet/desktop checks and full authenticated coverage. |
| 2026-08-05 12:02 | Market Transfer | Anonymous Market journey loaded the twenty-club selector, club roster, search/filter controls and card detail. Every player with unavailable verified economics remained visibly pending and its contract action was disabled; no contract mutation was performed. | Safe empty/unavailable commercial state | Repeat the complete purchase flow only with a controlled authenticated persona and verified offer. |
| 2026-08-05 12:04 | Coach-first / Training Centre | A user without a persisted coach saw the coach gate but the standalone Training Centre still exposed underlying operational controls to the accessibility tree. In addition, the gate told the user to sign in without offering a direct entry path. | Confirmed coach-first accessibility and journey defect | Shared Arena content is now inert/aria-hidden while the gate is active, and the gate exposes a safe localized login return link. |
| 2026-08-05 12:10 | Coach-first revalidation | The no-coach Training Centre exposes only the coach-first gate and a localized login link returning to the Arena; the prior `Vaga do treinador` control is absent from the accessible tree. The desktop visual state was saved locally. | Local functional and visual fix validated | Validate the persisted-coach journey using a controlled account without modifying production data. |
| 2026-08-05 12:12 | Match Centre | Public Match Centre listed 29 upcoming fixtures, exposed selected-match schedule/status/data-unavailable states honestly, and a different fixture changed the selected detail and the `fixture` URL to the exact numeric fixture ID. | Local public journey pass | Cover live/finished fixtures when the canonical feed has them and complete responsive/browser matrix. |
| 2026-08-05 12:22 | Standalone coach-first visual pass | The blocked Training Centre title was still visible behind the mandatory gate on compact screens. The shared standalone gate now fills the operation surface; mobile, tablet and desktop all retain the localized login link and hide operational controls from the accessible tree. | Local visual and accessibility fix validated | Persisted-coach user journey remains the only outstanding coach-first evidence. |
| 2026-08-05 12:27 | Communication and Admin boundaries | Anonymous visits to Inbox, notification preferences and every Admin entry were redirected to the localized first-party login route; no operational content or raw diagnostic state rendered before authentication. | Local route-boundary pass | Exercise read/write flows only with controlled authenticated roles. |
| 2026-08-05 12:30 | Player, coach, club and table surfaces | Public Haaland profile separated previous season, current season, last five and selected fixture with clear unavailable states. Coach profile showed its approved tier offer plus pending real-football history without invention. ClubHub, tables, rankings and Top 11 states preserved `Pendente`/preseason notices rather than fabricating prices or published standings. | Local public journey pass | Complete visual/browser matrix and controlled authenticated actions. |
| 2026-08-05 12:41 | Responsive product matrix | Match Centre, Player Profile and ClubHub were opened at 390×844, 844×390 and 768×1024 where applicable. Their document width equalled the viewport at every observation; Match Centre and ClubHub mobile captures retained readable primary content without horizontal clipping. | Local responsive pass for representative public surfaces | Continue the remaining public surfaces and native WebKit/device coverage. |
| 2026-08-05 12:43 | Controlled persona availability | No controlled ClubOwner or Admin credential/session is configured in the local audit environment. Existing documentation independently records the same limitation. No real-user credential, production data or commercial mutation will be used as a substitute. | External test-persona gate | Continue all anonymous/read-only technical checks; record authenticated journeys as not yet validated. |
| 2026-08-05 12:48 | API boundary sweep | Public schedule, live-score and active-card-ranking reads returned sanitized application DTOs with no public provider wording. Owner state, roster, inventory, coach and notification endpoints returned 401 anonymously; Admin finance returned 403 and the write-only Inbox route returned 405. | Local anonymous API boundary pass | Complete source/RLS review and controlled authenticated mutation coverage. |
| 2026-08-05 12:52 | Server ownership and migration review | Arena state and coach routes authenticate server-side, use the authenticated user ID only and validate roster/coach identity before writes. Migrations 043 and 048 are service-role/server owned with RLS enabled and public/authenticated grants revoked; 047 is additive nullable coach identity; 049 is a local repair-only scope migration pending separate remote approval. | Local source/RLS contract pass | Remote database history and controlled cross-session persistence remain external validation gates. |
| 2026-08-05 13:04 | ClubOwner contracted-card economy | Read-only inventory audit found all 600 inventory cards have a valid approved tier, but 595 retain retired `2026-07-tc-v2` metadata whose numeric values were expressly replaced. The old table was not surfaced. Active server contracts now carry a narrowly scoped authority flag and render the stored tier using the canonical current 0/1/2/4/7/10/15 values and England GBP. Unknown versions or missing tiers remain fail-closed. | Confirmed stale-metadata presentation defect; local correction validated | Use a controlled ClubOwner account to visually confirm its persisted roster after the next safe Preview; no database rows or contracts were changed in this audit. |

## Implemented during this audit (not deployed)

- `lib/football-data/squad-snapshot-store.ts` now reads memberships only from a club's canonical competition and writes that competition ID on every refreshed membership.
- `supabase/migrations/049_scope_legacy_squad_memberships_to_club_competition.sql` is a repair-only migration: it scopes active unscoped Sportmonks rows to the already-canonical club competition and adds a matching partial index. It creates no new public access and changes no player, club, status or historical record.
- `scripts/audit-touchline-player-profiles.mts` now includes players awaiting a verified shirt number in the identity audit but retains their card-eligibility boundary.
- `lib/touchlineArena/commercial-card-pricing.ts` now has one verified-economy public-price boundary. A nominal `£0` remains valid only when its zero tier was actually verified; visual fallback frames and missing market values render `Pendente`/`Pending`.
- Player-card rankings, ClubOwner card surfaces, public ClubHub zooms, player profiles and table-card zooms use that boundary instead of treating a fallback tier as an offer. Ranking aggregates become pending whenever any included card is unverified.
- The player profile now withholds its contract CTA and availability claim until the price is verified; the Match Centre puts match detail ahead of the fixture rail on compact screens.
- Coach-first now makes the downstream Arena/Market/Training interaction layer inert and hidden from assistive technology until a coach is persisted. An unauthenticated user receives an explicit localized login link with a safe return destination instead of a dead-end status message.
- Active ClubOwner cards now retain their server-proven inventory/contract tier as the commercial source of truth. The exact card, ClubOwner summaries and zooms display the canonical England nominal price even while the live football market-value cache is pending. Public Market and ClubHub cards remain pending until their live economy is verified.

## Validation evidence

- Targeted snapshot-store tests: 8 passed.
- Full automated suite: 633 passed.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Local server roster read: all 20 England clubs, 565 unique canonical players, snapshot source only.
- Targeted commercial-price and Match Centre tests: 12 passed.
- Full automated suite: 636 passed.
- TypeScript and ESLint: passed after the commercial and responsive corrections.
- Production build: passed after the commercial and responsive corrections.
- Visual evidence: `evidence/match-centre-mobile-390x844.png` (before) and `evidence/match-centre-mobile-after-390x844.png` (after); kept locally only.
- Coach-first targeted contract test: 5 passed.
- TypeScript, ESLint and production build: passed after the coach-first accessibility/journey correction.
- Visual evidence: `evidence/coach-first-training-lock-desktop.png` and `evidence/coach-first-training-lock-with-login-desktop.png`; kept locally only.
- Responsive visual evidence: `evidence/coach-first-training-full-surface-mobile-390x844.png`, `evidence/coach-first-training-full-surface-tablet-768x1024.png` and `evidence/coach-first-training-full-surface-desktop.png`; kept locally only.
- Full automated suite after coach-first corrections: 636 passed.
- Responsive visual evidence: `evidence/match-centre-mobile-390x844-final-audit.png`, `evidence/match-centre-mobile-landscape-844x390-final-audit.png`, `evidence/player-profile-mobile-390x844-final-audit.png` and `evidence/club-hub-mobile-390x844-final-audit.png`; kept locally only.
- Contracted-card pricing read-only remote check: 600/600 inventory cards have a valid tier and an explicitly recognized current or retired policy marker; no unknown pricing table was found. The retired `2026-07-tc-v2` marker is mapped only to the current approved numeric policy, never shown as its former values.
- Contracted-card targeted tests: 30 passed. Full automated suite: 640 passed. TypeScript, repository ESLint and production build: passed after the correction.

## Next audited action

Continue from the first unverified authenticated journey: a controlled ClubOwner with an already-persisted coach, including visual confirmation of the corrected contracted-card colours and canonical values, then validate Market, roster, Training Centre, Inbox and notifications without changing production data. Follow with Arena live/finished states, the tablet/desktop viewport matrix and the remaining server/API/RLS review. The route inventory contains 74 Next page/route handlers; audit-only and visual-QA routes remain excluded from production acceptance evidence.
