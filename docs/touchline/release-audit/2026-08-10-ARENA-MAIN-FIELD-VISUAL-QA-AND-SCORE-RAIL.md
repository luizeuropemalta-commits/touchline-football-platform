# Arena main field visual QA and premium score rail

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Create a deterministic, no-data visual surface for the Arena field before
changing interactive Arena behaviour, and apply the approved small correction
to the real premium score rail: this surface shows teams plus live/final state,
not calendar dates.

## Local correction

- Added `/visual-qa/arena-main-field`, an admin-gated static fixture with a
  synthetic 4-3-3, eleven player cards, one technical coach card, and two
  premium result examples.
- The fixture has explicit `390`, `768`, and `1280` **real-width iframe**
  variants and EN/PT copy. Each frame is rendered at its named CSS viewport
  width rather than scaled inside a desktop-width iframe. It mounts no
  `ArenaClient`, makes no request, does not use browser storage, and cannot
  select, drag, save, or mutate a lineup.
- Its eleven player values and coach are deliberately synthetic fixture data;
  they are not evidence that any owner-approved value batch has been applied.
- Future fixtures in the real Arena rail now produce the neutral `Next`
  status. The existing display helper localizes that to `Next` / `Próximo`.
  Live status, a confirmed final result, and a verified score remain intact.
- Dates and kick-off times continue to belong to Live / Match Centre; neither
  was changed there.

## Browser observations actually made

Local browser inspection used the static fixture, not an authenticated or
provider-backed Arena route.

| Viewport / locale | Cards | Geometry | Rail copy |
| --- | ---: | --- | --- |
| 1280 / EN and PT | 11 + coach | all 11 visually inside pitch; zero visible intersections; outer page has no horizontal overflow | `LIVE · 63′` / `AO VIVO · 63′`, `FT` / `FINAL`; no date |
| 768 / EN and PT | 11 + coach | all 11 visually inside pitch; zero visible intersections; outer page has no horizontal overflow | same verified state-only copy |
| 390 / EN and PT | 11 + coach | all 11 visually inside pitch; zero visible intersections; outer page has no horizontal overflow | same verified state-only copy |

- The local browser measured iframe widths of exactly `1280`, `768`, and
  `390` CSS pixels. The 1280 frame remains internally scrollable only when
  inspected from a narrower outer page; it does not widen that page.
- The player-card name treatment is clip/fitted, never an ellipsis; the
  fixture contains no `text-overflow: ellipsis` rule.
- Keyboard focus has an explicit field-card outline in the fixture.
- The fixture adds no restrictive `touch-action`; it therefore does not claim
  to resolve the separate real-Arena pinch/drag interaction finding.
- The coach frame is a local static asset and was visually observed loaded on
  desktop after its normal image decode.

## Boundaries preserved

- No database, provider, sync, migration, value, card price/tier, contract,
  ranking, credential, account, roster or deployment configuration was read
  or changed.
- This block does **not** put Quick Sub inside the live Arena rail, alter the
  no-reentry protocol, or invent a real roster. Those remain separate product
  and authority work.
- Native Safari/iOS/Android visual testing remains an external device gate;
  no such device result is claimed.

## Validation

- Focused fixture and rail source tests: **5/5 passed**.
- Full local suite: **846/846 passed**.
- Strict TypeScript, ESLint, Webpack production build and `git diff --check`
  passed.

## Evidence

- `app/visual-qa/arena-main-field/page.tsx`
- `app/visual-qa/arena-main-field/arena-main-field.module.css`
- `tests/touchline-arena-main-field-visual-fixture.test.mts`
- `tests/touchline-arena-premium-score-rail.test.mts`
- `app/arena/ArenaClient.tsx`
