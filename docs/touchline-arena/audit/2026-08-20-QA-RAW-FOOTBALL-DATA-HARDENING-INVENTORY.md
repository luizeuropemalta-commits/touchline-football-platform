# TouchLine QA raw football-data hardening inventory

Date: 2026-08-20
Scope: QA source and isolated QA Supabase project `xgxbwqxjssxxuihuwmgy` only. Production is not a target of this migration.

## Decision

`football_players`, `football_clubs`, `football_squad_members`, and
`football_seasons` are normalized provider-source tables. They are no longer a
browser/PostgREST contract. `anon` and `authenticated` receive no table
privileges and no RLS policies; server-side `service_role` consumers continue
to own sync, reconciliation and approved read models.

The former broad `GET /api/football-data/foundation` response is now an
owner/server diagnostic contract. It uses an admin client only after owner or
server-secret authorization and maps selected rows through explicit DTOs. It
does not return provider IDs/payloads, raw market value/currency, contract
dates, provider error text, or sync internals.

## Reader inventory

| Consumer | Data needed | Current source | New safe source |
| --- | --- | --- | --- |
| Arena | active roster identity, membership, approved card presentation | persisted squad snapshot + server read models | `GET /api/football-data/premier-squad` public squad/card DTO |
| Club Hub | 11 visible squad slots, names, positions, nationality, cards | server authoritative roster + public projection | `GET /api/football-data/premier-squad` public squad/card DTO |
| Player Profile | canonical identity and approved card/valuation status | server-only profile and public-projection readers | profile-specific public projection and editorial-card DTO |
| Market | published inventory, editorial tier/price and approved valuation | server-only market/publication read models | Market inventory and public editorial-card DTOs |
| Live | persisted fixture schedule/results | server fixture snapshot/store | fixture schedule and live snapshot DTOs; no foundation-table browser read |
| Admin pages (`admin`, `admin/football-data`, `admin/manual-card-editorial`) | source audit and editorial repair | server admin client | owner-gated server routes/pages using `service_role` |
| Admin APIs (`admin/cards`, `admin/manual-card-editorial`) | canonical player/club correlation | owner-gated admin client | owner-gated server API, existing RLS/service boundary |
| Owner diagnostics (`foundation`, `provider-diagnostic`) | bounded reconciliation evidence | raw normalized rows/provider call | owner or server-secret allowlisted diagnostics DTO |
| Sportmonks sync (`starter-sync`, `fixture-schedule-store`, `squad-snapshot-store`, `qa-country-sync`, `qa-twenty-club-roster-sync`) | provider import/upsert/reconciliation | server `service_role` | unchanged server-only sync path |
| Server read models (`authoritative-roster-server`, `card-publication-read-model`, `market-value-read-model`, `owner-approved-market-value-binding-server`, `player-profile-official-server`, `player-season-statistics-server`, `post-season-history-server`, `renewal-center-server`, `official-league-table-server`) | normalized source joins and effective editorial state | server admin client | unchanged server-only readers; public callers receive their specific DTOs |
| Scripts (`audit-touchline-england-player-season-statistics`, `export-touchline-canonical-roster-readonly`) | QA audit/export | locally authorized server client | unchanged non-browser script boundary |
| `POST /api/players/search-and-build-card` | legacy automatic card search | route is fail-closed (`410`) before any source/provider read | manual editorial catalog only; no active consumer of raw rows |
| Tests | source/contract assertions | local source fixtures | explicit raw-table boundary and DTO tests |

No client component directly calls these four tables. The legacy card-search
implementation remains behind its fail-closed editorial gate and is therefore
not a live table consumer.

## Explicit contracts

| Contract | Audience | Allowlisted data |
| --- | --- | --- |
| Public squad/card DTO | public Club Hub and Arena presentation | canonical player id, display name, club, position, nationality/country flag, shirt number, approved editorial card presentation, effective verified market-value state when needed |
| Public player/profile DTO | player profile | canonical identity, public club/membership, approved editorial presentation, effective verified market value only |
| Market DTO | authenticated Market | published card/inventory state, approved tier, nominal price and effective verified valuation only when required |
| Fixture/live DTO | public Live | persisted fixture, score and status fields only |
| Foundation diagnostic DTO | owner session or server job | canonical identifiers, display/name/club/season/membership and reconciliation counts; excludes provider IDs/payloads, raw valuation/currency, contract date and sync error text |

`RAW PROVIDER VALUE` remains distinct from `TOUCHLINE EFFECTIVE MARKET VALUE`.
Only a verified TouchLine market-value record may enter a public player or
market DTO.

## QA migration and rollback

Migrations: `20260820055004_qa_raw_football_data_browser_boundary.sql`,
`20260820060148_qa_raw_football_trigger_execute_boundary.sql`, and
`20260820061016_qa_raw_football_service_role_minimum_grants.sql`

Before:

- `authenticated SELECT USING (true)` policies existed on all four tables.
- `authenticated` held direct `SELECT` grants.

After:

- RLS is enabled and forced on all four tables.
- Every existing policy on each target table is removed, preventing policy-name drift.
- `PUBLIC`, `anon` and `authenticated` have all table privileges revoked.
- `service_role` retains only `SELECT, INSERT, UPDATE, DELETE` needed by server sync/read paths; inherited `TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked.

Rollback is intentionally not run automatically. If an approved QA rollback is
needed, restore the exact pre-migration policies/grants from migration `013`,
re-run the privilege audit, and re-validate all public DTO consumers first.
Do not apply that rollback to Production as part of this QA mission.

## Required post-apply evidence

1. catalog/RLS audit shows `relrowsecurity=true`, `relforcerowsecurity=true`,
   zero policies, no `anon`/`authenticated` privileges and service-role CRUD on each table;
2. direct anon/authenticated `SELECT` attempts fail for each table;
3. an authenticated user cannot invoke an RPC that returns raw table records;
4. owner diagnostic and `service_role` sync read succeed;
5. public squad, Club Hub, Arena, Live and Market routes keep their DTO contracts.
