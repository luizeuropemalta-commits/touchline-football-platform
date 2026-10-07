# Legacy Arena code removal inventory — 2026-10-07

AUDIT ONLY. User authorization reported by root: retire components exclusive to the removed Arena, preserve current intro/site/Market. No source, tests, media or stored data changed. This receipt is the exclusive write surface.

## Method / boundaries

Inspected every `lib/touchlineArena/arena-*.ts` name against references in app/components/lib/tests/scripts and inspected relevant exports, import dependencies and mixed test consumers. Filename-reference search includes type imports and source-reading tests; direct symbol searches were used for camera and onboarding helpers. This is a source-bound static inventory, not an exhaustive proof against arbitrary runtime-computed imports outside those roots. No database, build or browser executed. Prefix Arena is NOT a removal criterion.

## Exclusive code retirement candidates

| Module | Current consumers observed | Retirement boundary |
| --- | --- | --- |
| lib/touchlineArena/arena-formation-video-layout.ts | tests/touchline-arena-433-video-layout.test.mts only | Entire module: three camera IDs/timings, coordinate maps, manual camera IDs, seeking helpers, viewport classifier, slot projection. No app/component/lib consumer found; module has no imports. Retire its dedicated test with historical ledger, not as a silent skip. |
| lib/touchlineArena/arena-save-intent.ts | tests/touchline-arena-save-intent.test.mts only | Entire isolated old save-intent helper and dedicated test are candidates; do not infer current Fantasy save semantics use it. |
| lib/touchlineArena/arena-account-sync.ts | dedicated account-sync test plus mixed score-points-v2-distribution test | Candidate whole module: old identity/demo sync and roster merge. Adapt only obsolete source-read/accountSync assertions in mixed test; preserve authoritative roster, settlement and rating provenance checks. Imports include shared arena-lineup types, persistence namespace, demo-data and market-inventory: none are cascade-delete targets. |
| lib/touchlineArena/arena-club-registry-adapter.ts | dedicated canonical-club-registry test and mixed live-coaches test | Candidate whole compatibility adapter. Keep actual club-registry.ts. Mixed live-coaches test has one obsolete Arena selector test/import; preserve the separate20-club current England selectable-club/coach tests and snapshot/identity cases. |
| lib/touchlineArena/formation-transition.ts | tests/touchline-formation-transition.test.mts only | Adjacent exclusive Club Construction helper candidate, subject to final manifest confirmation. Imports position-eligibility.ts, which remains shared. Do not confuse this old formation reconciliation with current formation-geometry or Fantasy domain. |

These candidates require a final immediate reference recheck before deletion. This audit does not perform deletion or authorize removing shared dependencies.

## Mixed onboarding module — preserve active registration

`lib/touchlineArena/arena-onboarding.ts` cannot be removed wholesale. `components/auth-form.tsx:17` imports **touchlineRegistrationEntryHref** and actual registration uses it to enter `/intro?intro=first&onboarding=market`, preserving reserved admin/visual-QA destinations and return sanitization. Keep this helper and its auth-i18n imports/behavior.

Candidate exclusive exports within that file:

- `observeTouchlineArenaOnboardingPlayback`, its local OnboardingVideo type and ONBOARDING_PLAYBACK_MS constant: only dedicated tests consume it. It measures three seconds of visible old loop playback; current TouchlineGameEntry does not import/call it.
- `touchlineArenaOnboardingHref`: only tests/touchline-arena-onboarding.test.mts and tests/touchline-auth-retired-destinations.test.mts consume it. Current entry's finish already routes directly to ClubOwner.

Test repair must be surgical: retain registration real-form composition tests, locale/returnTo sanitization, reserved administrative/QA return checks and current intro entry guarantees; retire only observer harness/cases and no-longer-consumed onboarding-Href assertions. `tests/touchline-auth-secondary-draft-render.test.mts` still supplies the active registration helper and must not lose it.

## Explicit preserve list / current consumers

