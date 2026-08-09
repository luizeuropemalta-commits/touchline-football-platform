# TouchLine EN/PT local release-readiness checklist

Recorded: 2026-08-10
Status: LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL
Scope: local repository and local production build only. No Vercel API, domain,
credential, database, provider, sync, migration, Preview or deployment action
was performed.

## Purpose

This is the executable local gate for a future functional release of
https://touchline.com.br in en-GB and pt-BR. It is deliberately separate from
isolated Preview: a correctly isolated Preview serves only /preview and must
not be used as ClubHub or card product QA.

The six deferred locales remain fail-closed outside the approved EN/PT release
scope. This checklist does not enable them.

## Local route and configuration contract

| Item | Local contract | Result |
| --- | --- | --- |
| Canonical public origin | https://touchline.com.br | PASS (source contract) |
| www policy | 308 redirect to canonical origin | PASS (source contract) |
| Technical origin | https://touchline-arena-official.vercel.app | Recorded only |
| Vercel project/domain binding | No tracked project binding, alias or deploy workflow | EXTERNAL GATE |
| Functional Preview | Isolated Preview permits only /preview | Not product QA by design |

The local checker records variable names only, never values. A functional
release must separately verify the intended environment has these names without
exposing secrets:

~~~
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TOUCHLINE_AUTH_RECOVERY_SECRET
TOUCHLINE_CURRENT_SEASON
TOUCHLINE_OWNER_EMAILS
TOUCHLINE_SITE_OFFLINE
~~~

TOUCHLINE_SITE_OFFLINE must not be enabled for a functional release. Provider,
sync and payment variables (SPORTMONKS_*, FOOTBALL_DATA_*, STRIPE_*) stay absent
or disabled unless a separately approved release scope requires them. The
isolated-Preview environment names are a separate contract and must never be
copied into a functional product environment by assumption.

## Executable local sequence

Run from the immutable candidate worktree after dependency installation:

~~~
git diff --check
pnpm run check:release-readiness
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
~~~

The implementation is scripts/check-touchline-release-readiness.mjs. It
validates the package scripts, public-origin/www source contract,
isolated-Preview assertion, EN/PT visual-fixture locale boundary, and the
configuration-name template. It has no platform client, network call, runtime
environment read, credential handling or mutation path.

## Evidence recorded for this checkpoint

| Gate | Result |
| --- | --- |
| Local checklist | PASS — LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL |
| Focused release/fixture regressions | PASS — 16/16 |
| Full local test suite | PASS — 807/807 |
| pnpm typecheck | PASS |
| pnpm lint | PASS |
| Local production build | PASS — Next 16.2.11, 127 static pages generated |
| git diff --check | PASS |

The production build ran with an empty application environment and only local
Node tooling, NODE_ENV=production, and telemetry disabled. It did not load
credentials or contact a remote service. Next reported a multiple-lockfile
workspace-root warning; it did not affect compilation or build completion and
should be resolved separately, not by deleting files in this checkpoint.

## Local visual matrix still to record

The following admin-gated static fixtures accept lang=en-GB or lang=pt-BR where
language applies. They intentionally use local fixtures, not market-value,
provider, account or contract data.

| Surface | EN/PT fixture | Required viewports |
| --- | --- | --- |
| ClubHub ordering and technical area | /visual-qa/clubhub-profile-contract?lang=en-GB and ?lang=pt-BR | 390, 768, 1280 px |
| Card value states | /visual-qa/card-value-states?lang=en-GB and ?lang=pt-BR | 390, 768, 1280 px |
| Card/crest trace | /visual-qa/card-neon-trace | 390, 768, 1280 px |
| Club Owner portrait trace | /visual-qa/club-owner-portrait-neon | 390, 768, 1280 px |
| Official initial league table | /visual-qa/official-league-table-initial | 390, 768, 1280 px |

Record desktop Safari/WebKit, iOS Safari, and Chrome Android observations
separately. At every viewport confirm no horizontal overflow, readable card
text, visible focus, usable touch behavior, reduced-motion static traces,
correct ClubHub order, and English/Portuguese fixture labels. Those browser
observations have not been claimed by this checkpoint.

## Safe fixes included

- Added an EN/PT-only resolver for static visual QA and made the ClubHub and
  card-value-state fixtures render Portuguese labels when requested. Unknown
  fixture locales fail back to English; no incomplete locale becomes visible.
- Replaced two stale tests that expected retired provider-event behavior or an
  obsolete Arena live-schedule merge with assertions for the current
  fail-closed/persisted-snapshot behavior.
- Added the local release-readiness checker and regression coverage. None of
  these changes modifies product values, cards, tiers, prices, contracts,
  rankings, database state, or deployment configuration.

## Remaining release blockers and decision gates

This is not a release approval. The following remain required before a
functional public release can be called ready:

1. Pin a clean candidate commit. The current worktree has pre-existing
   generated next-env.d.ts and tsconfig.tsbuildinfo changes; they were
   preserved and are not part of this checkpoint.
2. Verify the Vercel project, production alias and effective environment by an
   authorized external release procedure. There is no tracked binding in this
   repository.
3. Finish and record the browser matrix above, including real Safari and mobile
   observations.
4. Resolve the independently recorded product gates for durable Quick Sub,
   immutable shared-data/public-read boundaries, and functional product Preview.
   This checklist did not re-audit or waive them.
5. Keep the separate owner-approved market-value application hold: the 533
   explicit EUR values are local-only until a least-privilege canonical
   UUID/membership export supports a new dry-run and explicit write decision.

## Artifact links

- scripts/check-touchline-release-readiness.mjs
- tests/touchline-release-readiness-local.test.mts
- tests/touchline-visual-qa-locale.test.mts
- docs/touchline/release-audit/RELEASE_GATE_3eb163da_2026-08-09.md
- docs/touchline-arena/audit/2026-08-09-MARKET-VALUE-APPLICATION-LOCAL-PREFLIGHT-HOLD.md
