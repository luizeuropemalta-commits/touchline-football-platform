# TouchLine — page-by-page customer visual audit

Date: 2026-08-10

This is a factual, incremental audit. Each page is recorded only after the
corresponding local/browser observation. It is not a release approval and it
does not make production, database, provider, roster or value changes.

## Block 1 — Arena / Quick Substitution

### Scope and environment

- Local production build only:
  `http://127.0.0.1:3106/visual-qa/quick-substitution-readiness?lang=en-GB`.
- Static deterministic fixture; it uses no account, provider, database or
  network-backed roster.
- Browser viewport actually observed: **1280 × 720** desktop.

### Observed pass conditions

- The fixture rendered a complete synthetic sheet: **35/35** squad,
  **20/20** matchday and **9/9** bench; the pitch held eleven cards.
- The pitch cards, coach slot, selected-player rail, bench and reserve vault
  remained within the viewport. `documentElement.scrollWidth` and
  `body.scrollWidth` were both **1280**, equal to the viewport width: no
  horizontal overflow was observed.
- The lower bench/reserve panel remained readable after scrolling its own
  action surface; it did not create page-level horizontal overflow.
- EN text was observed. The focused no-reentry/readiness/pitch suite passed
  **23/23**, including the rule that an outgoing player is no longer a
  selectable bench player in the browser-session projection.

### Observed product gaps — not changed in this audit

1. With a full 4-3-3, the currently inspected bench deck exposes multiple
   cards as `Locked` with `4-3-3: slot full`. It does **not** give the intended
   premium guidance: a selected reserve followed by a strong, compatible
   target highlight on the field.
2. The current product surface is still the standalone Training Centre panel.
   It does **not** yet implement the separately described inline Arena flow in
   which the premium score rail is replaced temporarily by coach + nine
   substitutes and returns after confirmation.
3. This block has not observed a native 390px/768px browser viewport or native
   Safari/iOS/Android. Those remain external device gates; no claim is made
   for them from the desktop fixture.

### Integrity boundaries

- No roster, account, card, contract, match, database, provider, credential,
  deployment or value state was changed.
- The fixture's 35 players are synthetic QA data and do not represent
  `jl_nenelopes10` or another customer account.

### Evidence

- `app/visual-qa/quick-substitution-readiness/page.tsx`
- `app/arena/ArenaClient.tsx`
- `tests/touchline-quick-substitution-readiness.test.mts`
- `tests/touchline-quick-substitution-session-ui.test.mts`
- `tests/touchline-durable-quick-substitution.test.mts`
- `tests/touchline-canonical-pitch.test.mts`

## Block 2 — Live / Match Centre

### Scope and environment

- Local production build only: `/live?lang=pt-BR` and `/live?lang=en-GB`.
- No credentials were present, so the page exercised the intentional
  no-canonical-fixtures state rather than a fabricated live match.
- Browser viewport actually observed: **1280 × 720** desktop.

### Observed pass conditions

- PT-BR rendered the explicit `Agenda em atualização` state with zero
  confrontos and a clear explanation that canonical fixtures are pending.
- EN rendered the equivalent `Schedule updating` state. The navigation and
  Match Centre hierarchy remained coherent in both languages.
- Both routes had `documentElement.scrollWidth` and `body.scrollWidth` equal
  to **1280**, matching the viewport: no horizontal overflow was observed.
- The empty state is honest: no result, date, opponent, score or leader was
  invented in the absence of the persisted schedule.
- Focused fixture/live-boundary/motion suite passed **11/11**. In particular,
  the public schedule endpoint is read-only and rejects POST.

### Limit / next verification

- No persisted local fixture was available, so a populated live-score card,
  score transition, team crests and final-result layout were not visually
  observed. Those require a separately available canonical snapshot; they
  must not be simulated as production evidence.
- Native mobile/tablet and Safari/iOS/Android remain external visual gates.

### Evidence

- `tests/touchline-match-centre.test.mts`
- `tests/touchline-canonical-fixture-schedule.test.mts`
- `tests/touchline-public-persisted-live-boundary.test.mts`
- `tests/touchline-public-motion-accessibility.test.mts`

## Block 3 — Club Owner public profile

### Scope and environment

- Local production build only: `/club-owner/luiz-lopez?lang=pt-BR` and
  `/club-owner/luiz-lopez?lang=en-GB`.
- Public profile surface only; no authenticated owner controls or account data
  mutation was used.
- Browser viewport actually observed: **1280 × 720** desktop.

### Observed pass conditions

- PT-BR and EN rendered the owner hero, portrait, navigation, Best of the
  Week card and standings hierarchy without horizontal overflow; both document
  and body widths were **1280**.
- The circular owner portrait trace stayed on the portrait perimeter in the
  observed desktop render and did not cross the face/photo crop.
- Profile card presentation remained readable and retained its explicit
  `PENDENTE` / `PENDING` market status rather than presenting a fabricated
  value or commercial tier.
- The profile's internal squad table is its own scroll surface; it does not
  expand the page horizontally at the observed desktop viewport.
- Focused portrait/neon/motion suite passed **8/8**, including fixed green,
  pointer safety and reduced-motion static perimeter coverage.

### Limits / follow-up

