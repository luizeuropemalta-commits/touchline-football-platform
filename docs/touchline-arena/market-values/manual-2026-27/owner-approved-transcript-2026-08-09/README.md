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
node scripts/build-owner-approved-transcript-staging.mjs --write
```

## Offline canonical-roster reconciliation

`reconcile-owner-approved-transcript-market-values.mjs` never opens a network
connection, database client, provider client, or product API. It can consume a
separately delivered local JSON export with the exact schema
`touchline-canonical-roster-export-v1` and the four-way proof required for a
review candidate: canonical player UUID, numeric Sportmonks player ID, current
club/team identity, and active Premier League (`provider_competition_id=8`)
membership.

Without that versioned local export, generate the honest blocked report only:

```sh
node scripts/reconcile-owner-approved-transcript-market-values.mjs --write --allow-unavailable
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
