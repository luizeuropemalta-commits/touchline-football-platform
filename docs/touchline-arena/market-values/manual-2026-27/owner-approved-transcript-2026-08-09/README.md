# Owner-approved 19-club transcript staging — 2026-08-09

This directory is a local, review-only transcription of 19 owner-assigned
`user_message` blocks. It is not a provider dataset, import instruction, or
database application.

- Input is the selected message content from
  `/Users/luizlopez/.codex/sessions/2026/08/08/rollout-2026-08-08T06-46-52-019fdfb2-003a-7fa0-aa05-6b268b203143.jsonl`.
- The generated manifest records each source JSONL line, UTC approval time,
  message SHA-256, and the ordered source-selection SHA-256. It intentionally
  does not use a whole-file hash because the session JSONL continues to append.
- No raw source message is copied here. Values remain owner-supplied input;
  they are not attributed to a provider.
- `M`, `m`, `K`, `k`, and `mil` are converted only when an explicit EUR value
  is present. Missing values remain `PENDING_VALUE_MISSING`; no value is
  represented as EUR 0 or a Ruby tier.
- Player names are normalized only to support a later review candidate. Every
  row remains without a canonical player UUID, provider player ID, club ID, or
  team ID until an independently reviewed roster/identity binding exists.
- All explicit rows, including Manchester City, are
  `REVIEW_PROVIDER_ID_MISSING` until their identities are reviewed. The
  older City CSV at
  `docs/touchline-arena/audit/2026-08-07/premier-league-market-value-staging/manchester-city-2026-27-staging.csv`
  is superseded by this owner-approved transcript and was removed after this
  staging validated. Any earlier derivative checkpoint remains historical only;
  it is not an input, comparison source, or application candidate.
- Mykhaylo Mudryk is blank in this transcript. The separately recorded owner
  decision on a provisional EUR 41.6m remains separate evidence and cannot be
  merged by name into this source batch.

Regenerate and validate locally with:

```sh
node scripts/build-owner-approved-transcript-staging.mjs --check
```

## Offline canonical-roster reconciliation

`reconcile-owner-approved-transcript-market-values.mjs` never opens a network
connection, database client, provider client, or product API. It can consume a
separately delivered local JSON export with the exact schema
`touchline-canonical-roster-export-v1` and the four-way proof required for a
review candidate: canonical player UUID, numeric Sportmonks player ID, current
club/team identity, and active Premier League (`provider_competition_id=8`)
membership.

Without that versioned local export, generate the honest blocked report only
(without writing or replacing an archive):

```sh
node scripts/reconcile-owner-approved-transcript-market-values.mjs --check --allow-unavailable
```

It records zero matches, review/pending counts by club, and no application
candidate. A unique exact normalized-name/current-club result from a future
export is still `MATCHED_EXACT_NAME_CURRENT_CLUB_REVIEW_REQUIRED`, never
`VERIFIED` or write-eligible.

No database, SQL Editor, remote sync, deployment, card inventory, tier, price,
contract, wallet, or offer action is authorized by this directory. A future
write requires reviewed UUID/provider/team/membership bindings, duplicate and
conflict resolution, an atomic guarded migration, rollback preflight, SQL
incident closure, and a separately authorized environment.

## Versioned read-only roster audit archive

**Current credential gate:** the owner has authorized a dedicated,
authenticated, non-mutating roster export. The SQL Editor incident does not
authorize any write, sync, migration, import, or deployment. The export
script therefore accepts only an explicit `--check` or `--write-new` command
and still refuses service-role semantics. The 2026-08-09 credential preflight
found no dedicated authenticated credential in the local process or worktree,
so it failed before creating a client with
`TL_ROSTER_EXPORT_READ_ONLY_MODE_REQUIRED`. See
`roster-audits/2026-08-09T18-27-31Z/read-only-export-preflight.json`.

The audit covers the 19 manual-value clubs plus Liverpool as an explicitly
out-of-manual-value-scope twentieth club. A real audit must use a dedicated
authenticated, read-only session — never a service role — and writes only
new local files. It requires the following process-only configuration names;
their values must never be recorded in an artifact or terminal output:

- `TOUCHLINE_ROSTER_EXPORT_MODE=read-only`
- `TOUCHLINE_ROSTER_EXPORT_URL`
- `TOUCHLINE_ROSTER_EXPORT_ANON_KEY`
- `TOUCHLINE_ROSTER_EXPORT_ACCESS_TOKEN` (JWT role/audience `authenticated`)

The export script performs select-only reads twice and fails if its club,
player, or active-membership revision fence changes. It will not write unless
each target is a new path and `--write-new` is explicit. Use a fresh UTC-dated
directory for every run, for example:

```text
roster-audits/YYYY-MM-DDTHH-mm-ssZ/
  canonical-roster-export.json
  owner-value-reconciliation.json
  quarantined-pending.json
  validation-results.txt
```

Example, after confirming all target files do not exist:

```sh
node scripts/export-touchline-canonical-roster-readonly.mjs \
  --output roster-audits/YYYY-MM-DDTHH-mm-ssZ/canonical-roster-export.json \
  --write-new

node scripts/reconcile-owner-approved-transcript-market-values.mjs \
  --roster roster-audits/YYYY-MM-DDTHH-mm-ssZ/canonical-roster-export.json \
  --output roster-audits/YYYY-MM-DDTHH-mm-ssZ/owner-value-reconciliation.json \
  --quarantine-output roster-audits/YYYY-MM-DDTHH-mm-ssZ/quarantined-pending.json \
  --write-new
```

The reconciliation output is review-only even for a unique player/club/ID
candidate. A DB-only active player in a manual-value club is reported only as
`QUARANTINED/PENDING` with a null value; Liverpool is
`OUT_OF_MANUAL_VALUE_SCOPE_LIVERPOOL`; and a supplied blank value remains
`OWNER_LISTED_PENDING_VALUE`. None of these labels is written to a membership
or player table.

The dated `validation-results.txt` and the canonical ledger must record the
exact commands, exit codes, test totals, export/reconciliation/quarantine
paths, source revision, and checkpoint commit. Existing staging, reports, and
historical artifacts must never be overwritten.
