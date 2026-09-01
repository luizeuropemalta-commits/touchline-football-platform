# Formats, limits and cadence

## Formats

| Placement | Size | Current status |
|---|---:|---|
| Instagram Feed | 1080×1350 (4:5) | LINE-UP renderer and worker implemented locally |
| Instagram Story | 1080×1920 (9:16) | Contract accepts the size; automatic renderer/worker not complete |
| Instagram Reel | Platform-approved export required | Not implemented; no video/audio dispatch contract |

Do not crop a Feed design into Story or Reel. Each format requires its own locked template version, safe-zone proof, decoded media validation and owner approval.

## Operational limits

- At most one generated LINE-UP publication identity per fixture + team + placement + locale + template/source version + revision.
- A fixture correction creates a new immutable revision; it never overwrites approved bytes.
- The finite worker processes a bounded candidate batch and the watcher uses singleton leases/backoff. See [`generate-touchline-social-lineup-drafts.mts`](../../../scripts/qa/generate-touchline-social-lineup-drafts.mts) and [`watch-touchline-social-lineup-drafts.mts`](../../../scripts/qa/watch-touchline-social-lineup-drafts.mts).
- External publishing cadence is zero while dispatch is disabled.
- Proposed campaign frequency must be approved editorially; do not create duplicate or low-signal posts merely because data changed.
- Continuous campaign limits and provisional labels are defined in [Continuous editorial strategy](EDITORIAL_STRATEGY.md).
- The first-party Timeline has a separate proposed retention/cadence contract in [Club Owner Timeline — design only](CLUB_OWNER_TIMELINE_DESIGN.md); it does not change Instagram behaviour.

## Timing

- MATCH PREVIEW: T-24 hours, or the reviewed configurable previous-day window,
  through kick-off. It still requires current fixture, table, ranking and both
  published club leaders. A later ranking/table revision creates a new immutable
  draft revision; it never silently updates an approval.
- LINE-UP: target T-30, but generate only after the complete verified team sheet and stability gate.
- FULL TIME: only after canonical finished state, reconciled score/events and final rating/card readiness.
- GOAL CONFIRMED Story: after official confirmation plus reviewed debounce and
  reconciliation; never while pending or under VAR review.
- RED CARD CONFIRMED Story: immediately after canonical confirmation.
- GAMEWEEK RANKING PREVIEW: before the first eligible fixture.
- GAMEWEEK RANKING FINAL: only after every scoreable fixture and settlement is
  final and the consolidated snapshot is active.
- Late data generates late or remains blocked; never use an inferred deadline to fabricate content.

The two-minute source stability gate is implemented locally in both the worker and claim RPC candidate; runtime proof remains a release gate. Automatic FULL TIME/Story/Reel scheduling remains incomplete.
