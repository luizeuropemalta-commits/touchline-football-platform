# Data and fail-closed policy

## Identity and source

- Provider IDs identify external football facts; TouchLine UUIDs preserve internal identity and history.
- Never match a player by name.
- A social draft reads persisted, current-season, fixture-specific data; it does not call the provider from a public renderer.
- No cross-fixture borrowing is allowed.
- A public card requires the canonical published Card Engine presentation and correct active fixture/season membership.
- Ratings, TouchLine Points and coach points are distinct values and must never be substituted for one another.

## Mandatory failures

Return `REVIEW_REQUIRED` or no draft for any incomplete XI/bench, duplicate ID/position, team mismatch, missing shirt, stale source, unpublished card, invalid formation, absent venue/Gameweek, score/event mismatch, missing final rating, unavailable immutable object or failed checksum.

No visible placeholder may pretend to be official. Geometry placeholders are allowed only in the explicitly neutral, non-publishable QA template documented in [Visual standard](VISUAL_STANDARD.md).

## Privacy and wording

Public artefacts contain only approved presentation data. Tokens, internal source payloads, provider/API names, service-role access, Admin identities and signed private URLs must never enter artwork or captions.

Executable references: [`social-lineup-draft-server.ts`](../../../lib/touchlineArena/social-lineup-draft-server.ts), [`social-final-score-draft-server.ts`](../../../lib/touchlineArena/social-final-score-draft-server.ts), [`social-artifact-storage-core.ts`](../../../lib/touchlineArena/social-artifact-storage-core.ts).
