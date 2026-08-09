# Owner-approved manual market-value staging — 2026/27

The current local source of truth is the review-only transcript package in
[`owner-approved-transcript-2026-08-09`](./owner-approved-transcript-2026-08-09/).
It contains the 19 owner-assigned club blocks, provenance hashes, explicit EUR
values, and honest pending/review states.

The former Manchester City FootballTransfers-derived staging CSV and its
unapplied migration were removed from this candidate after the transcript
staging validated. They are historical local checkpoints only and are not an
input, comparison source, or application candidate.

No item in this directory authorizes a database import, provider request, card
tier/colour/price update, contract change, wallet operation, deployment, or
production action. A future guarded batch can only be created after exact
canonical identity and active-club-membership review for every intended row,
the SQL incident is independently closed, and the remote preflight passes.
