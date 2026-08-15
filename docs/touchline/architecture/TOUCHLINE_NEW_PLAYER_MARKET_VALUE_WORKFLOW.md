# New player and manual market-value workflow

1. A roster reconciliation detects a canonical player or transfer.
2. The player enters `detected`, then `market_value_required`; no game card is created.
3. The protected Admin queue derives one review item per unambiguous canonical
   player/current-membership, and deep-links to that exact player in the
   manual editor. It carries optional position and detection time only when
   the canonical row provides them.
4. An editor enters `NAME | AGE | VALUE` only as a review aid, selects the exact canonical player, and saves the manual EUR value.
5. The engine calculates the tier and nominal card price. The item moves through `ready_for_review` and `ready_to_publish`.
6. An explicit admin publish creates the public card projection. Any current-club or membership mismatch fails closed.

The existing pure detector is `lib/touchlineArena/new-player-card-alerts.ts`.
The current protected Admin screen is the supported immediate review
destination. The generic central inbox/preferences UI is not a durable
new-player event queue yet. Email and web-push delivery require separately
configured, authorised delivery infrastructure, durable deduplication and
explicit mobile consent; they are not simulated by this candidate.
