# TouchLine recovery release gate — `3eb163da`

**Decision: PREVIEW = NO-GO · PRODUCTION = NO-GO**

This is a release-audit record for a persistent local checkpoint. It is not a
deployment approval and it supersedes no historical deployment evidence.

## Candidate provenance

| Field | Evidence |
| --- | --- |
| Persistent worktree | `work/touchline-public-release-audit-recovery-20260809` |
| Branch | `work/public-release-audit-recovery-20260809` |
| Candidate commit | `3eb163da74e43977aecbfbbbb35cdd3b30d27cb1` |
| Base commit | `a2dce1a9a18ee084c7201ac9f80aa6e275b99aa7` |
| Candidate tree | `e3a03351308406a809e32c4be7d22b9d20246903` |
| Checkpoint chain | `6a7da6bf` public ClubHub/locale → `ba71e48c` durable Quick Sub protocol → `df0ec7a` static no-go → `3eb163da` rendered UI-integration gate |
| Remote operations | None: no deploy, Preview, database query/write, sync, import, payment, or migration |

The worktree was clean before this audit artifact was started. Generated build
output is excluded from the candidate contract.

## Included checkpoint scope

- Exact approved-locale registry: `en-GB`, `pt-BR`, `es-ES`, `it-IT`,
  `fr-FR`, `ar-SA`, `tr-TR`, `de-DE`.
- Fail-closed locale behaviour: only complete human catalogues (`en-GB` and
  `pt-BR`) render; the other six canonicalise to English instead of being
  presented as translated.
- A human locale-review contract, an honest 20-club pre-season table state,
  and a static seven-category coach-card framework in Club Hub.
- A pure, no-I/O durable Quick Substitution protocol and tests. It defines
  the future server contract only; it is not connected to the Arena UI, an API,
  browser storage, or a database.

The candidate does **not** include an Arena UI integration, a fixture-rail
replacement, Admin construction, migrations, a public Central, market-data
application, payment behaviour, a Vercel project link, or deployment config.

## Local validation recorded for this audit

The following no-server, no-network focused test command completed successfully
against this checkpoint on 2026-08-09:

```text
node --test --experimental-strip-types \
  tests/touchline-durable-quick-substitution.test.mts \
  tests/touchline-locale-catalog-review-contract.test.mts \
  tests/touchline-public-locale.test.mts \
  tests/touchline-official-league-table.test.mts
```

Result: **23 passed, 0 failed**. `git diff --check` also passed. This focused
evidence validates only the local protocol, locale contract and table model; it
does not replace a full suite, application typecheck, production build or
rendered release QA.

## Release-gate matrix

| Gate | Evidence at this SHA | Result |
| --- | --- | --- |
| Immutable checkpoint | Persistent worktree and committed chain; exact base/tree recorded above. | PASS for local checkpoint only |
| Exact eight human locales | Six catalogues (`es-ES`, `it-IT`, `fr-FR`, `ar-SA`, `tr-TR`, `de-DE`) do not exist or lack human review. Arabic RTL has not received route/device QA. | BLOCKED |
| Arena Quick Sub experience | Rendered audit found the control still navigates to `/club-owner/me/substitution`; current client swaps the outgoing player back to the bench and saves roster state. The durable protocol is not wired. | BLOCKED |
| Durable match authority | No server-owned match snapshot, frozen 11+9 matchday state, event ledger, revision, idempotent command endpoint, correction policy, or persisted canonical round pointer exists. | BLOCKED |
| Shared public canonical data | The official table is a server-only shared renderer but its source is a mutable five-minute cache, not an immutable server-published projection/version. | BLOCKED |
| Browser/provider/data safety | Public ClubHub can call `premier-squad`, whose current GET fetches a provider and persists a snapshot. Public player profiles, Arena rumours, authenticated livescore polling and roster refresh have equivalent provider/write paths; the layout can also post session analytics. | BLOCKED |
| Preview isolation | No verified dedicated Vercel project, project binding, strict empty credential allowlist, isolated callback policy, or effective Preview environment readback exists. | BLOCKED |
| Admin | The separate Admin candidate is not in this SHA and lacks current authenticated owner/non-owner rendered QA. | BLOCKED |
| Full release validation | No fresh full suite, lint, full typecheck, production build, or complete visual/device matrix is recorded for this SHA. | BLOCKED |

## Required evidence before any Preview or production action

1. A clean committed candidate with an exact scope manifest and no generated
   artifacts.
2. All eight approved locales human-complete, reviewed and published; every
   route must pass locale persistence, content, metadata, layout, navigation,
   accessibility, and Arabic RTL QA.
3. A server-published immutable projection contract for all shared data;
   browser/user/cookie/demo state must not construct a public ranking, table,
   result, fixture round, champion or aggregate list.
4. The remote-authorised match-state design must be implemented transactionally
   before a real-account Quick Substitution feature is exposed. Until then,
   the pure protocol remains a local contract only.
5. A separately verified dedicated Preview project, strict allowlist of
   non-sensitive environment names, isolated origin/callback rules, no
   production alias, and an independently observed Preview URL.
6. Full automated validation from that exact SHA, followed by observed
   page-by-page QA: desktop, mobile, tablet, TV-like viewport, WebKit/Safari,
   Chrome Android, keyboard, touch, reduced motion, rapid inertial scrolling,
   and native pinch zoom. Console, hydration, network and ordering/card-state
   failures are release blockers.
7. Admin must either be excluded from the public release manifest or complete
   its own owner/non-owner integration and visual audit; it cannot be inferred
   from a different worktree.

## Static public-data boundary evidence

The following current runtime paths make a normal Preview or browser QA unsafe
under the remote-data freeze:

- Club Hub internally fetches `GET /api/football-data/premier-squad`; the
  handler can construct the football provider and persist a squad snapshot.
- Public player-profile resolution and the public Arena rumours route can
  construct the provider directly.
- Arena livescore polling and roster refresh can reach provider-backed routes
  that persist snapshots. A signed-in layout also records activity telemetry.
- Public table, schedule and profile readers use a server admin client; a
  Preview with inherited real credentials cannot be treated as isolated merely
  because it has a different host.
- The current audit-only proxy switch is not a project/environment binding.
  No tracked Vercel project link, strict environment allowlist, verified
  callback isolation or dedicated project identity exists. Unknown Vercel hosts
  currently resolve authentication callbacks to the production origin.

The minimum local remediation is a persisted-read-only public surface plus a
fail-closed isolated Preview mode that runs before Supabase/auth/API handling.
Provider refresh and persistence must move behind a protected job boundary. A
dedicated Vercel project and its effective non-secret environment-name readback
remain an external verification gate.

## Safe next work

The safe local sequence is: complete the static public-data boundary audit;
preserve and test the Preview-isolation design without contacting Vercel; and
maintain explicit NO-GO evidence while the human-locale and remote match-state
gates remain unresolved. No deployment or remote data operation is implied.
