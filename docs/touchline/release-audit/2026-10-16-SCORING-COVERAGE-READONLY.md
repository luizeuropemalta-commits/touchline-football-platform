# QA scoring coverage — read-only investigation

10:37 UTC exact round6 diagnosis: each of10feeds has40lineup members. Missing identity37761771 occurs in Sunderland–Brighton (19722144) only. The global identity guard runs before all score writes, so this one unresolved participant blocks the next whole rebuild, including other fixtures whose IDs resolve. Do not remove the guard without a reviewed alternative preserving atomic consistency.

Eight fixtures without V4 settlements, with persisted numeric-rating entries counted by provider `rating` presence (not full scoring-readiness proof): Sunderland–Brighton31; Manchester United–Tottenham29; Liverpool–Manchester City29; Hull–Everton29; Crystal Palace–Nottingham Forest29; Coventry–Newcastle31; Chelsea–Bournemouth31; Aston Villa–Brentford30. Total239lineup rating entries across those eight fixtures. Other required stats/provenance/finality remain subject to canonical validation.

Ipswich–Fulham and Arsenal–Leeds already have52V4 settlement records each (including absent/unused). No duplicate rebuild was triggered. This isolates receipt versus aggregation failure without consuming upstream quota.

10:33 UTC round reconciliation: rounds1–5 each have10fixtures/10feeds/10fixtures with V4 settlements. Round6 has10finished fixtures and10feeds but only2fixtures with V4 settlements (60complete player records);8finished fixtures have persisted feeds without V4 settlement. This proves received-versus-calculated divergence, independent of absent/unused no-rating cases. Rounds7/8 are Not Started in QA (first kickoffs17Oct11:30UTC and23Oct19:00UTC respectively); their missing feeds/scores are not a failure at this time. Missing identity guard remains a verified blocker before rebuilding; do not bypass it or assert all8 fixtures have otherwise complete statistics without per-fixture verification.

10:29 UTC follow-up: joined all41 active-roster players without V4 summary against exact `lineups_payload[].playerId` in the60 persisted fixture feeds.0/41 appear in those persisted lineups;41/41 have no lineup evidence there. Therefore missing V4 summaries cannot currently be classified as a card-render loss or an aggregation omission for a persisted lineup. This does NOT prove they never played in real life, nor that upstream fixture coverage is exhaustive. Preserve dash until official participation/rating evidence exists. No upstream requests or data changes.

2026-10-16 10:24 UTC. QA project xgxbwqxjssxxuihuwmgy. No provider request, rebuild or data mutation.

Scope matches public projection: active squad membership, current club, matching competition8.547 distinct players:405 with V4 totalRating,101 with V4 summary but null totalRating,41 without V4 summary. Broad current_club-only query had590 rows and was deliberately not used as the public roster count.

Of101 unrated summaries:38 record0minutes/0appearances,1 records3minutes/1appearance,62 have null minutes/appearances. Null ratings are not automatically ingestion failures and must not become invented zero scores.

Previously reported2165 unavailable per-fixture score records all cite sportmonks-rating. Further classification:1187 absent,885 unused,93 short substitute appearances (45×1minute,14×2minutes,16×3minutes,18×4minutes). Thus2072/2165 are absent/unused; the count does not mean2165 failed deliveries or players. Provider rating coverage for93 short appearances still requires official evidence, not forced scoring.

Existing2996 final complete settlement records remain saved. Latest sync still partial with statistics-pending and missing identity players1/clubs0, before score writes. This global fail-closed condition is distinct from legitimate unrated appearances and remains unresolved.

Remote spot checks: Haaland totalRating36.85 and Foden27.21 match both public profile cards. Kulusevski has no V4 summary and renders dash. Romero profile probe returned no card elements; no visual verdict inferred from that probe. All checks are examples, not exhaustive card-render proof.
