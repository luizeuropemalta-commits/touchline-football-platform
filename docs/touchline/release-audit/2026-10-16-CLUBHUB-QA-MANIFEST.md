# Current ClubHub candidate — QA only

Owner authorization: deploy the current site to QA, then investigate missing cards through the existing owner/admin workflow. One Git-native build authorized; zero consumed for this candidate. Production is excluded.

Repository: `/Users/luizlopez/Developer/touchline-release-candidate-20261007`; branch `qa`; baseline `b4b2d3480a46f963f9c59c49455a9c888629fec0`.

Objective: publish the tested current ClubHub covers/channels, responsive header, local login origin correction, hydration-safe dates, decorative-motion correction and localized profile labels. No new database migration, publication cutover, price change, checkout, gameplay change or language-gate activation.

## Exact task-owned manifest

```text
CURRENT_EXECUTION_LEDGER.md
CURRENT_STATE.md
app/touchline-clubs/[club]/page.tsx
components/touchline/ClubHubOfficialChannel.module.css
components/touchline/ClubHubOfficialChannel.tsx
components/touchline/TouchlineBrandHeader.module.css
components/touchline/TouchlineDecorationMotion.tsx
components/touchline/match-centre/TouchlineMatchCentre.tsx
lib/server/login-request-security.ts
lib/touchlineArena/arabic-fixture-date.ts
lib/touchlineArena/club-official-channels.ts
lib/touchlineArena/i18n.ts
lib/touchlineArena/locale-catalogues/core-drafts.ts
lib/touchlineArena/match-centre.ts
lib/touchlineArena/verified-timestamp-label.ts
lib/touchlineArena/visible-decoration-motion.ts
tests/auth-login-request-security.test.mts
tests/touchline-club-channel-touch-browser.test.mts
tests/touchline-club-official-channels.test.mts
tests/touchline-core-editorial-corrections.test.mts
tests/touchline-de-core-draft.test.mts
tests/touchline-eight-locale-drafts.test.mts
tests/touchline-live-fixture-status-i18n.test.mts
tests/touchline-live-header-composition.test.mts
tests/touchline-live-rail-date-i18n.test.mts
tests/touchline-match-centre-date-i18n.test.mts
tests/touchline-match-centre-draft-propagation.test.mts
tests/touchline-match-centre-i18n.test.mts
tests/touchline-tr-core-draft.test.mts
tests/touchline-verified-timestamp-label.test.mts
tests/touchline-visible-decoration-browser.test.mts
tests/touchline-visible-decoration-motion.test.mts
docs/touchline/release-audit/2026-10-16-CLUBHUB-QA-MANIFEST.md
```

Excluded and preserved: untracked `public/touchline-maintenance.html`, `public/touchline/club-channels/manchester-city-membership-cutout-v2.png`, `public/touchline/club-channels/manchester-city-membership-hero.png`; all secrets, caches and generated build files. Manchester City uses the already tracked original v3 cutout.

## Gates and acceptance

Full gate log: `/tmp/touchline-deploy-request-gate-20261016.log`, exit 0; 5,294 tests, 5,280 passed, zero failures, 14 explicit skips. TypeScript/lint passed (8 existing warnings). Latest QA-configured optimized build: `/tmp/touchline-twenty-memberships-build-20261016.log`, passed. Subsequent product source unchanged; keyboard test refined and included in final full gate. Independent fresh read-only diff review by qa_release_review found no residual P0/P1/P2. Physical-device and authenticated customer/admin proof remain pending and are not inferred from component tests.

Scoped CLI name/scope inspection confirms required Auth, QA Supabase, deployment mode, card gate and coordinated Sportmonks variables at Preview (qa). No environment values changed. Scoped pending-build check returned an empty list. Git remote qa still equals the baseline; normal authenticated Git access works.

Target alias: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`. Existing Preview READY rollback deployment: `dpl_9gHDqYUURcYLomQZyLnwJxVh1pKs`, URL `https://touchline-arena-official-lppp8yuv5-fifa-agent-plataform.vercel.app`. CLI inspection confirmed this alias target; connector credentials lack this scope, so use the already authenticated scoped CLI without credential changes.

Freeze SHA after successful gates; require a clean release checkout, explicit Preview/qa env metadata, no queued/building duplicate and only one push to `qa`. After READY, verify exact SHA/alias, public and protected-route behavior, rendered covers, logs and authorized admin context. Roll back QA only to the recorded prior Preview deployment if this release introduces a critical regression; no force push, Production promotion or database changes.

Known deferred data work: one missing Sportmonks identity and stale canonical roster mappings cause named card placeholders; preserve the last official lineup. Investigate via the owner's existing admin workflow after deployment, as requested. Six incomplete locale drafts remain gated. These are not represented as functional acceptance.
