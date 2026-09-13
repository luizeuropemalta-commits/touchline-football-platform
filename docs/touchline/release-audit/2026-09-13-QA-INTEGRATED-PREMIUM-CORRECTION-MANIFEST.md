# TouchLine QA integrated premium correction manifest

Status: LOCAL GREEN / READY TO COMMIT

Target: branch `qa`, one Git-native QA deployment only. Production is excluded.

Baseline: `f27a8780`.

Rollback: return QA to verified deployment `dpl_4Uqv89xDhbyNez9cgL5VxQBbEZaw` for `f27a8780`, stable QA URL `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`. This batch has no migration or database write.

## Included change groups

1. Card identity and published profile loading.
2. Match Centre chronological events and descending ratings.
3. Card perimeter centring and crown-safe zoom/profile envelopes.
4. Coach Profile premium information hierarchy and honest discipline facts.
5. ClubHub Next-Match-only hero, discrete stadium identity and honours carousel.
6. Unified Club Owner + Market navigation, safe compatibility route and formation-authoritative replace/remove behaviour.
7. Regression tests for each preceding contract.

## Explicit non-goals

- No Production deployment, database operation, migration, provider sync, social publication, credential or environment change.
- No Arena geometry or data-authority change in this batch.
- Social 041/042/043 require separate visual owner approval before any external delivery.

## Frozen path allowlist

Only the following paths may be staged for this candidate:

```text
CURRENT_EXECUTION_LEDGER.md
CURRENT_STATE.md
app/fantasy/FantasyGameweekClient.tsx
app/fantasy/fantasy.module.css
app/market-transfer/page.tsx
app/touchline-clubs/[club]/page.tsx
app/touchline-coaches/[coach]/page.tsx
app/touchline-players/[player]/player-profile.module.css
components/touchline/ClubTrophyCarousel.tsx
components/touchline/TouchlineGlobalNavigation.tsx
components/touchline/cards/TouchlineCardPerimeterTrace.tsx
components/touchline/cards/TouchlineCardZoom.module.css
components/touchline/cards/TouchlineCoachPerformance.module.css
components/touchline/cards/TouchlineCoachPerformance.tsx
components/touchline/club-owner/ClubOwnerProfileRenderer.tsx
components/touchline/club-owner/ClubOwnerSelfRouteRedirect.tsx
components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx
components/touchline/match-centre/TouchlineMatchCentre.tsx
docs/touchline/release-audit/2026-09-13-QA-INTEGRATED-PREMIUM-CORRECTION-MANIFEST.md
lib/football-data/public-premier-squad-server.ts
lib/touchlineArena/authoritative-roster-client.ts
lib/touchlineArena/authoritative-roster-server.ts
lib/touchlineArena/demo-data.ts
lib/touchlineArena/global-navigation.ts
lib/touchlineArena/match-centre.ts
lib/touchlineArena/ranked-card-catalog-server.ts
lib/touchlineFantasy/domain.ts
tests/arena-auth-isolation.test.mts
tests/touchline-authoritative-roster.test.mts
tests/touchline-card-overlay-admin-shortcut.test.mts
tests/touchline-card-perimeter-trace.test.mts
tests/touchline-card-zoom-crown-safe-zone.test.mts
tests/touchline-club-owner-self-routes.test.mts
tests/touchline-clubhub-profile-order.test.mts
tests/touchline-coach-contract-scoring.test.mts
tests/touchline-coach-profile.test.mts
tests/touchline-fantasy-gameweek-domain.test.mts
tests/touchline-fantasy-markt-redesign.test.mts
tests/touchline-global-navigation.test.mts
tests/touchline-golden-fixture-distribution.test.mts
tests/touchline-market-i18n.test.mts
tests/touchline-match-centre.test.mts
tests/touchline-neon-identity-regression.test.mts
```

## Local evidence

- Full tests: `1733/1733` passed.
- Build: `143/143` routes passed.
- TypeScript, Vercel input, release-readiness local checklist and diff check passed.
- Lint: zero errors; five established warnings outside this batch.

## Mandatory remote gates after commit

1. Confirm one QA deployment resolves to the exact immutable SHA.
2. Desktop and mobile visual checks for changed card, ClubHub, Coach Profile, Club Owner/Market and Match Centre surfaces.
3. Authenticated QA check for provider-card profile identity and slot replacement/removal.
4. Arena 4-3-3 and 4-4-2 across Wide, Lower and Side perspectives with loop/no-write proof.
5. Console, network and deployment-runtime logs; rollback smoke.
