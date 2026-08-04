# TouchLine England — Player-season statistics integrity audit

**Audited at:** 2026-08-04
**Scope:** read-only production-data inspection and local production-build validation. No production schema, fixture, player, financial, Stripe, Wallet, or Touch Credits data was changed.

## Result

The prior visible Haaland line (`4 appearances`, `3 goals`, `1 assist`, `232 minutes`, `3 starts`) was **not a verified completed-season total**. It was a legacy aggregate stored in the player-profile snapshot without a canonical TouchLine season mapping, eligible-fixture list, fixture-level evidence, or coverage claim. It is therefore removed from the public completed-season presentation rather than being relabelled as a season total.

The audited current England dataset contains **568 active player memberships**, all with a unique numeric mapped external player identity. The local dataset has one current season (`2026/2027`, external season `28083`), 29 future/current fixtures, **zero finished fixtures**, no prior completed season row, and no canonical player-season statistics table in the production schema at audit time. Consequently, no player's historical numbers can honestly be called complete or partial yet. The public state is explicitly unavailable; it is never shown as zero or as a complete season.

| Finding | Count / result |
|---|---:|
| TouchLine England players audited | 568 |
| Complete previous-season aggregates | 0 |
| Partial previous-season aggregates | 0 |
| Unavailable previous-season aggregates | 568 |
| Incorrect TouchLine/external player mappings | 0 |
| Finished current-season fixtures | 0 of 29 |
| Canonical read-model table in production | Not present (migration 048 not applied) |

## Haaland root cause and corrected state

| Check | Evidence |
|---|---|
| TouchLine player ID | `a1e3b920-4b73-4588-bd08-ff19e70a74fc` |
| External player ID | `154421` |
| Mapping / club / competition | Valid in the active England squad membership audit |
| Legacy snapshot label | `2025/2026`, external season `25919` |
| Canonical season mapping | Missing: the snapshot season is not present in `football_seasons` |
| Fixture coverage | Missing: no expected fixture set, fixture statistics, or completed-fixture evidence exists |
| Provider pagination / aggregation proof | Not available in the stored historical data |
| Root cause classification | **Unverified legacy aggregate with an incorrect/incomplete local season mapping and incomplete fixture coverage** |

This excludes the old values from every canonical season consumer. The corrected canonical values for Haaland's prior season are **unavailable** until the historical season, membership, fixture, lineup, and coverage backfill is verified. Current season, last five, and current/selected fixture are independently unavailable until their own data exists; they are not derived from the old snapshot.

## Implemented canonical model

The following safe, server-owned read model has been added locally:

- `supabase/migrations/048_touchline_player_season_statistics_read_model.sql`
- `lib/touchlineArena/player-season-statistics.ts`
- `lib/touchlineArena/player-season-statistics-server.ts`
- `lib/football-data/player-season-statistics-sync.ts`
- `lib/football-data/player-season-statistics-store.ts`
- `app/api/football-data/player-season-statistics/sync/route.ts`

It makes a completed season complete only when the exact expected eligible fixture set matches the deduplicated aggregated fixture set. The model carries previous completed season, current season, last five fixtures, and selected/current fixture as separate values. Unknown statistics remain unavailable. Incomplete coverage uses the required message:

> Partial data — X of Y eligible fixtures synchronised

The Player Profile consumes that server-owned model. It no longer reads or aggregates legacy profile-snapshot season statistics. The API sync path uses only persisted TouchLine data; it never calls an external provider while serving a profile. The same model is designed as the single source for Club Profile, Market, Club Hub, rankings, statistics, Top 11, and historical Match Centre before those consumers display season totals.

## Public wording

The reviewed public Player Profile, Coach Profile, Club Hub lineup, Match Centre, Arena availability, and football-data response wording now use **TouchLine Verified**, **Verified by TouchLine**, **TouchLine Data**, or **TouchLine Central Update**. No reviewed public rendered surface exposes an infrastructure-provider name. Provider identities remain only in implementation metadata and internal diagnostics.

## Validation completed

- Read-only production data audit: passed; 568 England player mappings inspected.
- New model integrity tests: passed, including duplicate-fixture prevention, incomplete-coverage messaging, legacy-complete downgrade, service-role migration boundary, and public-branding contracts.
- TypeScript: passed.
- ESLint: passed.
- Full test suite: passed, 631 tests / 0 failed.
- Production build: passed.
- Local production browser at 1280px: passed; Portuguese profile contains the four independently labelled data sets, Portuguese unavailable state, no old Haaland aggregate, no public provider reference, and no horizontal overflow.

## Required external gate before any historical claim

1. Apply reviewed non-financial migration `048_touchline_player_season_statistics_read_model.sql` in a controlled environment; it is not applied by this audit.
2. Backfill the official previous England season, player-season memberships, all eligible fixtures, and persisted lineup/statistics records with source timestamps.
3. Run the controlled canonical sync, verify expected versus aggregated fixture identifiers for every player, and re-run this audit.
4. Only then allow the shared consumers to display complete or partial historical totals. Until then, the unavailable state is the correct public state.

Production promotion remains prohibited until this gate and the pre-existing migration/persona/email/device/snapshot/observability gates are complete.

## Existing external-migration checks

The same read-only production schema check confirms that migration `047` is not
applied (`touchline_user_arena_state.coach_provider_id` is absent), and the
three migration `043` TouchLine Central inbox tables are absent. Both remain
safe, reviewed, non-financial migrations but are **BLOCKED** until their
controlled production application and verification. This audit made no attempt
to apply either migration.
