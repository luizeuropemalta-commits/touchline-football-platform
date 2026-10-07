# Cadastro/register visual review — 2026-10-07

## Verdict

PARTIAL, not release-ready solely from existing screenshots. Owner requested moving to Cadastro; Live remains partial and has not been silently approved. Used code-verification skill to reconcile direct image evidence against real current handlers, without editing product/harness or launching any process. Administration remains excluded and EN/PT unchanged.

## Evidence consumed, not repeated

Personally displayed and inspected all seven durable registration PNGs under `artifacts/local-verification-20261007/auth-incremental/`:

- `register-ar-SA-desktop-banner-fix-initial.png`
- `register-ar-SA-phoneLandscape-initial.png`
- `register-ar-SA-tabletLandscape-initial.png`
- `register-fr-FR-phoneLandscape-initial.png`
- `register-fr-FR-tabletLandscape-initial.png`
- `register-de-DE-phoneLandscape-initial.png`
- `register-de-DE-tabletLandscape-initial.png`

In these exact initial-state images: full form and CTA are contained; French/German long titles wrap without overlap; Arabic connected glyphs and right-aligned banner/form copy are visible, English TouchLine/ClubOwner remain intact. Vertical full-page scroll is expected, not clipping. Seven images are not seven live reruns and not proof of source freshness after subsequent shared audio work. Tiny muted terms/footer text needs quantitative contrast/zoom review; no contrast certification inferred from screenshots. Native touch and accessible focus names cannot be approved from these PNGs.

The prior22 secondary-auth report records all8 desktop registration initial states, while the durable incremental set provides the7 above and fresh Arabic banner correction. Reuse historical desktop captures once their paths and source identity are reconciled; do not re-capture merely to create a new green record. The other7 original desktop PNGs were not redisplayed in this turn.

## Coverage matrix and actual missing states

| State/risk | Existing evidence | Smallest useful next evidence |
|---|---|---|
| Initial desktop | Prior8-locale batch; Arabic corrected durable image | Reconcile original7 artifacts/source hashes, not new duplicate captures |
| Initial phone/tablet landscape | AR/FR/DE ×2 reviewed | EN/PT/ES/IT/TR ×2 =10 new images |
| Empty/invalid native form validation | None in rendered receipt | Per8 locale, required fields/email/password/terms block submission; zero provider calls; capture focused invalid state |
| Password reveal and keyboard | No recorded registration flow | Per8 locale type toggle and hide recovery, focus sequence/names, no network |
| Authentication unavailable | Current no-env client is safe unavailable | Per8 locale one desktop error screenshot with synthetic form values, no provider/API calls; screen-reader announcement check |
| Submit pending/provider failure | No rendered evidence | Requires approved snapshot-only synthetic client boundary; deferred promise + deterministic failure; no network |
| Confirmation without session | No rendered evidence | Real handler with synthetic signUp result `{data:{session:null},error:null}`, each8 desktop; show submitted synthetic email and localized confirmation |
| Resend pending/success/failure, use another email | No rendered evidence | Same synthetic boundary; exact call counters, no delivery, reset back to form and password cleared |
| Signup session/access redirect | Not safe within current guest fixture | Separate authenticated contract; no real account creation/access POST or ClubOwner automatic advance |
| Responsive post-submit, portrait/zoom | None | Longest confirmation/error AR/FR/DE phone/tablet; actual portrait boundary;200% zoom and keyboard |
| Locale persistence and returnTo | Private fixture not public route | Separate exact URL/returnTo assertions; public gate remains OFF; do not mistake fixtureLocale for account persistence |

Current source contracts: `app/(auth)/register/page.tsx` false-default private renderer and AuthForm register; `components/auth-form.tsx` lines184–217 creates client then signUp, unavailable immediately produces localized error; confirmation branch lines322–365 and resend lines299–319 are unreachable from the prior initial-only screenshots. Native constraints and terms checkbox are lines384–405. Pending button lines407 onward renders spinner but only login gets text; registration pending accessible name needs direct inspection before a finding or PASS. Error message div line406 lacks explicit alert/status role; verify actual announcement before claiming accessible error handling.

## Exact minimal remaining capture manifest (proposal, NOT written)

First increment avoids provider/mock complexity:10 missing initial responsive images +8 unavailable desktop error images +8 focused native-invalid desktop images =26 new PNGs. In those sessions also test password reveal/hide and keyboard safely, preserving no actual account/consent state. Root must approve synthetic local form interaction including its fixture-only checkbox; no real signup endpoint or terms acceptance is sent.

Proposed new snapshot-only route `/private/tmp/touchline-retirement-build-20261007.KkL7Mm/app/locale-register-fixture-local/page.tsx`; adjacent `register-renderer.tsx` is exact canonical register page except account-locale reader replaced by synthetic guest and private renderer exported. Real components/CSS unchanged. Route consumes validated `fixtureLocale`, never changes public gates. External harness `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/register-localization-capture.mjs`, strict same-origin static requests only, all APIs/remote/writes fail closed. No files created for this proposal and no second process started while Live owns slot.

Confirmation/pending/resend cannot be honestly exposed by query alone: AuthForm has no synthetic client prop. A later exact snapshot-only copy of AuthForm replacing only `@/lib/supabase/client` with a local in-memory stub, with positive call ledger and no backend/credentials, requires explicit additional manifest. Do not inject React internals, copy confirmation UI, or add fake DOM. This is an isolation requirement, not a demand for production credentials.

## Mission gate

MISSION: registration evidence audit. SCOPE:2receipts only. Functional result: current handler mapped, not executed. Visual result:7existingPNG inspected, no visible clipping in those states. Responsive:partial AR/FR/DE. Accessibility:pending live keyboard/contrast/announcement. Security:no accounts, permissions, submissions or provider requests. Browser matrix:no browser launched. Tests/build:none repeated. QA SHA/deployment/URL:not selected. Remote budget/consumed:0/0. Open findings: missing state/locale coverage and unverified pending/error accessibility. Production:NOT TOUCHED. Next page remains Cadastro until owner reprioritizes; no implicit advancement.