- components/touchline/arena/TouchlineGameEntry.tsx + its CSS; TouchlineArenaIntro.tsx + touchline-arena-intro.module.css: current `/intro` entry, accessible controls, media lifecycle and completion→ClubOwner, not retired gameplay.
- arena-intro.ts: used by app/intro, entry/intro components, auth ambient/cinematic media and logo. Entry video remains `/touchlineArena/arena/touchline-arena-entry-20260716.mp4`. **The LOOP video constant/media is also ACTIVE:** components/auth-ambient-audio.tsx imports both videos and selects LOOP for the non-entry audio source. Do not remove the loop MP4 merely because its filmed camera geometry is retired. Source extraction/replacement for audio would be a separate implementation decision. Active sharing forbids deleting this module or media directory wholesale.
- arena-media-playback.ts: used by auth-ambient-audio and TouchlineGameEntry; depends on orientation-gate. Retain current intro/media visibility controls.
- arena-navigation.ts: used by current player/ranking pages, global-navigation and league-entry. Retain.
- arena-fixture-round.ts: used by livescores API, rankings page and match-centre. Retain.
- arena-online-hub.ts: used by `/arena/[zone]` compatibility redirects. A retired UI does not authorize breaking existing bookmarks; preserve redirect contract unless separately scoped.
- arena-persistence-namespace.ts: shared by club-owner-roster, not just old account-sync. Preserve storage namespaces/data.
- arena-shell-i18n.ts: used by components/arena-admin-shell.tsx. Admin is not exclusive retired Arena merely by name.
- formation-geometry.ts/server.ts and pitch-layout.ts: active Fantasy domain/server/Market, ClubHub, admin calibration and social lineup readers. Preserve canonical geometry and database-backed registry.
- position-eligibility.ts, club-registry.ts, demo-data.ts, market-inventory.ts, football-data/arena-lineup.ts and authoritative-roster-server.ts: dependencies mentioned by old modules but shared current product/domain boundaries. Do not cascade-remove.
- Audit Studio onboarding surfaces are distinct mock audit routes, not evidence of old runtime consumers. Their removal is a separate UI scope decision, not inferred from the word onboarding.

## Tests and evidence that must remain honest

The old browser canonical-club-registry and arena-mobile-visual specs reference retired UI, as documented in the prior browser-contract receipt. Root confirmed the new user authorization resolves their former retirement decision dependency. Exact first retirement batch can therefore include these four files: `lib/touchlineArena/arena-formation-video-layout.ts`, `tests/touchline-arena-433-video-layout.test.mts`, `tests/browser/touchline-arena-canonical-club-registry.spec.ts`, and `tests/browser/touchline-arena-mobile-visual.spec.ts`. This inventory does not replace them with reduced static coverage. Record exact removed names/counts and rationale; do not claim the subsequent smaller suite exercises old behavior. Preserve new current public-launch intro/rotation coverage and existing current XI behavior/geometry tests. Additional candidates above require root's explicit batch manifest, especially surgical shared-test edits.

## Suggested safe implementation order for root

1. Recheck current import/symbol consumers and freeze an exact module/export/test manifest. Record before hashes and recoverable source checkpoint; media cleanup remains separate and recoverable.
2. Remove isolated video-layout/save-intent code with dedicated historical tests; split obsolete observer exports from active registration in the mixed module.
3. Remove adapter/account-sync only with surgical mixed-test updates preserving live coach and scoring provenance checks. Consider formation-transition only after root confirms the adjacent candidate belongs in this removal batch.
4. Verify missing imports, focused current auth/intro/Market/XI tests, typecheck/lint, full suite and build under root's serial resource policy. No DB changes, namespace migration, data deletion or production action.

MISSION: read-only legacy code inventory. SCOPE: camera/onboarding and arena-prefixed helper consumer graph. FILES CHANGED: this receipt only. FUNCTIONAL/VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not executed. TESTS/BUILD: not executed. QA/DEPLOY: not evaluated. REMOTE BUILDS:0. OPEN FINDINGS: final removal manifest/recovery checkpoint and live reference recheck required. PRODUCTION: NOT TOUCHED.
