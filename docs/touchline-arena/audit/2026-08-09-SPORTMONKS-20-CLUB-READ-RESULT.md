# Sportmonks direct 20-club roster read — result

**Recorded:** 2026-08-09
**Status:** `READ-ONLY SNAPSHOT COMPLETE — IDENTITY/VALUE APPLICATION STILL BLOCKED`

## Authorized execution

The existing main-worktree `.env.local` was supplied only to one ephemeral
Node process through `--env-file`. Its contents were never printed, copied,
stored in this worktree, included in a command log, or committed. The process
was cleared with `env -i` and used only `GET` requests to the official
Sportmonks HTTPS origin.

No TouchLine database connection, write, sync, migration, deployment, card
change, or value application occurred.

## Immutable local artifacts

Both generated files are preserved; neither is an export from TouchLine's
database or an application-ready value import.

| Artifact | Purpose | State |
| --- | --- | --- |
| `provider-roster-audits/2026-08-09T19-08-46-265Z/sportmonks-roster-snapshot.json` | first provider-only capture | retained historical capture |
| `provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json` | validated capture with explicit owner-name reconciliation | controlling result |

Controlling manifest SHA-256:
`b3d4d672eb35e42516ca5cad080eed8e3f4a3b8d82565b3b37dee5d9667ae94d`
Provider snapshot revision:
`c332d196ba28aaa02129eb26be97f44afca254a69c9d8f80159569609a9b4829`

The manifest was checked for literal `api_token`,
`SPORTMONKS_API_TOKEN`, raw payload, request URL and Sportmonks API origin
strings; none is present. It contains only the sanitized team/player identity
projection required for later review.

## Coverage and integrity result

| Metric | Result |
| --- | ---: |
| Expected provider teams | 20 |
| Ready teams | 20 |
| Partial teams | 0 |
| Provider roster members | 590 |
| Duplicate provider player IDs | 0 |
| Liverpool members (outside manual-value scope) | 29 |
| Non-Liverpool provider members | 561 |
| Owner transcript roster rows (19 manual clubs) | 558 |

Every requested team returned a non-empty roster. The direct reader paginates
when Sportmonks declares `has_more`; no partial, malformed or duplicate result
was accepted as ready.

| Club | Team ID | Members |
| --- | ---: | ---: |
| Sunderland AFC | 3 | 31 |
| Tottenham Hotspur | 6 | 36 |
| Liverpool FC | 8 | 29 |
| Manchester City | 9 | 32 |
| Fulham FC | 11 | 22 |
| Everton FC | 13 | 23 |
| Manchester United | 14 | 33 |
| Aston Villa | 15 | 26 |
| Chelsea FC | 18 | 41 |
| Arsenal FC | 19 | 29 |
| Newcastle United | 20 | 26 |
| Hull City | 22 | 28 |
| Crystal Palace | 51 | 28 |
| AFC Bournemouth | 52 | 29 |
| Nottingham Forest | 63 | 28 |
| Leeds United | 71 | 27 |
| Brighton & Hove Albion | 78 | 31 |
| Ipswich Town | 116 | 31 |
| Coventry City | 117 | 27 |
| Brentford FC | 236 | 33 |

## Owner-list comparison — review only

The comparison is exact normalized name within the assigned club. It is a
coverage signal, **not** a canonical player identity match and never makes a
row importable.

| Result | Count | Required state |
| --- | ---: | --- |
| Exact normalized club/name pairs | 538 | `REVIEW_REQUIRED`; not write eligible |
| Provider-only rows | 23 | `PROVIDER_ONLY_REVIEW_PENDING`, value `null` |
| Owner-only rows | 20 | `OWNER_ONLY_REVIEW_PENDING`, no provider assignment |
| Ambiguous name groups | 0 | n/a |
| Net non-Liverpool provider minus owner rows | +3 | no automatic action |

The 23 provider-only records are explicitly `PENDING`, have no manual market
value, and are `applicationEligible: false`. They are not asserted to be the
previously alleged two database extras: this direct provider snapshot did not
read TouchLine's database, memberships, or canonical UUIDs. The five
owner-supplied missing-value rows remain pending and no EUR `0` / Ruby fallback
was invented.

### Source conflict requiring explicit review

The direct Sportmonks snapshot returned provider player ID `459145`, **Bruno
Guimarães**, under provider team `20` / **Newcastle United**. This conflicts
with Luiz's product decision that Arsenal is correct. The result is retained
only as `PROVIDER_ONLY_REVIEW_PENDING`; no roster patch, sync, market value or
club assignment was made. Because the stated source-of-truth direction and
the observed provider response conflict, this must be resolved through the
full reconciliation decision path, not by a manual patch.

## Validation and next gate

Passed locally:

- `node --check scripts/export-sportmonks-twenty-club-rosters-readonly.mjs`;
- `node --test --experimental-strip-types tests/sportmonks-twenty-club-roster-readonly.test.mts` — **6/6**;
- `pnpm typecheck`;
- `pnpm lint`; and
- `git diff --check`.

The next operation remains blocked: a DB/canonical identity reconciliation
must first use an independently authorized, versioned read-only export, bind
provider player IDs to TouchLine UUID/current membership, and resolve the
Bruno source conflict. No value import or card validation may claim this
provider-only manifest as applied data.