- The public profile does not substitute for authenticated Club Owner/Arena
  operations; no claim is made about account-specific cards or contracts.
- Native 390/768, Safari/iOS and Android renderings remain external visual
  gates. The pending mobile field-name ellipsis issue remains a source-audit
  item until it is visually observed and corrected in its own authorized block.

### Evidence

- `components/touchline/social/TouchlineSocial.tsx`
- `components/touchline/social/TouchlineSocial.module.css`
- `components/touchline/club-owner/ClubOwnerProfileRenderer.tsx`
- `tests/touchline-club-owner-portrait-neon.test.mts`
- `tests/touchline-club-owner-portrait-neon-fixture.test.mts`

## Block 4 — ClubHub index and club profile

### Scope and environment

- Local production build only: `/touchline-clubs?lang=pt-BR`,
  `/touchline-clubs/manchester-city?lang=pt-BR`, and the static local profile
  contract fixture.
- Browser viewport actually observed: **1280 × 720** desktop.

### Observed pass conditions

- The ClubHub index is present and links to **20** club profiles. It does not
  force the visitor directly into Manchester City: the top ClubHub navigation
  reaches the club chooser and the profile itself offers `Todos os clubes`.
- The City profile presents real club identity, an explicit official-value
  `Em atualização` state, honours, and Next Match before matchday content.
  With no local canonical squad it honestly says `Elenco em sincronização`;
  it does not invent an XI, coach or bench.
- The technical area visibly fails closed: `0/9` and nine named waiting slots
  are shown until an official complete match sheet is available.
- The live local profile cannot render a table without its canonical roster
  projection, so it honestly renders `temporariamente indisponível` rather
  than inventing positions.
- The static local contract fixture independently rendered an exact confirmed
  **11 + 9** sheet, full names on up to two readable nameplate lines, a
  confirmed technical area, an outside-match roster, and an initial official
  table with **20** tied rows (`—`, all neutral statistics/zero points).
  The observed section order was XI → technical area → outside-match roster →
  official league table.
- All inspected views had `documentElement.scrollWidth` and `body.scrollWidth`
  equal to **1280**. Focused ClubHub, fixture and official-table suite passed
  **27/27**.

### Observed queue item — not changed in this audit

- The honours carousel still reveals a partially entering/leaving trophy tile
  at the edge during its track. Luiz's requested transition rule — outgoing
  trophy fully exits before the next starts — remains a queued, separate
  visual change. It was not changed here.

### Limits

- The real profile's local unavailable-state does not prove a live DB-backed
  11 + 9 sheet; the static fixture proves only presentation contract.
- Native 390/768 and Safari/iOS/Android remain external visual gates.

### Evidence

- `app/touchline-clubs/page.tsx`
- `app/touchline-clubs/[club]/page.tsx`
- `app/visual-qa/clubhub-profile-contract/page.tsx`
- `components/touchline/TouchlineOfficialLeagueTable.tsx`
- `tests/touchline-clubhub-profile-order.test.mts`
- `tests/touchline-clubhub-lineup.test.mts`
- `tests/touchline-clubhub-profile-visual-fixture.test.mts`
- `tests/touchline-official-league-table.test.mts`

## Block 5 — TouchLine cards, frames, crests and motion

### Scope and environment

- Local static visual fixtures only:
  `/visual-qa/card-value-states?lang=pt-BR|en-GB` and
  `/visual-qa/card-neon-trace?lang=pt-BR`.
- Browser viewport actually observed: **1280 × 720** desktop.
- These fixtures deliberately carry no account, roster, provider, contract or
  database data.

### Observed pass conditions

- The value-state fixture rendered all three canonical cards with artwork:
  verified (explicit EUR and commercial price), pending (explicit pending,
  no nominal card price) and active contract (stored Emerald price authority).
  It showed **3** art frames and no neutral blank frame fallback.
- PT-BR and EN value-state copy both loaded; EN exposed the reviewed
  `verified` and `pending` presentation states. No horizontal overflow was
  observed: document and body widths were **1280**.
- The perimeter fixture rendered both shared implementations — player and
  coach — with two card traces and two club crests. Computed animation was the
  calm **8 s**, infinite perimeter cycle on both traces; the visual check was
  repeated after seven seconds with no clipping or flicker observed.
- The fixture description and tests confirm the reduced-motion contract:
  a static illuminated outline, not a travelling trace. Interactive data,
  card persistence, ranking subscriptions and provider access are disabled.
- Focused cards/neon/accessibility/motion suite passed **50/50**.

### Limits

- This validates shared visual presentation and the explicit pending/active
  boundaries, not a real market-value application. It must not be read as
  proof that the 533 owner-approved values are in the database.
- Native 390/768 and Safari/iOS/Android remain external visual gates.

### Evidence

- `app/visual-qa/card-value-states/page.tsx`
- `app/visual-qa/card-neon-trace/page.tsx`
- `components/touchline/cards/TouchlineEliteExactCard.tsx`
- `components/touchline/cards/TouchlineCoachCard.tsx`
- `tests/touchline-card-value-states-fixture.test.mts`
- `tests/touchline-card-neon-trace-fixture.test.mts`
- `tests/touchline-neon-identity-regression.test.mts`
- `tests/touchline-public-card-release-scope.test.mts`
