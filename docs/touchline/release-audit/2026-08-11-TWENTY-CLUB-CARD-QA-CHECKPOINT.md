# Twenty-club card QA checkpoint — 2026-08-11

## Scope

Local-only checkpoint for the canonical TouchLine England card assets and
shared static visual fixtures. It does not represent a production-page audit,
database read or deployment.

## Proven locally

- The canonical club registry contains exactly **20** unique provider team IDs.
- Every club has a crest plus all seven full, compact and zoom tier-frame
  derivatives.
- Every tier has a canonical neon accent and secondary colour.
- Static EN/PT QA fixtures use the published editorial card projection with a
  **nominal GBP** card price; they contain no player valuation, grey/pending
  placeholder or external data access.
- The shared card tests require a non-published player to be absent from game
  card surfaces, rather than receiving a fake tier/frame.
- The static fixture `/visual-qa/twenty-club-card-gallery` now renders one
  fictional published editorial card for each canonical club and distributes
  all seven tiers. It is protected, noindex and cannot access runtime data.

## Evidence

The following local checks passed on 2026-08-11:

```text
tests/touchline-twenty-club-card-assets.test.mts
tests/touchline-card-neon-trace-fixture.test.mts
tests/touchline-card-value-states-fixture.test.mts
tests/touchline-twenty-club-card-gallery-fixture.test.mts
```

Result: **12/12 passed**.

The executable local release checklist also now treats that gallery as an
explicit EN/PT visual-gate route, rather than leaving 20-club coverage outside
the release matrix. Its focused checklist/gallery/asset group passed **7/7**
on 2026-08-11. This is static-contract evidence only, not a browser claim.

The broader shared-card/Arena/ClubHub contract group passed **44/44**. It
covered the published-card boundary, public read model, ClubHub lineup, static
fixtures, canonical assets and shared perimeter trace.

### Arena field fixture correction

The static Arena field fixture was aligned with the same publication boundary
on 2026-08-11: its 11 fictional players now carry only a published editorial
tier plus the approved nominal GBP price. The fixture carries `null` legacy
valuation fields and cannot accidentally make its cards disappear after the
shared component's fail-closed unpublished-card rule. Its focused test group
passed **4/4**, including the absence of the old `€20M` placeholder.

## Still required before release approval

The local Next development server did not bind before the safe wait limit, so
there is no claimed browser observation at 390/768/1280 in this checkpoint.
The remaining visual gate is a real local-browser run of the static fixtures
and the card-bearing ClubHub surfaces at those widths, followed by native
Safari/iOS/Android observations. Do not treat this document as that proof.

No database, provider, Vercel or production action occurred.
