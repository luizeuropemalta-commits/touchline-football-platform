# TouchLine Final Zero-Defect Audit — Execution Ledger

Status: IN PROGRESS  
Scope: full commercial-release audit requested on 2026-08-05.  
Production: read-only validation only; no production promotion is permitted for this audit.

## Audit sequence

| Area | Product walk-through | Code/data review | Responsive/browser matrix | Defects reproduced | Revalidated |
| --- | --- | --- | --- | --- | --- |
| Entry, authentication and recovery | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| ClubOwner, coach-first and squad builder | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Market and contracts | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Arena, Match Centre and live states | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Player, coach and club profiles | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Tables, rankings and Top 11 | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| TouchLine Central, Inbox and notifications | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Admin, permissions and observability | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| APIs, data integrity, migrations and security | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
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

## Implemented during this audit (not deployed)

- `lib/football-data/squad-snapshot-store.ts` now reads memberships only from a club's canonical competition and writes that competition ID on every refreshed membership.
- `supabase/migrations/049_scope_legacy_squad_memberships_to_club_competition.sql` is a repair-only migration: it scopes active unscoped Sportmonks rows to the already-canonical club competition and adds a matching partial index. It creates no new public access and changes no player, club, status or historical record.
- `scripts/audit-touchline-player-profiles.mts` now includes players awaiting a verified shirt number in the identity audit but retains their card-eligibility boundary.

## Validation evidence

- Targeted snapshot-store tests: 8 passed.
- Full automated suite: 633 passed.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Local server roster read: all 20 England clubs, 565 unique canonical players, snapshot source only.

## Next audited action

Continue from the first unverified authenticated journey: a controlled ClubOwner with an already-persisted coach, then validate Market, roster, Training Centre, Inbox and notifications without changing production data. Follow with the viewport/browser matrix and the remaining server/API/RLS review.
