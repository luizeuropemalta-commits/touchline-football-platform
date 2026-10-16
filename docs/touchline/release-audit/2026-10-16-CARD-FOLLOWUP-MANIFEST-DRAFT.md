# Card follow-up — draft manifest, LOCAL ONLY

Base: qa / 509b9efe84a2dd319b153c8b5babc70848449f11. No immutable candidate yet.
Target if subsequently authorized: QA only. No commit/push/deploy executed.

Product scope:
- lib/football-data/player-identity-recovery.ts
- lib/football-data/player-season-statistics-store.ts
- supabase/migrations/20261016110913_touchline_guarded_player_identity_recovery.sql
- app/api/football-data/provider-diagnostic/route.ts (new owner/QA guarded exact-player lookup; no persistence)
- app/rankings/touchline-tables.module.css
- app/touchline-players/[player]/page.tsx
- components/touchline/ClubHubOfficialLineup.module.css
- components/touchline/ClubHubSquadGrid.module.css
- components/touchline/cards/TouchlineEliteExactCard.tsx
- lib/touchlineArena/card-engine-batch-server.ts

Tests:
- tests/touchline-player-identity-recovery.test.mts
- tests/touchline-player-identity-recovery-pglite.test.mts
- tests/touchline-player-season-statistics-pagination.test.mts
- tests/touchline-player-identity-diagnostic.test.mts
- tests/touchline-player-identity-diagnostic-runtime.test.mts
- tests/touchline-card-crown-surface-envelope.test.mts
- tests/touchline-card-engine-editorial-control-plane.test.mts
- tests/touchline-player-leader-crown-presentation.test.mts
- tests/touchline-player-profile-auth-concurrency.test.mts
- tests/touchline-player-profile-ranking-concurrency.test.mts
- tests/touchline-profile-page-draft-integration.test.mts
- tests/touchline-card-award-gallery-alignment.test.mts
- tests/touchline-card-engine-cache-transition.test.mts
- tests/touchline-player-profile-approved-country.test.mts
- tests/touchline-ranking-award-track-alignment.test.mts

Documentation must be selected separately after review; no blanket staging of audit directories.
Explicitly excluded: tsconfig.tsbuildinfo, all .env/secrets, .next, node_modules, temporary browser captures, QA roster bootstrap SQL, existing market/card-review evidence directories unless separately reviewed, public/touchline-maintenance.html, and both untracked Manchester City membership images. Exclusion does not authorize deletion.

Evidence: verify:release exit0, 5291 PASS/0 FAIL/14 SKIP (5305 total); isolated local build exit0. ClubHub leader geometry40 cases; Ranking8 cases with desktop/portrait captures inspected. Not proof of all product hosts, native mobile Safari, remote exact-SHA behavior or whole-mission completion.

Pending: independent review, remaining host checks, immutable clean candidate and exact manifest hashes, deployment authority/budget confirmation, exact-SHA remote validation. Existing QA stays509b9efe. Rollback reference remains deployment dpl_9gHDqYUURcYLomQZyLnwJxVh1pKs / b4b2d3480a46f963f9c59c49455a9c888629fec0; revalidate before any use. No automatic rollback or Production action authorized by this draft.
