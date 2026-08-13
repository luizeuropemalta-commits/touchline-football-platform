# TouchLine production card cutover — explicit task-owned manifest

Date: 2026-08-13

Canonical baseline: `de9dc03db3a910def273fe0f8fd6e69373b60b14`

Repository: `luizeuropemalta-commits/touchline-football-platform`

This manifest is the allowlist for the clean release candidate. It records the
source, tests, migrations and immutable evidence required by the card cutover.
It does not authorise `.env*`, secrets, caches, generated build output or any
unrelated local document.

## Publication lifecycle and manual classification

- `lib/touchlineArena/card-publication-gate.ts`
- `lib/touchlineArena/card-publication-read-model.ts`
- `lib/touchlineArena/card-publication-revert.ts`
- `lib/touchlineArena/manual-market-value-editorial.ts`
- `lib/touchlineArena/manual-market-value-bulk.ts`
- `lib/touchlineArena/editorial-card-profile.ts`
- `lib/touchlineArena/public-card-presentation.ts`
- `lib/touchlineArena/public-player-projection.ts`
- `lib/touchlineArena/card-engine.ts`
- `lib/touchlineArena/card-rules.ts`
- `tests/touchline-card-publication-gate.test.mts`
- `tests/touchline-card-publication-read-model.test.mts`
- `tests/touchline-card-publication-revert.test.mts`
- `tests/touchline-manual-market-value-editorial.test.mts`
- `tests/touchline-manual-market-value-bulk.test.mts`
- `tests/touchline-editorial-card-profile.test.mts`
- `tests/touchline-public-card-release-scope.test.mts`

## Admin publication and protected APIs

- `app/(app)/admin/manual-card-editorial/page.tsx`
- `app/(app)/admin/market-values/page.tsx`
- `app/api/admin/manual-card-editorial/route.ts`
- `app/api/admin/market-values/import/route.ts`
- `components/admin-manual-card-editorial-actions.tsx`
- `tests/touchline-manual-card-editorial-admin-boundary.test.mts`
- `tests/touchline-market-value-persistence.test.mts`

## Shared card, zoom and public presentation

- `components/touchline/cards/TouchlineEliteExactCard.tsx`
- `components/touchline/cards/TouchlineCardZoom.tsx`
- `components/touchline/cards/TouchlineCardZoom.module.css`
- `components/touchline/cards/TouchlineCardPerimeterTrace.tsx`
- `components/touchline/cards/TouchlineClubCrestPerimeterTrace.tsx`
- `lib/touchlineArena/card-zoom-details.ts`
- `tests/touchline-card-zoom-details.test.mts`
- `tests/touchline-card-zoom-scroll-integrity.test.mts`
- `tests/touchline-card-neon-trace-fixture.test.mts`

## Market, Arena, ClubHub and ClubOwner adapters

- `app/market-transfer/page.tsx`
- `components/touchline/market/TouchlineSquadBuilderStage.tsx`
- `components/touchline/market/TouchlineSquadBuilderStage.module.css`
- `lib/touchlineArena/market-read-model.ts`
- `lib/touchlineArena/market-i18n.ts`
- `app/arena/ArenaClient.tsx`
- `lib/touchlineArena/i18n.ts`
- `app/touchline-clubs/[club]/page.tsx`
- `components/touchline/ClubHubSquadGrid.tsx`
- `components/touchline/ClubHubOfficialLineup.tsx`
- `components/touchline/club-owner/ClubOwnerProfileRenderer.tsx`
- `app/touchline-players/[player]/page.tsx`
- `tests/touchline-market-read-model.test.mts`
- `tests/touchline-market-squad-builder-redesign.test.mts`
- `tests/arena-editorial-card-presentation-boundary.test.mts`
- `tests/touchline-clubhub-lineup.test.mts`
- `tests/touchline-club-owner-roster.test.mts`
- `tests/touchline-player-profile.test.mts`

## Quick Sub safety contracts

- `lib/touchlineArena/durable-quick-substitution.ts`
- `lib/touchlineArena/quick-substitution-readiness.ts`
- `lib/touchlineArena/quick-substitution-session.ts`
- `components/touchline/club-owner/ClubOwnerSubstitutionRenderer.tsx`
- `tests/touchline-durable-quick-substitution.test.mts`
- `tests/touchline-quick-substitution-readiness.test.mts`
- `tests/touchline-quick-substitution-session.test.mts`
- `tests/touchline-quick-substitution-session-ui.test.mts`

## Twenty-club visual and release gates

- `app/visual-qa/twenty-club-card-gallery/page.tsx`
- `tests/touchline-twenty-club-card-gallery-fixture.test.mts`
- `tests/touchline-twenty-club-card-assets.test.mts`
- `scripts/check-touchline-release-readiness.mjs`
- `scripts/run-vercel-release-tests.mjs`
- `tests/touchline-release-readiness-local.test.mts`
- `tests/touchline-release-build-gate.test.mts`
- `package.json`
- `pnpm-lock.yaml`

## Preview incident closure

- `lib/touchlinePreview/isolation.ts`
- `next.config.ts`
- `proxy.ts`
- `tests/touchline-isolated-preview-boundary.test.mts`
- `docs/touchline/architecture/ISOLATED_PREVIEW_BOUNDARY_2026-08-09.md`

## Database commands and immutable publication evidence

- `supabase/migrations/051_touchline_manual_card_editorial_profiles.sql`
- `supabase/migrations/052_touchline_card_publication_atomic_commands.sql`
- `supabase/migrations/053_touchline_owner_approved_533_atomic_batch.sql`
- `supabase/migrations/054_touchline_existing_verified_liverpool_29_atomic_batch.sql`
- `tests/touchline-card-publication-atomic-command.test.mts`
- `tests/touchline-owner-approved-533-atomic-batch.test.mts`
- `tests/touchline-existing-verified-liverpool-29-atomic-batch.test.mts`
- `docs/touchline-arena/audit/2026-08-11-OWNER-APPROVED-533-ATOMIC-BACKFILL-AND-CUTOVER-GATE.md`
- `docs/touchline-arena/audit/2026-08-11-LIVERPOOL-29-LIFECYCLE-PUBLICATION-APPLIED.md`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/owner-approved-card-publication-manifest.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T19-32-00Z/liverpool-existing-verified-publication-manifest.json`
- `docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md`

## Explicit exclusions

Never stage or package `.next`, `node_modules`, `tsconfig.tsbuildinfo`, cache
directories, `.env*`, credentials, local browser data or unrelated user
documents. No market value, player identity, contract, wallet or payment datum
is changed by this release manifest.
